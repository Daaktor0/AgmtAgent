import { AsyncLocalStorage } from "node:async_hooks";

export type DatabaseRuntimeRole = "app" | "worker" | "support";

export type DatabaseRuntimeContext = {
  userId: string;
  tenantId: string | null;
  runtimeRole: DatabaseRuntimeRole;
  supportTicket?: string | null;
};

const contextStorage = new AsyncLocalStorage<DatabaseRuntimeContext>();

function requireNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`Database context requires ${label}.`);
  return normalized;
}

function validateContext(context: DatabaseRuntimeContext): void {
  requireNonEmpty(context.userId, "user id");
  if (context.tenantId !== null) requireNonEmpty(context.tenantId, "tenant id");
  if (context.runtimeRole === "worker" || context.runtimeRole === "support") {
    if (!context.tenantId) throw new Error(`Database ${context.runtimeRole} context requires a tenant id.`);
  }
  if (context.runtimeRole === "support" && !context.supportTicket?.trim()) {
    throw new Error("Database support context requires a support ticket.");
  }
}

export function currentDatabaseContext(): DatabaseRuntimeContext | null {
  return contextStorage.getStore() ?? null;
}

export function withDatabaseContext<T>(
  context: DatabaseRuntimeContext,
  callback: () => T | Promise<T>,
): Promise<T> {
  validateContext(context);
  return contextStorage.run(context, async () => callback());
}

export function databaseContextSettings(
  context: DatabaseRuntimeContext,
): Array<[name: string, value: string]> {
  validateContext(context);
  return [
    ["agmt.user_id", context.userId.trim()],
    ["agmt.tenant_id", context.tenantId?.trim() ?? ""],
    ["agmt.support_ticket", context.supportTicket?.trim() ?? ""],
  ];
}
