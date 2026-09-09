import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../migrations/0009_pwc_run_lifecycle.sql", import.meta.url), "utf8");

const runArgs = [
  "r1",
  "t1",
  "u1",
  "2026-01-01T00:00:00Z",
  "2026-01-01T02:00:00Z",
  "2026-01-01T01:55:00Z",
  "2026-01-01T01:50:00Z",
  "2026-01-01T00:15:00Z",
];

async function applyAll(pg) {
  await pg.exec("create table _migrations (name text primary key, checksum text, applied_at timestamptz default now())");
  const paths = (await readdir(new URL("../migrations/", import.meta.url), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();
  for (const name of paths) {
    await pg.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
  }
}

async function seed(pg) {
  await pg.exec(
    "insert into user_account (user_id) values ('u1'), ('u2'); insert into agmt_tenant (tenant_id) values ('t1'), ('t2'); insert into agmt_tenant_member (tenant_id,user_id) values ('t1','u1'), ('t1','u2'), ('t2','u2');",
  );
}

test("PWC-16 migration is additive metadata-only and reserves 0009", () => {
  assert.match(migration, /PWC-16/);
  assert.match(migration, /authorised_at/);
  assert.match(migration, /scan_receipt/);
  assert.match(migration, /lease_token/);
  assert.match(migration, /product_artifact_run_owner_fkey/);
  assert.match(migration, /product_run_transition_guard/);
  assert.match(migration, /aggregate_type = 'product_run'/);
  assert.match(migration, /deleting.*deleted/i);
  assert.doesNotMatch(migration, /scanning['"]\s*,\s*['"]processing/);
  for (const line of migration.split("\n")) {
    if (!/add column/i.test(line)) continue;
    assert.doesNotMatch(line, /\b(filename|display_name|comment_body|canonical_text|ciphertext|bytea)\b/i);
  }
  assert.doesNotMatch(migration, /\bbytea\b/i);
  assert.doesNotMatch(migration, /\b(drop\s+table|truncate)\b/i);
  assert.doesNotMatch(migration, /create table public\.matter/i);
  assert.doesNotMatch(migration, /0001_auth|0006_product_runs/);
});

test("PWC-16 PGlite rehearses owner-bound artifacts, transitions and immutable deadlines", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite();
  await applyAll(pg);
  await seed(pg);
  await pg.exec("set role agmt_app; select set_config('agmt.user_id','u1',false), set_config('agmt.tenant_id','t1',false);");

  await pg.query(
    "insert into product_run (run_id,tenant_id,owner_user_id,product_id,upload_started_at,retention_deadline,access_deadline,processing_deadline,upload_grant_deadline,authorised_at,parser_version,rule_set_version,exporter_version,idempotency_key) values ($1,$2,$3,'proof',$4,$5,$6,$7,$8,$4,'p','r','e','k')",
    runArgs,
  );

  const authorised = await pg.query("select authorised_at, upload_started_at from product_run where run_id = 'r1'");
  assert.equal(String(authorised.rows[0].authorised_at), String(authorised.rows[0].upload_started_at));

  await assert.rejects(
    () => pg.query("update product_run set retention_deadline = $1 where run_id = 'r1'", ["2026-01-01T03:00:00Z"]),
    /immutable/,
  );
  await assert.rejects(
    () => pg.query("update product_run set authorised_at = $1 where run_id = 'r1'", ["2026-01-01T00:01:00Z"]),
    /immutable/,
  );

  await pg.query("update product_run set status = 'scanning' where run_id = 'r1'");
  await assert.rejects(
    () => pg.query("update product_run set status = 'processing' where run_id = 'r1'"),
    /invalid state transition/i,
  );
  await pg.query("update product_run set status = 'queued' where run_id = 'r1'");
  await pg.query("update product_run set status = 'processing' where run_id = 'r1'");
  await pg.query("update product_run set status = 'exporting' where run_id = 'r1'");
  await pg.query(
    "update product_run set status = 'ready', correction_count = 2, comment_count = 1, notice_count = 0 where run_id = 'r1'",
  );

  await pg.query(
    "insert into product_artifact (artifact_id, run_id, tenant_id, owner_user_id, kind, storage_key, state, content_type, byte_size, sha256, attempt_id, generation, write_status) values ('a1','r1','t1','u1','marked_docx','key-r1','published','application/octet-stream',12,$1,'0',0,'settled')",
    ["a".repeat(64)],
  );

  await pg.exec("select set_config('agmt.user_id','u2',false), set_config('agmt.tenant_id','t1',false);");
  await assert.rejects(
    () => pg.query(
      "insert into product_artifact (artifact_id, run_id, tenant_id, owner_user_id, kind, storage_key, state, content_type, byte_size, sha256, attempt_id, generation, write_status) values ('a2','r1','t1','u2','source','key-u2','staged','application/octet-stream',12,$1,'0',0,'reserved')",
      ["b".repeat(64)],
    ),
    /foreign key|violates|row-level security/i,
  );
  const stolen = await pg.query("select artifact_id from product_artifact where run_id = 'r1'");
  assert.equal(stolen.rows.length, 0);

  await pg.exec("select set_config('agmt.user_id','u1',false), set_config('agmt.tenant_id','t1',false);");
  const owned = await pg.query("select artifact_id from product_artifact where run_id = 'r1'");
  assert.equal(owned.rows.length, 1);

  await pg.query("update product_run set status = 'deleting' where run_id = 'r1'");
  const restart = await pg.query("update product_run set status = 'deleting', cancellation_generation = cancellation_generation + 1 where run_id = 'r1' returning cancellation_generation");
  assert.equal(Number(restart.rows[0].cancellation_generation) > 0, true);

  const stale = await pg.query("update product_run set status = 'deleted' where run_id = 'r1' and cancellation_generation = 0 returning run_id");
  assert.equal(stale.rows.length, 0);

  await pg.query(
    "insert into job_outbox (outbox_id, tenant_id, created_by_user_id, aggregate_type, aggregate_id, job_type, idempotency_key, payload) values ('o1','t1','u1','product_run','r1','proof_process','k1','{}'::jsonb)",
  );
  const outbox = await pg.query("select aggregate_type from job_outbox where outbox_id = 'o1'");
  assert.equal(outbox.rows[0].aggregate_type, "product_run");

  const failed = await pg.query(
    "insert into product_run (run_id,tenant_id,owner_user_id,product_id,status,upload_started_at,retention_deadline,access_deadline,processing_deadline,upload_grant_deadline,parser_version,rule_set_version,exporter_version,idempotency_key,attempt_count) values ('r2','t1','u1','proof','failed',$1,$2,$3,$4,$5,'p','r','e','k2',1) returning access_deadline, retention_deadline",
    runArgs.slice(3),
  );
  const before = failed.rows[0];
  await pg.query("update product_run set status = 'queued' where run_id = 'r2'");
  const after = await pg.query("select access_deadline, retention_deadline from product_run where run_id = 'r2'");
  assert.equal(String(after.rows[0].access_deadline), String(before.access_deadline));
  assert.equal(String(after.rows[0].retention_deadline), String(before.retention_deadline));

  await pg.close();
});

test("PWC-21 quota snapshot counts metadata only and is granted to worker/app", async () => {
  const sql = await readFile(new URL("../migrations/0011_pwc_budget_counts.sql", import.meta.url), "utf8");
  assert.match(sql, /proof_quota_snapshot/);
  assert.match(sql, /security definer/);
  assert.doesNotMatch(sql, /filename|display_name|comment_body|canonical_text|bytea/i);
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite();
  await applyAll(pg);
  await seed(pg);
  await pg.exec("set role agmt_app; select set_config('agmt.user_id','u1',false), set_config('agmt.tenant_id','t1',false);");
  await pg.query(
    "insert into product_run (run_id,tenant_id,owner_user_id,product_id,upload_started_at,retention_deadline,access_deadline,processing_deadline,upload_grant_deadline,parser_version,rule_set_version,exporter_version,idempotency_key) values ($1,$2,$3,'proof',$4,$5,$6,$7,$8,'p','r','e','k')",
    runArgs,
  );
  const snap = await pg.query("select * from agmt_private.proof_quota_snapshot('t1','u1','2026-01-01T00:30:00Z')");
  assert.equal(Number(snap.rows[0].owner_uploads_utc_day), 1);
  assert.equal(Number(snap.rows[0].global_uploads_utc_day), 1);
  assert.equal(Number(snap.rows[0].global_uploads_utc_month), 1);
  await pg.close();
});
