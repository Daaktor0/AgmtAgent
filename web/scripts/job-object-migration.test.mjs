import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../migrations/0005_job_object_plane.sql", import.meta.url),
  "utf8",
);

const tables = ["object_manifest", "upload_intent", "ingest_job", "job_outbox"];

function escaped(value) {
  return value.replace(/[.*+?^()|[\]\\]/g, "\\$&");
}

test("JOB-01 and OBJ-01 create additive durable state tables", () => {
  for (const table of tables) {
    assert.match(
      migration,
      new RegExp("create\\s+table\\s+if\\s+not\\s+exists\\s+(?:public\\.)?" + table + "\\b", "i"),
    );
    assert.match(
      migration,
      new RegExp("alter\\s+table\\s+public\\." + escaped(table) + "\\s+enable\\s+row\\s+level\\s+security", "i"),
    );
    assert.match(
      migration,
      new RegExp("alter\\s+table\\s+public\\." + escaped(table) + "\\s+force\\s+row\\s+level\\s+security", "i"),
    );
    assert.match(migration, new RegExp("create\\s+policy\\s+" + table + "_app_select", "i"));
    assert.match(migration, new RegExp("create\\s+policy\\s+" + table + "_worker_all", "i"));
    assert.match(migration, new RegExp("create\\s+policy\\s+" + table + "_support_select", "i"));
  }
  assert.match(migration, /unique\s*\(\s*tenant_id\s*,\s*idempotency_key\s*\)/i);
  assert.match(migration, /lease_token/i);
  assert.match(migration, /lease_expires_at/i);
  assert.match(migration, /for\s+update\s+skip\s+locked/i);
});

test("OBJ-01 stores object metadata only and leaves legacy ciphertext untouched", () => {
  const manifestBlock = migration.match(
    /create\s+table\s+if\s+not\s+exists\s+(?:public\.)?object_manifest\s*\(([\s\S]*?)\);/i,
  )?.[1] ?? "";
  assert.ok(manifestBlock);
  assert.doesNotMatch(manifestBlock, /\bciphertext\b|\bbytea\b/i);
  assert.match(manifestBlock, /storage_provider/i);
  assert.match(manifestBlock, /storage_key/i);
  assert.match(manifestBlock, /sha256/i);
  assert.match(manifestBlock, /wrapped_data_key/i);
  assert.match(migration, /object_blob\s+remains\s+legacy/i);
  assert.doesNotMatch(migration, /alter\s+table\s+object_blob/i);
  assert.doesNotMatch(migration, /\bdelete\s+from\b|\bdrop\s+table\b|\btruncate\b/i);
});

test("JOB-01 state tables are tenant-bound and idempotency is tenant-scoped", () => {
  for (const table of tables) {
    const block = migration.match(
      new RegExp("create\\s+table\\s+if\\s+not\\s+exists\\s+(?:public\\.)?" + table + "\\s*\\(([\\s\\S]*?)\\);", "i"),
    )?.[1] ?? "";
    assert.match(block, /tenant_id\s+text\s+not\s+null/i, table);
    assert.match(block, /owner_user_id|created_by_user_id/i, table);
  }
  assert.match(migration, /references\s+agmt_tenant_member\s*\(\s*tenant_id\s*,\s*user_id\s*\)/i);
  assert.match(migration, /on\s+conflict\s*\(\s*tenant_id\s*,\s*idempotency_key\s*\)/i);
  assert.doesNotMatch(migration, /password|secret|private\s+key/i);
});
