import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { ensureAccount, requireVerified } from "@/lib/server/account";
import { writeAudit } from "@/lib/server/audit";
import { putBlob, getBlob } from "@/lib/server/blobs";
import { newId, nowIso } from "@/lib/agmt/ids";
import { encryptText, decryptText, sha256Hex } from "@/lib/agmt/crypto";
import { ingestBuffer, applyMap, runConfirmedProof, identifierCategoryCounts } from "@/lib/agmt/pipeline";
import { sampleShaDocx } from "@/lib/agmt/sample-sha";
import { RETENTION, INGEST_SCHEMA_VERSION, RECOGNISER_VERSION, INDEX_QUALITY_VERSION } from "@/lib/agmt/config";
import { reviewGate as computeReviewGate } from "@/lib/agmt/review-gate";
import { reviewUnsupportedReason } from "@/lib/agmt/instrument";
import { mapSha } from "@/lib/agmt/canonicalise";
import type { IndexQuality, Instrument, ProposedEntry, RepresentedParty, Stage, UserDecision } from "@/lib/agmt/types";

function envelopeToText(plain: string): string {
  return JSON.stringify(encryptText(plain));
}
function textToPlain(stored: string | null): string | null {
  if (!stored) return null;
  try {
    return decryptText(JSON.parse(stored));
  } catch {
    return null;
  }
}

export const bootstrapAccount = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const account = await ensureAccount(context.userId);
    return {
      userId: account.userId,
      email: account.emailNormalised,
      emailVerified: Boolean(account.emailVerifiedAt),
      displayName: account.displayName,
      reviewEnabled: false,
    };
  });

export const listMatters = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await ensureAccount(context.userId);
    const sql = await getSql();
    return sql<{
      matterId: string;
      name: string;
      status: string;
      createdAt: string;
      representedParty: string | null;
      stage: string | null;
      instruments: string[] | null;
      documentCount: number;
    }>`
      select m.matter_id as "matterId", m.name, m.status, m.created_at as "createdAt",
             mv.represented_party as "representedParty", mv.stage,
             mv.instruments,
             (select count(*) from document d where d.matter_id = m.matter_id and d.owner_user_id = ${context.userId}) as "documentCount"
      from matter m
      left join mandate_version mv on mv.mandate_version_id = m.active_mandate_version_id
      where m.owner_user_id = ${context.userId} and m.deleted_at is null
      order by m.updated_at desc
    `;
  });

export const createMatter = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: {
    name: string;
    representedParty: RepresentedParty;
    instruments: Instrument[];
    stage: Stage;
    mustProtectNotes?: string;
  }) => d)
  .handler(async ({ context, data }) => {
    const account = await ensureAccount(context.userId);
    if (!account.emailVerifiedAt) {
      throw Object.assign(new Error("Verify your email for Agmt before creating a Matter."), {
        code: "unverified_email",
      });
    }
    if (!data.name.trim()) throw new Error("Matter name is required.");
    if (!data.instruments.length) throw new Error("Select at least one instrument.");
    const sql = await getSql();
    const matterId = newId();
    const mandateId = newId();
    const hash = sha256Hex(
      JSON.stringify({
        p: data.representedParty,
        i: data.instruments.slice().sort(),
        s: data.stage,
        n: data.mustProtectNotes ?? "",
      }),
    );
    const notesEnc = data.mustProtectNotes?.trim()
      ? envelopeToText(data.mustProtectNotes.trim())
      : null;
    await sql.transaction(async (transactionSql) => {
      await transactionSql`
        insert into matter (matter_id, owner_user_id, name, status, created_at, updated_at)
        values (${matterId}, ${context.userId}, ${data.name.trim()}, 'active', ${nowIso()}, ${nowIso()})
      `;
      await transactionSql`
        insert into mandate_version (
          mandate_version_id, matter_id, owner_user_id, version_no, represented_party,
          instruments, stage, must_protect_notes_ciphertext, mandate_hash, created_by_user_id, created_at
        ) values (
          ${mandateId}, ${matterId}, ${context.userId}, 1, ${data.representedParty},
          ${JSON.stringify(data.instruments)}, ${data.stage}, ${notesEnc}, ${hash}, ${context.userId}, ${nowIso()}
        )
      `;
      await transactionSql`update matter set active_mandate_version_id = ${mandateId} where matter_id = ${matterId} and owner_user_id = ${context.userId}`;
      await writeAudit({
        ownerUserId: context.userId,
        userId: context.userId,
        matterId,
        action: "matter.create",
        subjectType: "matter",
        subjectId: matterId,
        sql: transactionSql,
      });
    });
    return { matterId };
  });

