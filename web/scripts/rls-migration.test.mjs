import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../migrations/0004_rls_runtime.sql", import.meta.url),
  "utf8",
);

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

const allProtectedTables = [
  ...tenantOwnedTables,
  "agmt_tenant",
  "agmt_tenant_member",
  "user_account",
  "magic_link_token",
  "app_config",
  "_migrations",
  '"user"',
  '"session"',
  '"account"',
  '"verification"',
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^()|[\\]\\\\]/g, "\\\\$&");
}

function tablePattern(table) {
  return new RegExp(
    "alter\\s+table\\s+public\\." +
      escapeRegExp(table) +
      "\\s+enable\\s+row\\s+level\\s+security\\s*;",
    "i",
  );
}

function policyPattern(table, suffix) {
  return new RegExp(
    "create\\s+policy\\s+" + table + "_" + suffix + "\\b[\\s\\S]*?on\\s+public\\." + table +
      "\\b",
    "i",
  );
}

test("FND-04 enables and forces RLS on every public table", () => {
  for (const table of allProtectedTables) {
    const unquoted = table.replaceAll('"', "");
    assert.match(migration, tablePattern(table), "RLS is not enabled for " + table);
    assert.match(
      migration,
      new RegExp(
        "alter\\s+table\\s+public\\." +
          escapeRegExp(table) +
          "\\s+force\\s+row\\s+level\\s+security\\s*;",
        "i",
      ),
      "RLS is not forced for " + table,
    );
    if (tenantOwnedTables.includes(unquoted)) {
      assert.match(migration, policyPattern(unquoted, "app_select"));
      assert.match(migration, policyPattern(unquoted, "app_write"));
      assert.match(migration, policyPattern(unquoted, "worker_all"));
      assert.match(migration, policyPattern(unquoted, "support_select"));
    }
  }
});

test("FND-04 defines non-login, non-bypass runtime roles", () => {
  for (const role of ["agmt_app", "agmt_worker", "agmt_support", "agmt_auth"]) {
    assert.match(migration, new RegExp("[\"']" + role + "[\"']", "i"));
  }
  assert.match(
    migration,
    /create role %i nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls/i,
  );
  assert.match(migration, /rolbypassrls/);
  assert.match(migration, /role attributes are checked/i);
});

test("FND-04 context functions are invoker-safe and server-setting based", () => {
  assert.match(migration, /create schema if not exists agmt_private/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /current_setting\('agmt\.user_id'/i);
  assert.match(migration, /current_setting\('agmt\.tenant_id'/i);
  assert.match(migration, /current_setting\('agmt\.support_ticket'/i);
  assert.match(migration, /current_setting\('agmt\.operation'/i);
  assert.doesNotMatch(migration, /auth\.uid\s*\(/i);
  assert.doesNotMatch(migration, /service_role/i);
});

test("FND-04 policies fail closed for missing context and include checks", () => {
  assert.match(migration, /with check/i);
  assert.match(migration, /current_tenant_id\(\) is not null/i);
  assert.match(migration, /support_ticket\(\) is not null/i);
  assert.match(migration, /auth_insert/i);
  assert.match(migration, /array\['anon', 'authenticated'\]/i);
  assert.match(migration, /revoke all on all tables in schema public/i);
});

test("FND-04 migration has no destructive or secret-bearing operation", () => {
  assert.doesNotMatch(migration, /\\b(drop|truncate|delete)\\b/i);
  assert.doesNotMatch(migration, /password|secret|private key/i);
});
