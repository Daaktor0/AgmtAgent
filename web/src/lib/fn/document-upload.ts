import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { transactionOutcome } from "@/lib/db-transaction";
import { requireVerified } from "@/lib/server/account";
import {
  blobPublicationArtifactFromError,
  deleteBlob,
  putBlob,
  reconcileBlobAfterTransactionFailure,
  type PutBlobResult,
} from "@/lib/server/blobs";
import { writeAudit } from "@/lib/server/audit";
import { encryptText, sha256Hex } from "@/lib/agmt/crypto";
import { newId } from "@/lib/agmt/ids";
import { ingestBuffer } from "@/lib/agmt/pipeline";
import {
  INDEX_QUALITY_VERSION,
  INGEST_SCHEMA_VERSION,
  RECOGNISER_VERSION,
} from "@/lib/agmt/config";
import type { Instrument } from "@/lib/agmt/types";

function envelopeToText(value: string): string {
  return JSON.stringify(encryptText(value));
}

function safeErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code?: unknown }).code ?? "").trim();
    if (code) return code.slice(0, 80);
  }
  return error instanceof Error && error.name ? error.name.slice(0, 80) : "unknown";
}

/**
 * Remove only impossible/incomplete upload shells: documents owned by this user
 * in this Matter that have no current version. This exists to clean rows left by
 * the earlier upload implementation, which inserted the document before ingest.
 */
async function cleanupIncompleteRows(sql: Sql, userId: string, matterId: string): Promise<number> {
  const stale = await sql<{ documentId: string }>`
    select document_id as "documentId"
    from document
    where owner_user_id = ${userId}
      and matter_id = ${matterId}
      and current_version_id is null
  `;

  for (const row of stale) {
    const versionIds = await sql<{ versionId: string; objectKey: string | null }>`
      select document_version_id as "versionId", original_object_key as "objectKey"
      from document_version
      where document_id = ${row.documentId} and owner_user_id = ${userId}
    `;
    for (const version of versionIds) {
      await sql`
        delete from canonicalisation_entry
        where owner_user_id = ${userId}
          and map_id in (
            select map_id from canonicalisation_map
            where document_version_id = ${version.versionId} and owner_user_id = ${userId}
          )
      `;
      await sql`
        delete from canonicalisation_map
        where document_version_id = ${version.versionId} and owner_user_id = ${userId}
      `;
      await sql`
        delete from source_capability
        where document_version_id = ${version.versionId} and owner_user_id = ${userId}
      `;
      if (version.objectKey) {
        await deleteBlob(userId, version.objectKey, sql);
        await sql`
          delete from object_blob
          where object_key = ${version.objectKey} and owner_user_id = ${userId}
        `;
      }
    }
    await sql`
      delete from document_version
      where document_id = ${row.documentId} and owner_user_id = ${userId}
    `;
    await sql`
      delete from document
      where document_id = ${row.documentId}
        and owner_user_id = ${userId}
        and matter_id = ${matterId}
        and current_version_id is null
    `;
  }
  return stale.length;
}

export const cleanupIncompleteUploads = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { matterId: string }) => data)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const count = await cleanupIncompleteRows(sql, context.userId, data.matterId);
    return { ok: true as const, count };
  });

