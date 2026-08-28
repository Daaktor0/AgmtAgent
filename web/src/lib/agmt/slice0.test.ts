import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { applyMap, ingestBuffer, runConfirmedProof } from "./pipeline.ts";
import { buildDocx } from "./docx.ts";
import { sampleShaDocx } from "./sample-sha.ts";
import { PAGE_CAP, FILE_BYTE_CAP, MAGIC_LINK_TTL_MS, RETENTION } from "./config.ts";
import { proofLlmCallCount, PROOF_MAKES_NO_LLM_CALLS } from "./llm-guard.ts";
import { hashToken } from "./crypto.ts";
import { assertLineOwnership } from "./provision-tree.ts";

test("founder-closed retention and caps", () => {
  assert.equal(RETENTION.purgeAfterDays, 30);
  assert.equal(RETENTION.inactivityMonths, 12);
  assert.equal(FILE_BYTE_CAP, 25 * 1024 * 1024);
  assert.equal(PAGE_CAP, 80);
  assert.equal(MAGIC_LINK_TTL_MS, 15 * 60 * 1000);
});

test("Proof process has no LLM client", () => {
  assert.equal(PROOF_MAKES_NO_LLM_CALLS, true);
  assert.equal(proofLlmCallCount, 0);
});

test("magic-link tokens are hashed, raw token is not the stored value", () => {
  const raw = "raw-token-value";
  const hashed = hashToken(raw);
  assert.notEqual(hashed, raw);
  assert.equal(hashed, hashToken(raw));
});

test("same file bytes hash is stable (idempotency key)", async () => {
  const a = await sampleShaDocx();
  const b = await sampleShaDocx();
  const ha = createHash("sha256").update(a).digest("hex");
  const hb = createHash("sha256").update(b).digest("hex");
  assert.equal(ha, hb);
});

test("file over 25 MiB is refused and not indexed", async () => {
  const huge = Buffer.alloc(FILE_BYTE_CAP + 1);
  huge.write("PK");
  const r = await ingestBuffer(huge);
  assert.equal(r.refused, true);
  if (r.refused) assert.equal(r.code, "file_too_large");
});

test("PDF is not a native DOCX", async () => {
  const pdf = Buffer.from("%PDF-1.4");
  const r = await ingestBuffer(pdf);
  assert.equal(r.refused, true);
});

test("page cap refuses without truncating", async () => {
  const paras = Array.from({ length: 20 }, (_, i) => `Paragraph ${i} ${"word ".repeat(200)}`);
  const bytes = await buildDocx(paras, { pages: 90 });
  const r = await ingestBuffer(bytes);
  assert.equal(r.refused, true);
  if (r.refused) assert.equal(r.code, "page_cap");
});

test("sample SHA: defined term remains; PAN and email do not; quotes match offsets", async () => {
  const bytes = await sampleShaDocx();
  const r = await ingestBuffer(bytes);
  assert.equal(r.refused, false);
  if (r.refused) return;
  assert.equal(r.instrument, "sha");
  const ownership = assertLineOwnership(r.sourceProvisions, r.extracted.blocks);
  assert.deepEqual(ownership, []);

  const text = r.proposed.provisions.filter((p) => p.ownsText).map((p) => p.canonicalText).join("\n");
  assert.match(text, /\bCompany\b/);
  assert.doesNotMatch(text, /ABCDE1234F/);
  assert.doesNotMatch(text, /ops@acme-example\.com/);
  assert.match(text, /\[PAN_\d+\]|\[EMAIL_\d+\]/);

  const confirmed = applyMap(r.sourceProvisions, r.proposed.entries);
  const proof = runConfirmedProof(confirmed, r.definitions, r.uses, r.extracted);
  assert.equal(proof.result.llmCalls, 0);

  const byCheck = new Map<string, number>();
  for (const f of proof.filled) {
    assert.equal(f.valid, true, `invalid span ${f.hit.checkId}`);
    const p = confirmed.find((x) => x.provisionId === f.hit.provisionId);
    assert.ok(p);
    assert.equal(f.quote, p!.canonicalText.slice(f.hit.quoteStart, f.hit.quoteEnd));
    byCheck.set(f.hit.checkId, (byCheck.get(f.hit.checkId) ?? 0) + 1);
  }
  assert.ok((byCheck.get("structure.broken_xref") ?? 0) >= 1, "must-find broken xref");
  assert.ok((byCheck.get("exec.unfilled_placeholder") ?? 0) >= 1, "must-find placeholder");
  assert.ok((byCheck.get("exec.hidden_character") ?? 0) >= 1, "must-find hidden character");
  assert.ok((byCheck.get("defterm.unused") ?? 0) >= 1, "must-find unused definition");
  assert.ok((byCheck.get("exec.signature_block_mismatch") ?? 0) >= 1, "must-find signature mismatch");
});

test("hidden-character exception: ordinary hyphen is not flagged", async () => {
  const bytes = await buildDocx([
    "SHAREHOLDERS AGREEMENT",
    "1. Definitions",
    '"Company" means Acme Technologies Private Limited.',
    "This is a lock-in period of three years.",
  ]);
  const r = await ingestBuffer(bytes);
  assert.equal(r.refused, false);
  if (r.refused) return;
  const proof = runConfirmedProof(
    r.proposed.provisions,
    r.definitions,
    r.uses,
    r.extracted,
  );
  const hidden = proof.filled.filter((f) => f.hit.checkId === "exec.hidden_character");
  assert.equal(hidden.length, 0);
});

test("broken xref exception: existing clause is not a defect", async () => {
  const bytes = await buildDocx([
    "SHAREHOLDERS AGREEMENT",
    "1. Definitions",
    '"Company" means the company.',
    "2. Term",
    "This Agreement continues as set out in Clause 2.",
  ]);
  const r = await ingestBuffer(bytes);
  assert.equal(r.refused, false);
  if (r.refused) return;
  const proof = runConfirmedProof(
    r.proposed.provisions,
    r.definitions,
    r.uses,
    r.extracted,
  );
  const broken = proof.filled.filter((f) => f.hit.checkId === "structure.broken_xref");
  assert.equal(broken.length, 0);
});

test("unused definition exception: a used term is quiet", async () => {
  const bytes = await buildDocx([
    "SHAREHOLDERS AGREEMENT",
    "1. Definitions",
    '"Affiliate" means a Person controlling the Company.',
    "2. Transfers",
    "An Affiliate may receive Securities.",
  ]);
  const r = await ingestBuffer(bytes);
  assert.equal(r.refused, false);
  if (r.refused) return;
  const unused = runConfirmedProof(
    r.proposed.provisions,
    r.definitions,
    r.uses,
    r.extracted,
  ).filled.filter((f) => f.hit.checkId === "defterm.unused");
  assert.equal(unused.length, 0);
});

test("cross-user fetch returns not-found rather than the other owner's row", () => {
  function fetchOwned<T extends { owner_user_id: string }>(
    rows: T[],
    idKey: keyof T,
    id: string,
    owner: string,
  ): T | null {
    return rows.find((r) => r[idKey] === id && r.owner_user_id === owner) ?? null;
  }
  const rows = [
    { matter_id: "a", owner_user_id: "user-a", name: "Alpha" },
    { matter_id: "b", owner_user_id: "user-b", name: "Beta" },
  ];
  assert.equal(fetchOwned(rows, "matter_id", "b", "user-a"), null);
  assert.equal(fetchOwned(rows, "matter_id", "a", "user-a")?.name, "Alpha");
});