export const getMatter = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { matterId: string }) => d)
  .handler(async ({ context, data }) => {
    await ensureAccount(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      matterId: string;
      name: string;
      status: string;
      createdAt: string;
      mandateId: string | null;
      representedParty: string | null;
      stage: string | null;
      instruments: string[] | null;
      notes: string | null;
    }>`
      select m.matter_id as "matterId", m.name, m.status, m.created_at as "createdAt",
             mv.mandate_version_id as "mandateId", mv.represented_party as "representedParty",
             mv.stage, mv.instruments, mv.must_protect_notes_ciphertext as notes
      from matter m
      left join mandate_version mv on mv.mandate_version_id = m.active_mandate_version_id
      where m.matter_id = ${data.matterId} and m.owner_user_id = ${context.userId} and m.deleted_at is null
    `;
    const m = rows[0];
    if (!m) return null;
    const docs = await sql<{
      documentId: string;
      logicalName: string;
      role: string;
      userInstrument: string;
      detectedInstrument: string;
      currentVersionId: string | null;
      ingestStatus: string | null;
      pageCount: number | null;
      sourceQuality: string | null;
      mapStatus: string | null;
      proofStatus: string | null;
    }>`
      select d.document_id as "documentId", d.logical_name as "logicalName", d.role,
             d.user_instrument as "userInstrument", d.detected_instrument as "detectedInstrument",
             d.current_version_id as "currentVersionId",
             dv.ingest_status as "ingestStatus", dv.page_count as "pageCount", dv.source_quality as "sourceQuality",
             (select cm.status from canonicalisation_map cm
               where cm.document_version_id = dv.document_version_id
               order by cm.version_no desc limit 1) as "mapStatus",
             (select pr.status from proof_run pr
               where pr.document_version_id = dv.document_version_id
               order by pr.started_at desc limit 1) as "proofStatus"
      from document d
      left join document_version dv on dv.document_version_id = d.current_version_id
      where d.matter_id = ${data.matterId} and d.owner_user_id = ${context.userId}
      order by d.created_at
    `;
    const route = reviewUnsupportedReason(
      (docs[0]?.detectedInstrument as Instrument) || "unknown",
      m.representedParty ?? "company",
      m.stage ?? "signing",
    );
    return {
      ...m,
      mustProtectNotes: textToPlain(m.notes),
      documents: docs,
      reviewGate: route ?? "Run Review ships in Slice 3. Open a document for the index-quality gate.",
      reviewEnabled: false,
    };
  });

export const updateMandate = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: {
    matterId: string;
    representedParty: RepresentedParty;
    instruments: Instrument[];
    stage: Stage;
    mustProtectNotes?: string;
  }) => d)
  .handler(async ({ context, data }) => {
    await requireVerified(context.userId);
    const sql = await getSql();
    const matter = await sql<{ matter_id: string }>`
      select matter_id from matter where matter_id = ${data.matterId} and owner_user_id = ${context.userId} and deleted_at is null
    `;
    if (!matter[0]) return { ok: false as const };
    const ver = await sql<{ n: number }>`
      select coalesce(max(version_no), 0) as n from mandate_version
      where matter_id = ${data.matterId} and owner_user_id = ${context.userId}
    `;
    const mandateId = newId();
    const hash = sha256Hex(JSON.stringify({
      p: data.representedParty,
      i: data.instruments.slice().sort(),
      s: data.stage,
      n: data.mustProtectNotes ?? "",
    }));
    const notesEnc = data.mustProtectNotes?.trim()
      ? envelopeToText(data.mustProtectNotes.trim())
      : null;
    await sql`
      insert into mandate_version (
        mandate_version_id, matter_id, owner_user_id, version_no, represented_party,
        instruments, stage, must_protect_notes_ciphertext, mandate_hash, created_by_user_id
      ) values (
        ${mandateId}, ${data.matterId}, ${context.userId}, ${(ver[0]?.n ?? 0) + 1},
        ${data.representedParty}, ${JSON.stringify(data.instruments)}, ${data.stage},
        ${notesEnc}, ${hash}, ${context.userId}
      )
    `;
    await sql`
      update matter set active_mandate_version_id = ${mandateId}, updated_at = ${nowIso()}
      where matter_id = ${data.matterId} and owner_user_id = ${context.userId}
    `;
    await writeAudit({
      ownerUserId: context.userId,
      matterId: data.matterId,
      userId: context.userId,
      action: "mandate.change",
      subjectType: "mandate_version",
      subjectId: mandateId,
    });
    return { ok: true as const, mandateId };
  });

export const deleteMatter = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { matterId: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{ matter_id: string }>`
      select matter_id from matter where matter_id = ${data.matterId} and owner_user_id = ${context.userId} and deleted_at is null
    `;
    if (!rows[0]) return { ok: false as const };
    const now = nowIso();
    const purge = new Date(Date.now() + RETENTION.purgeAfterDays * 86400000).toISOString();
    await sql`
      update matter set status = 'deletion_pending', deleted_at = ${now}, updated_at = ${now}
      where matter_id = ${data.matterId} and owner_user_id = ${context.userId}
    `;
    await sql`
      insert into deletion_job (
        deletion_id, owner_user_id, matter_id, requested_at, revoked_at, purge_due_at, policy_version
      ) values (
        ${newId()}, ${context.userId}, ${data.matterId}, ${now}, ${now}, ${purge}, 'retention-v1'
      )
    `;
    await writeAudit({
      ownerUserId: context.userId,
      userId: context.userId,
      matterId: data.matterId,
      action: "matter.delete",
      subjectType: "matter",
      subjectId: data.matterId,
    });
    return { ok: true as const, purgeDueAt: purge };
  });

