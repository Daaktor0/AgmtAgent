import assert from "node:assert/strict";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

import { readFile } from "node:fs/promises";

const migrations = await Promise.all([
  readFile(new URL("../migrations/0001_auth.sql", import.meta.url), "utf8"),
  readFile(new URL("../migrations/0002_slice0.sql", import.meta.url), "utf8"),
  readFile(new URL("../migrations/0003_slice2.sql", import.meta.url), "utf8"),
  readFile(new URL("../migrations/0003_tenant_integrity_expand.sql", import.meta.url), "utf8"),
  readFile(new URL("../migrations/0004_rls_runtime.sql", import.meta.url), "utf8"),
  readFile(new URL("../migrations/0005_job_object_plane.sql", import.meta.url), "utf8"),
]);

async function setContext(database, context) {
  await database.query(
    "select set_config('agmt.user_id', $1, true), set_config('agmt.tenant_id', $2, true), set_config('agmt.support_ticket', $3, true), set_config('agmt.operation', $4, true)",
    [
      context.userId,
      context.tenantId ?? "",
      context.supportTicket ?? "",
      context.operation ?? "",
    ],
  );
}

async function seed(database) {
  await database.query(
    "insert into user_account (user_id, email_normalised) values ($1, $2), ($3, $4)",
    ["user-1", "one@example.test", "user-2", "two@example.test"],
  );
  await database.query(
    "insert into agmt_tenant (tenant_id) values ($1), ($2)",
    ["tenant-1", "tenant-2"],
  );
  await database.query(
    "insert into agmt_tenant_member (tenant_id, user_id) values ($1, $2), ($3, $4)",
    ["tenant-1", "user-1", "tenant-2", "user-2"],
  );
  await database.query(
    "insert into matter (matter_id, tenant_id, owner_user_id, name) values ($1, $2, $3, $4), ($5, $6, $7, $8)",
    [
      "matter-1",
      "tenant-1",
      "user-1",
      "Tenant one matter",
      "matter-2",
      "tenant-2",
      "user-2",
      "Tenant two matter",
    ],
  );
  await database.query(
    "insert into document (document_id, tenant_id, matter_id, owner_user_id, logical_name, role) values ($1, $2, $3, $4, $5, $6), ($7, $8, $9, $10, $11, $12)",
    [
      "document-1",
      "tenant-1",
      "matter-1",
      "user-1",
      "one.docx",
      "primary",
      "document-2",
      "tenant-2",
      "matter-2",
      "user-2",
      "two.docx",
      "primary",
    ],
  );
}

test("FND-04 denies cross-tenant app operations and missing context", async () => {
  const database = new PGlite();
  await database.waitReady;
  try {
    await database.exec(
      "create table _migrations (name text primary key, checksum text not null, applied_at timestamptz not null default now())",
    );
    for (const migration of migrations) await database.exec(migration);
    await seed(database);

    await database.query("set role agmt_app");
    await database.exec("begin");
    await setContext(database, { userId: "user-1", tenantId: "tenant-1" });

    const visible = await database.query(
      "select matter_id from matter order by matter_id",
    );
    assert.deepEqual(visible.rows.map((row) => row.matter_id), ["matter-1"]);

    await database.query(
      "insert into document (document_id, tenant_id, matter_id, owner_user_id, logical_name, role) values ($1, $2, $3, $4, $5, $6)",
      ["document-3", "tenant-1", "matter-1", "user-1", "three.docx", "primary"],
    );

    await assert.rejects(
      database.query(
        "insert into document (document_id, tenant_id, matter_id, owner_user_id, logical_name, role) values ($1, $2, $3, $4, $5, $6)",
        ["document-cross", "tenant-2", "matter-2", "user-2", "cross.docx", "primary"],
      ),
      /row-level security|permission denied|violates/i,
    );
    await database.exec("rollback");

    await database.exec("begin");
    const noContext = await database.query("select matter_id from matter");
    assert.deepEqual(noContext.rows, []);
    await assert.rejects(
      database.query(
        "insert into document (document_id, tenant_id, matter_id, owner_user_id, logical_name, role) values ($1, $2, $3, $4, $5, $6)",
        ["document-no-context", "tenant-1", "matter-1", "user-1", "no-context.docx", "primary"],
      ),
      /row-level security|permission denied|violates/i,
    );
    await database.exec("rollback");

    await database.exec("reset role");
    await database.query("set role agmt_support");
    await database.exec("begin");
    await setContext(database, {
      userId: "support-agent",
      tenantId: "tenant-1",
      supportTicket: "ticket-123",
    });
    const supportRows = await database.query("select matter_id from matter");
    assert.deepEqual(supportRows.rows.map((row) => row.matter_id), ["matter-1"]);
    await assert.rejects(
      database.query("insert into matter (matter_id, tenant_id, owner_user_id, name) values ($1, $2, $3, $4)", [
        "matter-support",
        "tenant-1",
        "user-1",
        "support must be read-only",
      ]),
      /permission denied|row-level security/i,
    );
    await database.exec("rollback");
  } finally {
    await database.close();
  }
});


