import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../migrations/0006_product_runs.sql", import.meta.url), "utf8");

test("T06 product run migration is metadata-only and tenant-bound", () => {
  assert.match(migration, /create table if not exists public\.product_run/i);
  assert.match(migration, /create table if not exists public\.product_artifact/i);
  assert.match(migration, /retention_deadline = upload_started_at \+ interval '2 hours'/i);
  assert.match(migration, /product_run_deadlines_immutable/i);
  for (const table of ["product_run", "product_artifact"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`, "i"));
    assert.match(migration, new RegExp(`create policy ${table}_app_select`, "i"));
    assert.match(migration, new RegExp(`create policy ${table}_worker_all`, "i"));
    assert.match(migration, new RegExp(`create policy ${table}_support_select`, "i"));
  }
  assert.doesNotMatch(migration, /\b(filename|display_name|comment_body|canonical_text|ciphertext|bytea)\b/i);
  assert.doesNotMatch(migration, /\b(drop\s+table|truncate|delete\s+from)\b/i);
  assert.match(migration, /references public\.agmt_tenant_member \(tenant_id, user_id\)/i);
  assert.doesNotMatch(migration, /references public\.(matter|document|object_blob)\b/i);
});

test("T06 constraints and RLS reject forged deadlines and cross-tenant writes", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite();
  await pg.exec("create table _migrations (name text primary key, checksum text, applied_at timestamptz default now())");
  const paths = (await readdir(new URL("../migrations/", import.meta.url), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql") && !["0006_product_runs.sql", "0007_r2_object_provider.sql", "0008_proof_purge_function.sql", "0009_pwc_run_lifecycle.sql", "0010_pwc_live_dispatch.sql", "0011_pwc_budget_counts.sql"].includes(entry.name))
    .map((entry) => entry.name).sort();
  for (const name of paths) await pg.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
  await pg.exec(migration);
  await pg.exec("insert into user_account (user_id) values ('u1'), ('u2'); insert into agmt_tenant (tenant_id) values ('t1'), ('t2'); insert into agmt_tenant_member (tenant_id,user_id) values ('t1','u1'), ('t2','u2');");
  await pg.exec("set role agmt_app; select set_config('agmt.user_id','u1',false), set_config('agmt.tenant_id','t1',false);");
  const args = ["r1","t1","u1","2026-01-01T00:00:00Z","2026-01-01T02:00:00Z","2026-01-01T01:55:00Z","2026-01-01T01:50:00Z","2026-01-01T00:15:00Z"];
  await pg.query("insert into product_run (run_id,tenant_id,owner_user_id,product_id,upload_started_at,retention_deadline,access_deadline,processing_deadline,upload_grant_deadline,parser_version,rule_set_version,exporter_version,idempotency_key) values ($1,$2,$3,'proof',$4,$5,$6,$7,$8,'p','r','e','k')", args);
  await assert.rejects(() => pg.query("update product_run set retention_deadline = $1 where run_id = 'r1'", ["2026-01-01T03:00:00Z"]));
  await assert.rejects(() => pg.query("insert into product_run (run_id,tenant_id,owner_user_id,product_id,upload_started_at,retention_deadline,access_deadline,processing_deadline,upload_grant_deadline,parser_version,rule_set_version,exporter_version,idempotency_key) values ('r2','t1','u1','proof',$1,$2,$3,$4,$5,'p','r','e','k2')", [args[3],args[4],args[5],args[6],"2026-01-01T00:16:00Z"]));
  const crossTenant = await pg.query("select run_id from product_run where tenant_id = 't2'");
  assert.equal(crossTenant.rows.length, 0);
  await pg.close();
});