async function persistIngest(opts: {
  userId: string;
  matterId: string;
  logicalName: string;
  role: string;
  userInstrument: Instrument;
  bytes: Buffer;
  documentId?: string;
}) {
  await requireVerified(opts.userId);
  const sql = await getSql();
  const matter = await sql<{ matter_id: string }>`
    select matter_id from matter
    where matter_id = ${opts.matterId} and owner_user_id = ${opts.userId} and deleted_at is null
  `;
  if (!matter[0]) return { ok: false as const, code: "not_found" as const };

  const sha = sha256Hex(opts.bytes);
  let documentId = opts.documentId;
  if (documentId) {
    const own = await sql<{ document_id: string }>`
      select document_id from document
      where document_id = ${documentId} and owner_user_id = ${opts.userId} and matter_id = ${opts.matterId}
    `;
    if (!own[0]) return { ok: false as const, code: "not_found" as const };
    const existing = await sql<{ document_version_id: string }>`
      select document_version_id from document_version
      where document_id = ${documentId} and source_sha256 = ${sha} and owner_user_id = ${opts.userId}
    `;
    if (existing[0]) {
      return { ok: true as const, documentId, documentVersionId: existing[0].document_version_id, idempotent: true };
    }
  } else {
    documentId = newId();
    await sql`
      insert into document (document_id, matter_id, owner_user_id, logical_name, role, user_instrument)
      values (${documentId}, ${opts.matterId}, ${opts.userId}, ${opts.logicalName}, ${opts.role}, ${opts.userInstrument})
    `;
  }

  const ingested = await ingestBuffer(opts.bytes);
  const blob = await putBlob(opts.userId, "original_docx", opts.bytes);
  const maxVer = await sql<{ n: number }>`
    select coalesce(max(version_no), 0) as n from document_version
    where document_id = ${documentId} and owner_user_id = ${opts.userId}
  `;
  const versionId = newId();
  const versionNo = (maxVer[0]?.n ?? 0) + 1;
  const prev = await sql<{ document_version_id: string }>`
    select document_version_id from document_version
    where document_id = ${documentId} and owner_user_id = ${opts.userId}
    order by version_no desc limit 1
  `;

  if (ingested.refused) {
    await sql`
      insert into document_version (
        document_version_id, document_id, matter_id, owner_user_id, version_no, supersedes_version_id,
        source_sha256, mime_type, byte_size, page_count, page_count_method, original_object_key,
        wrapped_data_key, cipher_metadata, ingest_status, refusal_code, source_quality, ingest_schema_version
      ) values (
        ${versionId}, ${documentId}, ${opts.matterId}, ${opts.userId}, ${versionNo},
        ${prev[0]?.document_version_id ?? null}, ${sha},
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ${opts.bytes.byteLength}, ${ingested.pageCount ?? 0}, 'estimated', ${blob.objectKey},
        ${blob.envelope.wrappedDataKey}, ${JSON.stringify(blob.envelope.cipherMetadata)},
        'refused', ${ingested.code}, 'unreadable', ${INGEST_SCHEMA_VERSION}
      )
    `;
    await sql`update document set current_version_id = ${versionId} where document_id = ${documentId} and owner_user_id = ${opts.userId}`;
    await writeAudit({
      ownerUserId: opts.userId,
      matterId: opts.matterId,
      userId: opts.userId,
      action: "document.refuse",
      subjectType: "document_version",
      subjectId: versionId,
      detailCodes: { code: ingested.code },
    });
    return {
      ok: true as const,
      documentId,
      documentVersionId: versionId,
      refused: true,
      refusal: ingested,
    };
  }

  const work = Buffer.from(
    JSON.stringify({
      extracted: ingested.extracted,
      sourceProvisions: ingested.sourceProvisions,
      entries: ingested.proposed.entries,
      definitions: ingested.definitions,
      uses: ingested.uses,
      quality: ingested.quality,
      instrument: ingested.instrument,
    }),
    "utf8",
  );
  const workBlob = await putBlob(opts.userId, "working_index", work);

  await sql`
    insert into document_version (
      document_version_id, document_id, matter_id, owner_user_id, version_no, supersedes_version_id,
      source_sha256, mime_type, byte_size, page_count, page_count_method, original_object_key,
      wrapped_data_key, cipher_metadata, ingest_status, source_quality, structure_confidence,
      index_quality_version, ingest_schema_version, classified_share, material_unclassified,
      usable_outline, unclassified_chars, unclassified_leaf_count, index_quality_json
    ) values (
      ${versionId}, ${documentId}, ${opts.matterId}, ${opts.userId}, ${versionNo},
      ${prev[0]?.document_version_id ?? null}, ${sha},
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ${opts.bytes.byteLength}, ${ingested.extracted.pageCount}, ${ingested.extracted.pageCountMethod},
      ${blob.objectKey}, ${blob.envelope.wrappedDataKey}, ${JSON.stringify(blob.envelope.cipherMetadata)},
      'map_pending', ${ingested.quality.sourceQuality}, ${ingested.quality.structureConfidence},
      ${INDEX_QUALITY_VERSION}, ${INGEST_SCHEMA_VERSION}, ${ingested.quality.classifiedShare},
      ${ingested.quality.materialUnclassified}, ${ingested.quality.usableOutline},
      ${ingested.quality.unclassifiedChars}, ${ingested.quality.unclassifiedLeafCount},
      ${JSON.stringify(ingested.quality)}
    )
  `;
  await sql`
    update document
    set current_version_id = ${versionId}, detected_instrument = ${ingested.instrument}
    where document_id = ${documentId} and owner_user_id = ${opts.userId}
  `;

  const mapId = newId();
  await sql`
    insert into canonicalisation_map (
      map_id, document_version_id, owner_user_id, version_no, status, map_sha256, recogniser_version
    ) values (
      ${mapId}, ${versionId}, ${opts.userId}, 1, 'proposed', ${ingested.mapSha}, ${RECOGNISER_VERSION}
    )
  `;
  for (const e of ingested.proposed.entries) {
    await sql`
      insert into canonicalisation_entry (
        entry_id, map_id, owner_user_id, kind, identifier_type, source_provision_id,
        source_start, source_end, original_value_ciphertext, replacement, defined_term_id,
        detector, confidence, user_decision
      ) values (
        ${e.entryId}, ${mapId}, ${opts.userId}, ${e.kind}, ${e.identifierType}, ${e.sourceProvisionId},
        ${e.sourceStart}, ${e.sourceEnd}, ${envelopeToText(e.originalValue)}, ${e.replacement},
        ${e.definedTermId}, ${e.detector}, ${e.confidence}, ${e.userDecision}
      )
    `;
  }
  for (const cap of ingested.extracted.capabilities) {
    await sql`
      insert into source_capability (source_capability_id, document_version_id, owner_user_id, capability_name, available, detector_version, suppression_reason)
      values (${newId()}, ${versionId}, ${opts.userId}, ${cap.name}, ${cap.available}, ${cap.detectorVersion}, ${cap.suppressionReason})
    `;
  }
  void workBlob;
  await writeAudit({
    ownerUserId: opts.userId,
    matterId: opts.matterId,
    userId: opts.userId,
    action: "document.upload",
    subjectType: "document_version",
    subjectId: versionId,
  });
  return {
    ok: true as const,
    documentId,
    documentVersionId: versionId,
    mapId,
    refused: false as const,
    instrument: ingested.instrument,
    quality: ingested.quality,
    pageCount: ingested.extracted.pageCount,
  };
}