test("JOB-01 and OBJ-01 state tables remain tenant-scoped under runtime roles", async () => {
  const database = new PGlite();
  await database.waitReady;
  try {
    await database.exec(
      "create table _migrations (name text primary key, checksum text not null, applied_at timestamptz not null default now())",
    );
    for (const migration of migrations) await database.exec(migration);
    await seed(database);

    await database.query("set role agmt_app");
    await database.exec("begin");
    await setContext(database, { userId: "user-1", tenantId: "tenant-1" });

    await database.query(
      "insert into object_manifest (object_key, tenant_id, owner_user_id, kind, storage_provider, storage_key, state, content_type, sha256, ciphertext_sha256, byte_size, ciphertext_byte_size, wrapped_data_key, cipher_metadata) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)",
      [
        "obj_123e4567-e89b-12d3-a456-426614174000",
        "tenant-1",
        "user-1",
        "original_docx",
        "memory",
        "tenants/one/objects/obj_123e4567-e89b-12d3-a456-426614174000",
        "staged",
        "application/octet-stream",
        "a".repeat(64),
        "b".repeat(64),
        1,
        1,
        "wrapped",
        "{}",
      ],
    );
    await database.query(
      "insert into upload_intent (upload_intent_id, tenant_id, owner_user_id, matter_id, object_key, content_type, byte_size, sha256, idempotency_key, status, expires_at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
      [
        "upload-intent-1",
        "tenant-1",
        "user-1",
        "matter-1",
        "obj_123e4567-e89b-12d3-a456-426614174000",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        1,
        "a".repeat(64),
        "upload-1",
        "created",
        "2099-01-01T00:00:00.000Z",
      ],
    );
    await database.query(
      "insert into ingest_job (job_id, tenant_id, owner_user_id, upload_intent_id, object_key, source_sha256, parser_version, idempotency_key, status) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
      [
        "job-1",
        "tenant-1",
        "user-1",
        "upload-intent-1",
        "obj_123e4567-e89b-12d3-a456-426614174000",
        "a".repeat(64),
        "parser-v1",
        "job-1",
        "queued",
      ],
    );
    await database.query(
      "insert into job_outbox (outbox_id, tenant_id, created_by_user_id, aggregate_type, aggregate_id, job_type, idempotency_key, payload) values ($1, $2, $3, $4, $5, $6, $7, $8)",
      [
        "outbox-1",
        "tenant-1",
        "user-1",
        "ingest_job",
        "job-1",
        "ingest",
        "job-1",
        "{}",
      ],
    );

    for (const table of ["object_manifest", "upload_intent", "ingest_job", "job_outbox"]) {
      const rows = await database.query(
        "select * from " + table + " order by 1",
      );
      assert.equal(rows.rows.length, 1, table + " should expose the current tenant");
    }
    const crossTenant = await database.query(
      "select * from object_manifest where tenant_id = $1",
      ["tenant-2"],
    );
    assert.deepEqual(crossTenant.rows, []);
    await database.exec("rollback");

    await database.exec("begin");
    const noContext = await database.query("select * from job_outbox");
    assert.deepEqual(noContext.rows, []);
    await database.exec("rollback");

    await database.exec("reset role");
    await database.query("set role agmt_support");
    await database.exec("begin");
    await setContext(database, {
      userId: "support-agent",
      tenantId: "tenant-1",
      supportTicket: "ticket-123",
    });
    const supportRows = await database.query("select * from ingest_job");
    assert.equal(supportRows.rows.length, 1);
    await assert.rejects(
      database.query(
        "insert into job_outbox (outbox_id, tenant_id, created_by_user_id, aggregate_type, aggregate_id, job_type, idempotency_key, payload) values ($1, $2, $3, $4, $5, $6, $7, $8)",
        ["outbox-support", "tenant-1", "user-1", "ingest_job", "job-1", "ingest", "support", "{}"],
      ),
      /permission denied|row-level security/i,
    );
    await database.exec("rollback");
  } finally {
    await database.close();
  }
});
