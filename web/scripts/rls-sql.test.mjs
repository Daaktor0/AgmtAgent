import assert from "node:assert/strict";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

import { readFile } from "node:fs/promises";

const migrations = await Promise.all([
  readFile(new URL("../migrations/0002_slice0.sql", import.meta.url), "utf8"),
  readFile(new URL("../migrations/0003_slice2.sql", import.meta.url), "utf8"),
  readFile(new URL("../migrations/0003_tenant_integrity_expand.sql", import.meta.url), "utf8"),
  readFile(new URL("../migrations/0004_rls_runtime.sql", import.meta.url), "utf8"),
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