export const uploadDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: {
    matterId: string;
    logicalName: string;
    role: string;
    userInstrument: Instrument;
    fileName: string;
    bytesBase64: string;
    documentId?: string;
  }) => d)
  .handler(async ({ context, data }) => {
    const raw = data.bytesBase64.includes(",") ? data.bytesBase64.split(",")[1] : data.bytesBase64;
    const bytes = Buffer.from(raw, "base64");
    const name = data.logicalName || data.fileName.replace(/\.docx$/i, "");
    if (!/\.docx$/i.test(data.fileName) && data.fileName) {
      if (/\.pdf$/i.test(data.fileName)) {
        return {
          ok: false as const,
          code: "pdf",
          message: "Upload the native Word (.docx) file.",
        };
      }
    }
    return persistIngest({
      userId: context.userId,
      matterId: data.matterId,
      logicalName: name,
      role: data.role,
      userInstrument: data.userInstrument,
      bytes,
      documentId: data.documentId,
    });
  });

export const loadSampleSha = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { matterId: string }) => d)
  .handler(async ({ context, data }) => {
    const bytes = await sampleShaDocx();
    return persistIngest({
      userId: context.userId,
      matterId: data.matterId,
      logicalName: "Sample SHA — Acme Technologies",
      role: "primary",
      userInstrument: "sha",
      bytes,
    });
  });

export const getCanonicalMap = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { documentId: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const doc = await sql<{
      documentId: string;
      matterId: string;
      logicalName: string;
      currentVersionId: string | null;
      detectedInstrument: string;
    }>`
      select document_id as "documentId", matter_id as "matterId", logical_name as "logicalName",
             current_version_id as "currentVersionId", detected_instrument as "detectedInstrument"
      from document where document_id = ${data.documentId} and owner_user_id = ${context.userId}
    `;
    const d = doc[0];
    if (!d || !d.currentVersionId) return null;
    const ver = await sql<{
      ingestStatus: string;
      refusalCode: string | null;
      pageCount: number;
      sourceQuality: string;
      structureConfidence: number | null;
      originalObjectKey: string | null;
    }>`
      select ingest_status as "ingestStatus", refusal_code as "refusalCode", page_count as "pageCount",
             source_quality as "sourceQuality", structure_confidence as "structureConfidence",
             original_object_key as "originalObjectKey"
      from document_version
      where document_version_id = ${d.currentVersionId} and owner_user_id = ${context.userId}
    `;
    const v = ver[0];
    if (!v) return null;
    const maps = await sql<{
      mapId: string;
      status: string;
      versionNo: number;
    }>`
      select map_id as "mapId", status, version_no as "versionNo"
      from canonicalisation_map
      where document_version_id = ${d.currentVersionId} and owner_user_id = ${context.userId}
      order by version_no desc
    `;
    let map = maps[0] ?? null;
    let entries: {
      entryId: string;
      kind: string;
      identifierType: string | null;
      replacement: string;
      detector: string;
      confidence: number;
      userDecision: string;
      originalEnc: string;
      sourceStart: number;
      sourceEnd: number;
    }[] = [];
    for (const candidate of maps) {
      const rows = await sql<{
        entryId: string;
        kind: string;
        identifierType: string | null;
        replacement: string;
        detector: string;
        confidence: number;
        userDecision: string;
        originalEnc: string;
        sourceStart: number;
        sourceEnd: number;
      }>`
        select entry_id as "entryId", kind, identifier_type as "identifierType", replacement,
               detector, confidence, user_decision as "userDecision",
               original_value_ciphertext as "originalEnc", source_start as "sourceStart",
               source_end as "sourceEnd"
        from canonicalisation_entry
        where map_id = ${candidate.mapId} and owner_user_id = ${context.userId}
        order by kind, source_start
      `;
      if (rows.length || !map) {
        map = candidate;
        entries = rows;
        if (rows.length) break;
      }
    }
    const safeEntries = entries.map((e) => ({
      entryId: e.entryId,
      kind: e.kind,
      identifierType: e.identifierType,
      replacement: e.replacement,
      detector: e.detector,
      confidence: Number(e.confidence),
      userDecision: e.userDecision,
      originalPreview:
        e.kind === "legal_name"
          ? (textToPlain(e.originalEnc) ?? "—")
          : `${e.identifierType ?? "id"} · ${e.sourceEnd - e.sourceStart} chars`,
    }));
    return {
      document: d,
      version: v,
      map: map ?? null,
      entries: safeEntries,
      identifierCounts: identifierCategoryCounts(
        entries.map((e) => ({
          entryId: e.entryId,
          kind: e.kind as ProposedEntry["kind"],
          identifierType: e.identifierType,
          sourceProvisionId: "",
          sourceStart: e.sourceStart,
          sourceEnd: e.sourceEnd,
          originalValue: "",
          replacement: e.replacement,
          definedTermId: null,
          detector: e.detector,
          confidence: Number(e.confidence),
          userDecision: e.userDecision as UserDecision,
        })),
      ),
    };
  });

