import { getSql } from "@/lib/db";
import { ensureAccount } from "@/lib/server/account";
import {
  withDatabaseContext,
  type DatabaseRuntimeContext,
} from "@/lib/db-context.server";

export type AuthenticatedDatabaseContext = {
  tenantId: string;
};

export class TenantContextError extends Error {
  readonly code = "tenant_context_unavailable";

  constructor(message = "A unique active tenant context is required.") {
    super(message);
    this.name = "TenantContextError";
  }
}

function requiredUserId(userId: string): string {
  const normalized = userId.trim();
  if (!normalized) throw new TenantContextError("Verified user id is required.");
  return normalized;
}

type MembershipRow = {
  tenantId: string;
  status: "active" | "suspended" | "deleted";
  role: "owner" | "member" | "support";
};

const appContext = (userId: string, tenantId: string | null): DatabaseRuntimeContext => ({
  userId,
  tenantId,
  runtimeRole: "app",
});

/**
 * Establish a server-derived tenant context before application data access.
 *
 * The first request for a verified identity bootstraps a tenant whose id is
 * the identity id. Existing membership is inspected while tenant_id is null;
 * the RLS policy exposes membership metadata for the verified user only so a
 * second tenant cannot be silently created. Any suspended, unsupported, or
 * ambiguous membership fails closed.
 */
export async function withAuthenticatedDatabaseContext<T>(
  userId: string,
  callback: (context: AuthenticatedDatabaseContext) => Promise<T>,
): Promise<T> {
  const verifiedUserId = requiredUserId(userId);

  return withDatabaseContext(appContext(verifiedUserId, null), async () => {
    const account = await ensureAccount(verifiedUserId, {
      ensureEntitlement: false,
    });
    if (account.status !== "active") {
      throw new TenantContextError("Account is not active.");
    }

    const sql = await getSql();
    const memberships = await sql<MembershipRow>`
      select m.tenant_id as "tenantId", t.status, m.role
      from agmt_tenant_member m
      join agmt_tenant t on t.tenant_id = m.tenant_id
      where m.user_id = ${verifiedUserId}
    `;

    if (memberships.length > 1) {
      throw new TenantContextError("Tenant membership is ambiguous.");
    }

    let tenantId: string;
    if (memberships.length === 1) {
      const membership = memberships[0];
      if (
        membership.status !== "active" ||
        (membership.role !== "owner" && membership.role !== "member")
      ) {
        throw new TenantContextError("Tenant membership is not usable.");
      }
      tenantId = membership.tenantId;
    } else {
      tenantId = verifiedUserId;
      await withDatabaseContext(appContext(verifiedUserId, tenantId), async () => {
        await sql.transaction(async (transactionSql) => {
          await transactionSql`
            insert into agmt_tenant (tenant_id, status)
            values (${tenantId}, 'active')
            on conflict (tenant_id) do nothing
          `;
          await transactionSql`
            insert into agmt_tenant_member (tenant_id, user_id, role)
            values (${tenantId}, ${verifiedUserId}, 'owner')
            on conflict (tenant_id, user_id) do nothing
          `;
        });
        await ensureAccount(verifiedUserId);
      });
    }

    return withDatabaseContext(appContext(verifiedUserId, tenantId), () =>
      callback({ tenantId }),
    );
  });
}