export const uploadDocumentSafe = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: {
    matterId: string;
    logicalName: string;
    userInstrument: Instrument;
    fileName: string;
    bytesBase64: string;
  }) => data)
  .handler(async ({ context, data }) => {
    await requireVerified(context.userId);
    const sql = await getSql();

    if (!/\.docx$/i.test(data.fileName)) {
      return {
        ok: false as const,
        code: "not_docx",
        message: "Please upload the native Word (.docx) file.",
      };
    }

    const matter = await sql<{ matterId: string }>`
      select matter_id as "matterId"
      from matter
      where matter_id = ${data.matterId}
        and owner_user_id = ${context.userId}
        and deleted_at is null
    `;
    if (!matter[0]) {
      return { ok: false as const, code: "matter_not_found", message: "This Matter is no longer available." };
    }

    await cleanupIncompleteRows(sql, context.userId, data.matterId);

    const raw = data.bytesBase64.includes(",") ? data.bytesBase64.split(",")[1] : data.bytesBase64;
    const bytes = Buffer.from(raw, "base64");
    if (!bytes.byteLength) {
      return { ok: false as const, code: "empty_file", message: "The selected file is empty." };
    }

    const documentId = newId();
    const versionId = newId();
    let mapId: string | null = null;
    let originalObject: PutBlobResult | null = null;
    let phase = "inspect";

    try {
      // Do all CPU/parser work before acquiring a database connection. A parser
      // failure can therefore never surface as a fake "Uploaded" document.
      const ingested = await ingestBuffer(bytes);

      const transactionalResult = await sql.transaction(async (transactionSql) => {
        phase = "store_original";
        const original = await putBlob(context.userId, "original_docx", bytes, transactionSql);
        originalObject = original;

        phase = "create_document";
        await transactionSql`
          insert into document (
              tenant_id,

            document_id, matter_id, owner_user_id, logical_name, role, user_instrument
          ) values ( ${context.tenantId}, 
            ${documentId}, ${data.matterId}, ${context.userId},
            ${data.logicalName.trim() || data.fileName.replace(/\.docx$/i, "")},
            'primary', ${data.userInstrument}
          )
        `;

        if (ingested.refused) {
          phase = "persist_refusal";
          await transactionSql`
            insert into document_version (
              tenant_id,

              document_version_id, document_id, matter_id, owner_user_id, version_no,
              source_sha256, mime_type, byte_size, page_count, page_count_method,
              original_object_key, wrapped_data_key, cipher_metadata, ingest_status,
              refusal_code, source_quality, ingest_schema_version
            ) values ( ${context.tenantId}, 
              ${versionId}, ${documentId}, ${data.matterId}, ${context.userId}, 1,
              ${sha256Hex(bytes)},
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              ${bytes.byteLength}, ${ingested.pageCount ?? 0}, 'estimated',
              ${original.objectKey}, ${original.envelope.wrappedDataKey},
              ${JSON.stringify(original.envelope.cipherMetadata)}, 'refused',
              ${ingested.code}, 'unreadable', ${INGEST_SCHEMA_VERSION}
            )
          `;
          await transactionSql`
            update document set current_version_id = ${versionId}
            where document_id = ${documentId} and owner_user_id = ${context.userId}
          `;
          await writeAudit({
            sql: transactionSql,
            ownerUserId: context.userId,
            userId: context.userId,
            matterId: data.matterId,
            action: "document.refuse",
            subjectType: "document_version",
            subjectId: versionId,
            detailCodes: { code: ingested.code },
          });
          return {
            ok: true as const,
            documentId,
            documentVersionId: versionId,
            refused: true as const,
            refusal: ingested,
          };
        }

        phase = "create_version";
        await transactionSql`
          insert into document_version (
              tenant_id,

            document_version_id, document_id, matter_id, owner_user_id, version_no,
            source_sha256, mime_type, byte_size, page_count, page_count_method,
            original_object_key, wrapped_data_key, cipher_metadata, ingest_status,
            source_quality, structure_confidence, index_quality_version,
            ingest_schema_version, classified_share, material_unclassified,
            usable_outline, unclassified_chars, unclassified_leaf_count, index_quality_json
          ) values ( ${context.tenantId}, 
            ${versionId}, ${documentId}, ${data.matterId}, ${context.userId}, 1,
            ${sha256Hex(bytes)},
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            ${bytes.byteLength}, ${ingested.extracted.pageCount}, ${ingested.extracted.pageCountMethod},
            ${original.objectKey}, ${original.envelope.wrappedDataKey},
            ${JSON.stringify(original.envelope.cipherMetadata)}, 'map_pending',
            ${ingested.quality.sourceQuality}, ${ingested.quality.structureConfidence},
            ${INDEX_QUALITY_VERSION}, ${INGEST_SCHEMA_VERSION}, ${ingested.quality.classifiedShare},
            ${ingested.quality.materialUnclassified}, ${ingested.quality.usableOutline},
            ${ingested.quality.unclassifiedChars}, ${ingested.quality.unclassifiedLeafCount},
            ${JSON.stringify(ingested.quality)}
          )
        `;

        await transactionSql`
          update document
          set current_version_id = ${versionId}, detected_instrument = ${ingested.instrument}
          where document_id = ${documentId} and owner_user_id = ${context.userId}
        `;

        phase = "create_map";
        mapId = newId();
        await transactionSql`
          insert into canonicalisation_map (
              tenant_id,

            map_id, document_version_id, owner_user_id, version_no, status,
            map_sha256, recogniser_version
          ) values ( ${context.tenantId}, 
            ${mapId}, ${versionId}, ${context.userId}, 1, 'proposed',
            ${ingested.mapSha}, ${RECOGNISER_VERSION}
          )
        `;

        phase = "create_map_entries";
        for (const entry of ingested.proposed.entries) {
          await transactionSql`
            insert into canonicalisation_entry (
              tenant_id,

              entry_id, map_id, owner_user_id, kind, identifier_type,
              source_provision_id, source_start, source_end,
              original_value_ciphertext, replacement, defined_term_id,
              detector, confidence, user_decision
            ) values ( ${context.tenantId}, 
              ${entry.entryId}, ${mapId}, ${context.userId}, ${entry.kind},
              ${entry.identifierType}, ${entry.sourceProvisionId}, ${entry.sourceStart},
              ${entry.sourceEnd}, ${envelopeToText(entry.originalValue)}, ${entry.replacement},
              ${entry.definedTermId}, ${entry.detector}, ${entry.confidence}, ${entry.userDecision}
            )
          `;
        }

        phase = "create_capabilities";
        for (const capability of ingested.extracted.capabilities) {
          await transactionSql`
            insert into source_capability (
              tenant_id,

              source_capability_id, document_version_id, owner_user_id,
              capability_name, available, detector_version, suppression_reason
            ) values ( ${context.tenantId}, 
              ${newId()}, ${versionId}, ${context.userId}, ${capability.name},
              ${capability.available}, ${capability.detectorVersion}, ${capability.suppressionReason}
            )
          `;
        }

        await writeAudit({
          sql: transactionSql,
          ownerUserId: context.userId,
          userId: context.userId,
          matterId: data.matterId,
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
          pageCount: ingested.extracted.pageCount,
        };

      });
      return transactionalResult;
    } catch (error) {
      const code = safeErrorCode(error);
      const outcome = transactionOutcome(error);
      const artifact =
        originalObject?.artifact ?? blobPublicationArtifactFromError(error);

      if (artifact) {
        try {
          const reconciliation = await reconcileBlobAfterTransactionFailure(sql, artifact, {
            // Destructive provider cleanup is allowed only after the transaction
            // adapter confirmed that no relational publication committed.
            allowDeletion: outcome === "rolled_back",
          });
          if (reconciliation.status === "unresolved") {
            console.error(
              "[upload] reconciliation_unresolved",
              reconciliation.recordError ?? reconciliation.deleteError,
            );
          } else {
            console.warn(
              "[upload] reconciliation_" + reconciliation.status,
              "phase=" + phase + " code=" + code,
            );
          }
        } catch (reconciliationError) {
          console.error(
            "[upload] reconciliation_failed code=" + safeErrorCode(reconciliationError),
          );
        }
      }

      if (outcome === "unknown" || outcome === null) {
        // A commit/rollback transport failure is ambiguous. Do not delete
        // relational rows or provider bytes, even if a cleanup query appears
        // to succeed; the next reconciler must decide from exact manifests.
        console.error("[upload] publication_outcome_uncertain phase=" + phase);
      }

      return {
        ok: false as const,
        code: "processing_failed",
        message: "Agmt could not prepare this Word file for Proof. The failed upload was not added to the Matter.",
      };

    }
  });