export const confirmCanonicalMap = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: {
    documentId: string;
    decisions: Record<string, { decision: UserDecision; replacement?: string }>;
  }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const doc = await sql<{
      documentId: string;
      matterId: string;
      currentVersionId: string | null;
    }>`
      select document_id as "documentId", matter_id as "matterId", current_version_id as "currentVersionId"
      from document where document_id = ${data.documentId} and owner_user_id = ${context.userId}
    `;
    const d = doc[0];
    if (!d?.currentVersionId) return { ok: false as const, code: "not_found" };
    const ver = await sql<{ original_object_key: string; ingest_status: string }>`
      select original_object_key, ingest_status from document_version
      where document_version_id = ${d.currentVersionId} and owner_user_id = ${context.userId}
    `;
    const v = ver[0];
    if (!v || v.ingest_status === "refused") return { ok: false as const, code: "refused" };
    const maps = await sql<{ mapId: string; versionNo: number; status: string }>`
      select map_id as "mapId", version_no as "versionNo", status
      from canonicalisation_map
      where document_version_id = ${d.currentVersionId} and owner_user_id = ${context.userId}
      order by version_no desc
    `;
    let map = maps[0];
    if (!map) return { ok: false as const, code: "no_map" };
    let stored = await sql<{
      entryId: string;
      kind: string;
      identifierType: string | null;
      sourceProvisionId: string;
      sourceStart: number;
      sourceEnd: number;
      originalEnc: string;
      replacement: string;
      definedTermId: string | null;
      detector: string;
      confidence: number;
      userDecision: string;
    }>`
      select entry_id as "entryId", kind, identifier_type as "identifierType",
             source_provision_id as "sourceProvisionId", source_start as "sourceStart",
             source_end as "sourceEnd", original_value_ciphertext as "originalEnc",
             replacement, defined_term_id as "definedTermId", detector, confidence,
             user_decision as "userDecision"
      from canonicalisation_entry
      where map_id = ${map.mapId} and owner_user_id = ${context.userId}
    `;
    if (stored.length === 0) {
      for (const candidate of maps) {
        const rows = await sql<{
          entryId: string;
          kind: string;
          identifierType: string | null;
          sourceProvisionId: string;
          sourceStart: number;
          sourceEnd: number;
          originalEnc: string;
          replacement: string;
          definedTermId: string | null;
          detector: string;
          confidence: number;
          userDecision: string;
        }>`
          select entry_id as "entryId", kind, identifier_type as "identifierType",
                 source_provision_id as "sourceProvisionId", source_start as "sourceStart",
                 source_end as "sourceEnd", original_value_ciphertext as "originalEnc",
                 replacement, defined_term_id as "definedTermId", detector, confidence,
                 user_decision as "userDecision"
          from canonicalisation_entry
          where map_id = ${candidate.mapId} and owner_user_id = ${context.userId}
        `;
        if (rows.length) {
          map = candidate;
          stored = rows;
          break;
        }
      }
    }
    const bytes = await getBlob(context.userId, v.original_object_key);
    if (!bytes) return { ok: false as const, code: "missing_original" };
    const ingested = await ingestBuffer(bytes);
    if (ingested.refused) return { ok: false as const, code: ingested.code };

    const entries: ProposedEntry[] = stored.map((e) => {
      const originalValue = textToPlain(e.originalEnc) ?? "";
      const dec = data.decisions[e.entryId];
      const base: ProposedEntry = {
        entryId: e.entryId,
        kind: e.kind as ProposedEntry["kind"],
        identifierType: e.identifierType,
        sourceProvisionId: e.sourceProvisionId,
        sourceStart: e.sourceStart,
        sourceEnd: e.sourceEnd,
        originalValue,
        replacement: e.replacement,
        definedTermId: e.definedTermId,
        detector: e.detector,
        confidence: Number(e.confidence),
        userDecision: e.userDecision as UserDecision,
      };
      if (!dec) return base;
      if (dec.decision === "not_identifier") {
        return { ...base, userDecision: dec.decision, replacement: originalValue };
      }
      if (dec.decision === "correct" && dec.replacement) {
        return { ...base, userDecision: dec.decision, replacement: dec.replacement };
      }
      return { ...base, userDecision: dec.decision };
    });

    const unreviewed = entries.some(
      (e) => e.kind === "identifier" && !data.decisions[e.entryId],
    );
    if (unreviewed) return { ok: false as const, code: "unreviewed_identifier" };
    const collision = new Map<string, number>();
    for (const e of entries) {
      if (e.userDecision === "not_identifier") continue;
      if (e.kind === "legal_name") {
        collision.set(e.replacement, (collision.get(e.replacement) ?? 0) + 1);
      }
    }

    const provisions = applyMap(ingested.sourceProvisions, entries);
    const proof = runConfirmedProof(provisions, ingested.definitions, ingested.uses, ingested.extracted);

    const newMapId = newId();
    await sql`
      update canonicalisation_map set status = 'superseded'
      where document_version_id = ${d.currentVersionId} and owner_user_id = ${context.userId} and status = 'proposed'
    `;
    await sql`
      insert into canonicalisation_map (
        map_id, document_version_id, owner_user_id, version_no, status, map_sha256, recogniser_version,
        confirmed_by_user_id, confirmed_at
      ) values (
        ${newMapId}, ${d.currentVersionId}, ${context.userId}, ${maps[0].versionNo + 1}, 'confirmed',
        ${mapSha(entries)}, ${RECOGNISER_VERSION}, ${context.userId}, ${nowIso()}
      )
    `;
    for (const e of entries) {
      await sql`
        insert into canonicalisation_entry (
          entry_id, map_id, owner_user_id, kind, identifier_type, source_provision_id,
          source_start, source_end, original_value_ciphertext, replacement, defined_term_id,
          detector, confidence, user_decision
        ) values (
          ${newId()}, ${newMapId}, ${context.userId}, ${e.kind}, ${e.identifierType}, ${e.sourceProvisionId},
          ${e.sourceStart}, ${e.sourceEnd}, ${envelopeToText(e.originalValue)}, ${e.replacement},
          ${e.definedTermId}, ${e.detector}, ${e.confidence}, ${e.userDecision}
        )
      `;
    }

    const projectionPayload = Buffer.from(
      JSON.stringify({
        provisions: provisions.map((p) => ({
          id: p.provisionId,
          text: p.canonicalText,
          ownsText: p.ownsText,
        })),
      }),
      "utf8",
    );
    const projBlob = await putBlob(context.userId, "canonical_projection", projectionPayload);
    const offsetBlob = await putBlob(
      context.userId,
      "span_map",
      Buffer.from(JSON.stringify(ingested.proposed.segments), "utf8"),
    );
    const projectionId = newId();
    await sql`
      insert into canonical_projection (
        projection_id, document_version_id, map_id, owner_user_id, projection_sha256,
        projection_object_key, offset_map_object_key
      ) values (
        ${projectionId}, ${d.currentVersionId}, ${newMapId}, ${context.userId}, ${projBlob.sha256},
        ${projBlob.objectKey}, ${offsetBlob.objectKey}
      )
    `;

    await sql`delete from provision where document_version_id = ${d.currentVersionId} and owner_user_id = ${context.userId}`;
    for (const p of provisions) {
      await sql`
        insert into provision (
          provision_id, document_version_id, projection_id, owner_user_id, parent_provision_id,
          order_index, node_type, owns_text, number, heading, scope_type, scope_id,
          canonical_text_ciphertext, canonical_length, source_xml_anchor, source_start, source_end,
          structural_path, classification_confidence, line_start, line_end
        ) values (
          ${p.provisionId}, ${d.currentVersionId}, ${projectionId}, ${context.userId}, ${p.parentProvisionId},
          ${p.orderIndex}, ${p.nodeType}, ${p.ownsText}, ${p.number}, ${p.heading}, ${p.scopeType}, ${p.scopeId},
          ${p.ownsText ? envelopeToText(p.canonicalText) : null}, ${p.canonicalLength},
          ${JSON.stringify(p.sourceXmlAnchor)}, ${p.sourceStart}, ${p.sourceEnd},
          ${JSON.stringify(p.structuralPath)}, ${p.classificationConfidence}, ${p.lineStart}, ${p.lineEnd}
        )
      `;
    }
    await sql`delete from definition where document_version_id = ${d.currentVersionId} and owner_user_id = ${context.userId}`;
    for (const def of ingested.definitions) {
      await sql`
        insert into definition (
          definition_id, document_id, document_version_id, projection_id, owner_user_id,
          term, normalised_term, definition_kind, scope_type, scope_id, defining_provision_id,
          start_offset, end_offset
        ) values (
          ${def.definitionId}, ${d.documentId}, ${d.currentVersionId}, ${projectionId}, ${context.userId},
          ${def.term}, ${def.normalisedTerm}, ${def.definitionKind}, ${def.scopeType}, ${def.scopeId},
          ${def.definingProvisionId}, ${def.start}, ${def.end}
        )
        on conflict (document_id, document_version_id, scope_type, scope_id, normalised_term) do nothing
      `;
    }
    await sql`
      delete from definition_use
      where owner_user_id = ${context.userId}
        and definition_id in (select definition_id from definition where document_version_id = ${d.currentVersionId} and owner_user_id = ${context.userId})
    `;
    for (const u of ingested.uses) {
      await sql`
        insert into definition_use (definition_use_id, definition_id, owner_user_id, provision_id, start_offset, end_offset)
        values (${u.definitionUseId}, ${u.definitionId}, ${context.userId}, ${u.provisionId}, ${u.start}, ${u.end})
      `;
    }

    for (const e of proof.dealMap) {
      await sql`
        insert into deal_map_entry (
          deal_map_entry_id, document_id, document_version_id, projection_id, owner_user_id,
          category, label, value, provision_id, start_offset, end_offset, extraction_method, confidence, uncertainty_code
        ) values (
          ${newId()}, ${d.documentId}, ${d.currentVersionId}, ${projectionId}, ${context.userId},
          ${e.category}, ${e.label}, ${e.value}, ${e.provisionId}, ${e.start}, ${e.end},
          'deterministic', ${e.confidence}, ${e.uncertaintyCode}
        )
      `;
    }

    const runId = newId();
    const allRequiredRan = proof.result.executions.every((e) => e.status === "completed" || e.status === "suppressed");
    const anySuppressed = proof.result.executions.some((e) => e.status === "suppressed");
    const status = !allRequiredRan ? "partial" : anySuppressed ? "partial" : "complete";
    await sql`
      insert into proof_run (
        proof_run_id, matter_id, owner_user_id, document_version_id, map_id, projection_id,
        status, registry_sha256, started_at, ended_at, idempotency_key
      ) values (
        ${runId}, ${d.matterId}, ${context.userId}, ${d.currentVersionId}, ${newMapId}, ${projectionId},
        ${status}, ${proof.result.registrySha}, ${nowIso()}, ${nowIso()}, ${`confirm:${d.currentVersionId}:${newMapId}`}
      )
    `;
    for (const ex of proof.result.executions) {
      await sql`
        insert into proof_check_execution (
          proof_check_execution_id, proof_run_id, owner_user_id, check_id, check_version, status,
          required_capabilities, missing_capabilities, hit_count
        ) values (
          ${newId()}, ${runId}, ${context.userId}, ${ex.checkId}, ${ex.checkVersion}, ${ex.status},
          ${JSON.stringify([])}, ${JSON.stringify(ex.missing)}, ${ex.hitCount}
        )
      `;
    }
    for (const f of proof.filled) {
      if (!f.valid || !f.quote) continue;
      await sql`
        insert into proof_hit (
          proof_hit_id, proof_run_id, document_version_id, map_id, projection_id, owner_user_id,
          check_id, check_version, severity, certainty, provision_id, quote_start, quote_end,
          server_quote_snapshot, detail_code, detail_args, source_mapping_valid
        ) values (
          ${newId()}, ${runId}, ${d.currentVersionId}, ${newMapId}, ${projectionId}, ${context.userId},
          ${f.hit.checkId}, ${f.hit.checkVersion}, ${f.hit.severity}, ${f.hit.certainty},
          ${f.hit.provisionId}, ${f.hit.quoteStart}, ${f.hit.quoteEnd},
          ${envelopeToText(f.quote)}, ${f.hit.detailCode}, ${JSON.stringify(f.hit.detailArgs)}, true
        )
      `;
    }
    await sql`
      update document_version
      set ingest_status = 'indexed', source_quality = ${ingested.quality.sourceQuality},
          structure_confidence = ${ingested.quality.structureConfidence},
          index_quality_version = ${INDEX_QUALITY_VERSION},
          classified_share = ${ingested.quality.classifiedShare},
          material_unclassified = ${ingested.quality.materialUnclassified},
          usable_outline = ${ingested.quality.usableOutline},
          unclassified_chars = ${ingested.quality.unclassifiedChars},
          unclassified_leaf_count = ${ingested.quality.unclassifiedLeafCount},
          index_quality_json = ${JSON.stringify(ingested.quality)}
      where document_version_id = ${d.currentVersionId} and owner_user_id = ${context.userId}
    `;
    await writeAudit({
      ownerUserId: context.userId,
      matterId: d.matterId,
      userId: context.userId,
      action: "map.confirm",
      subjectType: "canonicalisation_map",
      subjectId: newMapId,
    });
    await writeAudit({
      ownerUserId: context.userId,
      matterId: d.matterId,
      userId: context.userId,
      action: "proof.complete",
      subjectType: "proof_run",
      subjectId: runId,
      detailCodes: { status, llmCalls: proof.result.llmCalls },
    });
    return { ok: true as const, proofRunId: runId, status, llmCalls: proof.result.llmCalls };
  });

