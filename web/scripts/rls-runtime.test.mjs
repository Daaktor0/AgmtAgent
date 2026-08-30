import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [middleware, database, authServer, account, emailFlow, runtime] = await Promise.all([
  readFile(new URL("../src/lib/auth/middleware.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/db.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/auth/server.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/server/account.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/fn/auth-email.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/auth/runtime-context.server.ts", import.meta.url), "utf8"),
]);

test("FND-04 middleware binds verified identity to a server-derived tenant", () => {
  assert.match(middleware, /requireUserId\(context\.bearerToken\)/);
  assert.match(middleware, /withAuthenticatedDatabaseContext/);
  assert.match(middleware, /next\(\{ context: \{ userId, tenantId \} \}\)/);
  assert.doesNotMatch(middleware, /tenantId: data\./);
});

test("FND-04 Postgres context is role allow-listed and transaction-local", () => {
  assert.match(database, /AGMT_DB_ROLE/);
  assert.match(database, /agmt_app/);
  assert.match(database, /agmt_worker/);
  assert.match(database, /agmt_support/);
  assert.match(database, /set role/);
  assert.match(database, /set_config\(\$1, \$2, true\)/);
  assert.match(database, /currentDatabaseContext\(\) !== null/);
});

test("FND-04 separates Better Auth connection configuration", () => {
  assert.match(authServer, /BETTER_AUTH_DATABASE_URL/);
  assert.match(authServer, /AUTH_DATABASE_URL/);
  assert.match(authServer, /authDatabaseUrl/);
  assert.doesNotMatch(authServer, /service_role/i);
});

test("FND-04 account entitlement writes require tenant context", () => {
  assert.match(account, /ensureEntitlement\?: boolean/);
  assert.match(account, /options\.ensureEntitlement !== false/);
  assert.match(
    runtime,
    /ensureAccount\(verifiedUserId, \{\s*ensureEntitlement: false,\s*\}\)/,
  );
  assert.match(account, /currentDatabaseContext\(\)\?\.tenantId/);
  assert.match(account, /insert into review_entitlement \(/);
  assert.match(account, /tenant_id/);
});

test("FND-04 unauthenticated magic-link work is explicitly operation-scoped", () => {
  assert.match(emailFlow, /auth_magic_link_request/);
  assert.match(emailFlow, /auth_magic_link_verify/);
  assert.match(emailFlow, /withDatabaseContext\(authOperationContext/);
  assert.match(emailFlow, /withAuthenticatedDatabaseContext\(opened\.userId/);
  assert.match(runtime, /Tenant membership is ambiguous/);
  assert.match(runtime, /Tenant membership is not usable/);
});

const [agmtWrites, documentUploadWrites, auditWrites] = await Promise.all([
  readFile(new URL("../src/lib/fn/agmt.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/fn/document-upload.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/server/audit.ts", import.meta.url), "utf8"),
]);

function insertedColumnLists(source, table) {
  return [...source.matchAll(new RegExp(
    "insert\\s+into\\s+" + table + "\\s*\\(([\\s\\S]*?)\\)\\s+values",
    "gi",
  ))].map((match) => match[1]);
}

test("FND-04 application writes carry the server-derived tenant", () => {
  const tenantOwnedWrites = [
    ["matter", agmtWrites],
    ["mandate_version", agmtWrites],
    ["deletion_job", agmtWrites],
    ["document", agmtWrites + "\n" + documentUploadWrites],
    ["document_version", agmtWrites + "\n" + documentUploadWrites],
    ["canonicalisation_map", agmtWrites + "\n" + documentUploadWrites],
    ["canonicalisation_entry", agmtWrites + "\n" + documentUploadWrites],
    ["canonical_projection", agmtWrites],
    ["provision", agmtWrites],
    ["definition", agmtWrites],
    ["definition_use", agmtWrites],
    ["deal_map_entry", agmtWrites],
    ["source_capability", agmtWrites + "\n" + documentUploadWrites],
    ["proof_run", agmtWrites],
    ["proof_check_execution", agmtWrites],
    ["proof_hit", agmtWrites],
    ["proof_feedback_ticket", agmtWrites],
    ["review_entitlement", account],
  ];
  for (const [table, source] of tenantOwnedWrites) {
    const lists = insertedColumnLists(source, table);
    assert.ok(lists.length > 0, "no insert found for " + table);
    assert.ok(
      lists.every((columns) => /\btenant_id\b/i.test(columns)),
      "insert into " + table + " omits tenant_id",
    );
  }
  assert.match(auditWrites, /tenant_id/);
});
