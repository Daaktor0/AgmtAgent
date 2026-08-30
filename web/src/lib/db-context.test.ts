import assert from "node:assert/strict";
import test from "node:test";

import {
  currentDatabaseContext,
  databaseContextSettings,
  withDatabaseContext,
  type DatabaseRuntimeContext,
} from "./db-context.server.ts";

const appContext: DatabaseRuntimeContext = {
  userId: "user-1",
  tenantId: "tenant-1",
  runtimeRole: "app",
};

test("database context is absent outside a request", () => {
  assert.equal(currentDatabaseContext(), null);
});

test("database context is restored after nested work", async () => {
  const nestedResult = await withDatabaseContext(appContext, async () => {
    assert.deepEqual(currentDatabaseContext(), appContext);
    const result = await withDatabaseContext(
      { ...appContext, tenantId: null },
      async () => {
        assert.deepEqual(currentDatabaseContext(), { ...appContext, tenantId: null });
        return currentDatabaseContext();
      },
    );
    assert.deepEqual(currentDatabaseContext(), appContext);
    return result;
  });

  assert.deepEqual(nestedResult, { ...appContext, tenantId: null });
  assert.equal(currentDatabaseContext(), null);
});

test("context settings contain only server-derived values", () => {
  assert.deepEqual(databaseContextSettings({
    ...appContext,
    supportTicket: "ticket-123",
  }), [
    ["agmt.user_id", "user-1"],
    ["agmt.tenant_id", "tenant-1"],
    ["agmt.support_ticket", "ticket-123"],
    ["agmt.operation", ""],
  ]);
  assert.deepEqual(databaseContextSettings({ ...appContext, tenantId: null }), [
    ["agmt.user_id", "user-1"],
    ["agmt.tenant_id", ""],
    ["agmt.support_ticket", ""],
    ["agmt.operation", ""],
  ]);
});

test("authentication operation context is explicit and tenantless", () => {
  assert.deepEqual(databaseContextSettings({
    userId: "auth-flow",
    tenantId: null,
    runtimeRole: "app",
    operation: "auth_magic_link_request",
  }), [
    ["agmt.user_id", "auth-flow"],
    ["agmt.tenant_id", ""],
    ["agmt.support_ticket", ""],
    ["agmt.operation", "auth_magic_link_request"],
  ]);
  assert.throws(() => databaseContextSettings({
    ...appContext,
    operation: "auth_magic_link_verify",
  }), /cannot be combined with a tenant context/);
});