export const getProof = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((d: { documentId: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const doc = await sql<{
      documentId: string;
      matterId: string;
      logicalName: string;
      currentVersionId: string | null;
      detectedInstrument: string;
    }>`
      select document_id as "documentId", matter_id as "matterId", logical_name as "logicalName",
             current_version_id as "currentVersionId", detected_instrument as "detectedInstrument"
      from document where document_id = ${data.documentId} and owner_user_id = ${context.userId}
    `;
    const d = doc[0];
    if (!d?.currentVersionId) return null;
    const ver = await sql<{
      ingestStatus: string;
      sourceQuality: string;
      structureConfidence: number | null;
      pageCount: number;
      pageCountMethod: string;
      refusalCode: string | null;
      classifiedShare: number | null;
      materialUnclassified: boolean | null;
      usableOutline: boolean | null;
      unclassifiedChars: number | null;
      unclassifiedLeafCount: number | null;
      indexQualityJson: IndexQuality | null;
      indexQualityVersion: string | null;
    }>`
      select ingest_status as "ingestStatus", source_quality as "sourceQuality",
             structure_confidence as "structureConfidence", page_count as "pageCount",
             page_count_method as "pageCountMethod", refusal_code as "refusalCode",
             classified_share as "classifiedShare", material_unclassified as "materialUnclassified",
             usable_outline as "usableOutline", unclassified_chars as "unclassifiedChars",
             unclassified_leaf_count as "unclassifiedLeafCount",
             index_quality_json as "indexQualityJson", index_quality_version as "indexQualityVersion"
      from document_version
      where document_version_id = ${d.currentVersionId} and owner_user_id = ${context.userId}
    `;
    const run = await sql<{
      proofRunId: string;
      status: string;
      endedAt: string | null;
    }>`
      select proof_run_id as "proofRunId", status, ended_at as "endedAt"
      from proof_run
      where document_version_id = ${d.currentVersionId} and owner_user_id = ${context.userId}
      order by started_at desc limit 1
    `;
    const executions = run[0]
      ? await sql<{
          checkId: string;
          checkVersion: number;
          status: string;
          hitCount: number;
          missing: string[];
        }>`
          select check_id as "checkId", check_version as "checkVersion", status,
                 hit_count as "hitCount", missing_capabilities as missing
          from proof_check_execution
          where proof_run_id = ${run[0].proofRunId} and owner_user_id = ${context.userId}
        `
      : [];
    const hits = run[0]
      ? await sql<{
          proofHitId: string;
          checkId: string;
          checkVersion: number;
          severity: string;
          certainty: string;
          provisionId: string;
          quoteStart: number;
          quoteEnd: number;
          quoteEnc: string | null;
          detailCode: string;
          detailArgs: Record<string, string | number | null>;
          sourceMappingValid: boolean;
        }>`
          select proof_hit_id as "proofHitId", check_id as "checkId", check_version as "checkVersion", severity, certainty,
                 provision_id as "provisionId", quote_start as "quoteStart", quote_end as "quoteEnd",
                 server_quote_snapshot as "quoteEnc", detail_code as "detailCode",
                 detail_args as "detailArgs", source_mapping_valid as "sourceMappingValid"
          from proof_hit
          where proof_run_id = ${run[0].proofRunId} and owner_user_id = ${context.userId}
        `
      : [];
    const provisions = await sql<{
      provisionId: string;
      parent: string | null;
      nodeType: string;
      ownsText: boolean;
      number: string | null;
      heading: string | null;
      textEnc: string | null;
      orderIndex: number;
    }>`
      select provision_id as "provisionId", parent_provision_id as parent, node_type as "nodeType",
             owns_text as "ownsText", number, heading, canonical_text_ciphertext as "textEnc",
             order_index as "orderIndex"
      from provision
      where document_version_id = ${d.currentVersionId} and owner_user_id = ${context.userId}
      order by case when owns_text = false and line_start = 0 then 1 else 0 end, line_start, order_index
    `;
    const deal = await sql<{
      category: string;
      label: string;
      value: string | null;
      uncertainty: string | null;
    }>`
      select category, label, value, uncertainty_code as uncertainty
      from deal_map_entry
      where document_version_id = ${d.currentVersionId} and owner_user_id = ${context.userId}
    `;
    const caps = await sql<{
      name: string;
      available: boolean;
      reason: string | null;
    }>`
      select capability_name as "name", available, suppression_reason as "reason"
      from source_capability
      where document_version_id = ${d.currentVersionId} and owner_user_id = ${context.userId}
    `;
    const capabilities =
      caps.length > 0
        ? caps
        : (() => {
            const missing = new Set(
              executions.flatMap((e) => (Array.isArray(e.missing) ? e.missing : [])),
            );
            return ["comments", "revisions", "fields", "tables", "headers_footers"].map((name) => ({
              name,
              available: !missing.has(name),
              reason: missing.has(name) ? `missing ${name}` : null,
            }));
          })();
    const defs = await sql<{
      term: string;
      kind: string;
      scopeType: string;
      scopeId: string;
    }>`
      select term, definition_kind as kind, scope_type as "scopeType", scope_id as "scopeId"
      from definition
      where document_version_id = ${d.currentVersionId} and owner_user_id = ${context.userId}
    `;

    const filledHits = hits.map((h) => {
      const quote = textToPlain(h.quoteEnc);
      const prov = provisions.find((p) => p.provisionId === h.provisionId);
      const canonical = prov ? textToPlain(prov.textEnc) : null;
      const matches = canonical != null && quote != null && canonical.slice(h.quoteStart, h.quoteEnd) === quote;
      return {
        proofHitId: h.proofHitId,
        checkId: h.checkId,
        checkVersion: h.checkVersion,
        severity: h.severity,
        certainty: h.certainty,
        provisionId: h.provisionId,
        clause: prov?.number ?? prov?.heading ?? "—",
        quote,
        quoteStart: h.quoteStart,
        quoteEnd: h.quoteEnd,
        detailCode: h.detailCode,
        detailArgs: h.detailArgs,
        citationFaithful: matches,
      };
    });

    const allRequired = executions.length > 0 && executions.every((e) => e.status === "completed" || e.status === "suppressed");
    const noHitsCopy =
      filledHits.length === 0 && allRequired && executions.every((e) => e.status === "completed")
        ? "No Proof issues found"
        : null;

    const v = ver[0];
    const leaves = provisions.filter((p) => p.ownsText);
    const unclassifiedLeaves = leaves.filter((p) => p.nodeType === "unclassified");
    const unclassifiedCharsComputed = unclassifiedLeaves.reduce(
      (n, p) => n + (textToPlain(p.textEnc) ?? "").replace(/\s+/g, "").length,
      0,
    );
    const storedQuality = v?.indexQualityJson;
    const quality = storedQuality ?? {
      sourceQuality: (v?.sourceQuality ?? "unreadable") as IndexQuality["sourceQuality"],
      structureConfidence: Number(v?.structureConfidence ?? 0),
      classifiedShare: Number(v?.classifiedShare ?? 0),
      materialUnclassified: Boolean(v?.materialUnclassified),
      usableOutline: Boolean(v?.usableOutline),
      unclassifiedChars: v?.unclassifiedChars ?? unclassifiedCharsComputed,
      unclassifiedLeafCount: v?.unclassifiedLeafCount ?? unclassifiedLeaves.length,
      indexQualityVersion: v?.indexQualityVersion ?? INDEX_QUALITY_VERSION,
      components: {},
    };

    const mandate = await sql<{ representedParty: string | null; stage: string | null }>`
      select mv.represented_party as "representedParty", mv.stage
      from matter m
      left join mandate_version mv on mv.mandate_version_id = m.active_mandate_version_id
      where m.matter_id = ${d.matterId} and m.owner_user_id = ${context.userId}
    `;

    const gate = computeReviewGate({
      quality,
      instrument: (d.detectedInstrument as Instrument) || "unknown",
      representedParty: mandate[0]?.representedParty ?? "company",
      stage: mandate[0]?.stage ?? "signing",
      refused: v?.ingestStatus === "refused",
      reviewShipped: false,
    });

    const signatures = {
      namedParties: [...new Set(defs.filter((x) => x.kind === "defined_party").map((x) => x.term))],
      blocks: provisions
        .filter((p) => p.nodeType === "signature_block")
        .map((p) => ({
          label: p.heading || (textToPlain(p.textEnc) ?? "").slice(0, 48),
          provisionId: p.provisionId,
        })),
    };

    return {
      document: d,
      version: v,
      run: run[0] ?? null,
      executions,
      hits: filledHits,
      dealMap: deal,
      capabilities,
      definitions: defs,
      outline: provisions.map((p) => ({
        provisionId: p.provisionId,
        parent: p.parent,
        nodeType: p.nodeType,
        ownsText: p.ownsText,
        number: p.number,
        heading: p.heading,
        preview: p.ownsText ? (textToPlain(p.textEnc) ?? "").slice(0, 140) : "",
      })),
      quality,
      signatures,
      reviewGate: gate,
      noHitsCopy,
      llmCalls: 0,
    };
  });

export const voteNotADefect = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { proofHitId: string; note?: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const hit = await sql<{ proof_hit_id: string; check_id: string; check_version: number }>`
      select proof_hit_id, check_id, check_version from proof_hit
      where proof_hit_id = ${data.proofHitId} and owner_user_id = ${context.userId}
    `;
    if (!hit[0]) return { ok: false as const };
    await sql`
      insert into proof_feedback_ticket (
        ticket_id, proof_hit_id, check_id, check_version, owner_user_id, user_id, vote, user_note
      ) values (
        ${newId()}, ${hit[0].proof_hit_id}, ${hit[0].check_id}, ${hit[0].check_version},
        ${context.userId}, ${context.userId}, 'not_a_defect', ${data.note ?? null}
      )
    `;
    return { ok: true as const };
  });
