import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const runArgs = (runId, tenantId, ownerUserId) => [
  runId,
  tenantId,
  ownerUserId,
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

test("PWC-20 PGlite RLS: two owners in one tenant and a second tenant cannot read each other's runs", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite();
  await applyAll(pg);
  await pg.exec(
    "insert into user_account (user_id) values ('u1'), ('u2'), ('u3'); insert into agmt_tenant (tenant_id) values ('t1'), ('t2'); insert into agmt_tenant_member (tenant_id,user_id,role) values ('t1','u1','owner'), ('t1','u2','member'), ('t2','u3','owner');",
  );

  await pg.exec("set role agmt_app; select set_config('agmt.user_id','u1',false), set_config('agmt.tenant_id','t1',false);");
  await pg.query(
    "insert into product_run (run_id,tenant_id,owner_user_id,product_id,upload_started_at,retention_deadline,access_deadline,processing_deadline,upload_grant_deadline,authorised_at,parser_version,rule_set_version,exporter_version,idempotency_key) values ($1,$2,$3,'proof',$4,$5,$6,$7,$8,$4,'p','r','e','k1')",
    runArgs("r1", "t1", "u1"),
  );
  const owned = await pg.query("select run_id from product_run");
  assert.deepEqual(owned.rows.map((row) => row.run_id), ["r1"]);

  await pg.exec("select set_config('agmt.user_id','u2',false), set_config('agmt.tenant_id','t1',false);");
  const sameTenant = await pg.query("select run_id from product_run");
  assert.equal(sameTenant.rows.length, 0);
  const stolen = await pg.query("update product_run set status = 'deleting' where run_id = 'r1' returning run_id");
  assert.equal(stolen.rows.length, 0);

  await pg.exec("select set_config('agmt.user_id','u3',false), set_config('agmt.tenant_id','t2',false);");
  const otherTenant = await pg.query("select run_id from product_run");
  assert.equal(otherTenant.rows.length, 0);
});
