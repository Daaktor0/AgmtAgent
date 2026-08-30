import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const baseline = await readFile(
  new URL("../migrations/0002_slice0.sql", import.meta.url),
  "utf8",
);
const indexQuality = await readFile(
  new URL("../migrations/0003_slice2.sql", import.meta.url),
  "utf8",
);
const tenantExpansion = await readFile(
  new URL("../migrations/0003_tenant_integrity_expand.sql", import.meta.url),
  "utf8",
);

test("FND-03 migration rehearsal rejects cross-tenant relationships", async () => {
  const database = new PGlite();
  await database.waitReady;
  try {
    await database.exec(baseline);
    await database.exec(indexQuality);
    await database.exec(tenantExpansion);

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
      "insert into matter (matter_id, tenant_id, owner_user_id, name) values ($1, $2, $3, $4)",
      ["matter-1", "tenant-1", "user-1", "Tenant one matter"],
    );
    await database.query(
      "insert into document (document_id, tenant_id, matter_id, owner_user_id, logical_name, role) values ($1, $2, $3, $4, $5, $6)",
      [
        "document-1",
        "tenant-1",
        "matter-1",
        "user-1",
        "one.docx",
        "primary",
      ],
    );

    await assert.rejects(
      database.query(
        "insert into document (document_id, tenant_id, matter_id, owner_user_id, logical_name, role) values ($1, $2, $3, $4, $5, $6)",
        [
          "document-2",
          "tenant-2",
          "matter-1",
          "user-2",
          "cross-tenant.docx",
          "primary",
        ],
      ),
      /foreign key|violates/i,
    );

    const rows = await database.query(
      "select document_id from document where tenant_id = $1",
      ["tenant-1"],
    );
    assert.deepEqual(rows.rows.map((row) => row.document_id), ["document-1"]);
  } finally {
    await database.close();
  }
});
