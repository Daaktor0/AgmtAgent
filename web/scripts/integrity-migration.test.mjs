import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../migrations/0003_tenant_integrity_expand.sql",
  import.meta.url,
);
const migration = await readFile(migrationPath, "utf8");

const tenantOwnedTables = [
  "review_entitlement",
  "credit_event",
  "matter",
  "mandate_version",
  "document",
  "document_version",
  "object_blob",
  "canonicalisation_map",
  "canonicalisation_entry",
  "canonical_projection",
  "span_map_segment",
  "provision",
  "definition",
  "definition_use",
  "deal_map_entry",
  "source_capability",
  "proof_run",
  "proof_check_execution",
  "proof_hit",
  "proof_feedback_ticket",
  "audit_event",
  "deletion_job",
];

test("FND-03 migration is an additive tenant expansion", () => {
  for (const table of tenantOwnedTables) {
    assert.match(
      migration,
      new RegExp(
        "alter table " + table + " add column if not exists tenant_id text;",
        "i",
      ),
      "missing tenant_id expansion for " + table,
    );
  }

  assert.match(migration, /create table if not exists agmt_tenant/i);
  assert.match(migration, /create table if not exists agmt_tenant_member/i);
  assert.match(migration, /foreign key \(tenant_id,/i);
  assert.match(migration, /not valid/i);
  assert.match(migration, /existing owner has no user_account row/i);
});

test("FND-03 migration contains no destructive data operation", () => {
  assert.doesNotMatch(migration, /\b(drop|truncate)\b/i);
  assert.doesNotMatch(migration, /\bdelete\s+from\b/i);
  assert.doesNotMatch(migration, /alter table[\s\S]*set\s+not\s+null/i);
  assert.match(migration, /ciphertext/i);
  assert.match(migration, /does not delete rows, rewrite ciphertext/i);
});

test("FND-03 keeps tenant backfill tied to an existing principal", () => {
  assert.match(migration, /references user_account \(user_id\)/i);
  assert.match(migration, /existing owner has no user_account row/i);
  assert.match(migration, /on conflict \(tenant_id, user_id\) do nothing/i);
  assert.match(migration, /update matter set tenant_id = owner_user_id/i);
  assert.match(migration, /update document_version set tenant_id = owner_user_id/i);
});
