import { getSql, type Sql } from "@/lib/db";
import { auth } from "@/lib/auth/server";
import { currentDatabaseContext } from "@/lib/db-context.server";
import { nowIso } from "@/lib/agmt/ids";
import { auditLog } from "@/lib/agmt/log";

export type Account = {
  userId: string;
  emailNormalised: string | null;
  emailVerifiedAt: string | null;
  displayName: string | null;
  status: string;
};

export type EnsureAccountOptions = {
  /**
   * The first request bootstraps user_account before the tenant membership
   * exists. Callers must pass false only inside the authenticated context
   * bootstrap boundary.
   */
  ensureEntitlement?: boolean;
};

/**
 * Resolve the Better Auth user by id. Live preview sessions ride a bearer
 * token, so cookies on this request are often empty — never look the email
 * up from getSessionUser() without that bearer.
 *
 * Only Better Auth's verified-email flag can cross the Agmt document-access
 * boundary. A password account is not trusted until its Resend link is used.
 */
async function identityFor(userId: string): Promise<{
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
}> {
  try {
    const ctx = await auth.$context;
    const user = await ctx.internalAdapter.findUserById(userId);
    const email = user?.email?.trim().toLowerCase() || null;
    const displayName = user?.name?.trim() || email;
    return { email, emailVerified: user?.emailVerified === true, displayName };
  } catch {
    return { email: null, emailVerified: false, displayName: null };
  }
}

async function ensureReviewEntitlement(sql: Sql, userId: string): Promise<void> {
  const tenantId = currentDatabaseContext()?.tenantId;
  if (!tenantId) {
    throw new Error("A tenant database context is required for review entitlement access.");
  }

  const existing = await sql<{ tenantId: string | null }>`
    select tenant_id as "tenantId"
    from review_entitlement
    where user_id = ${userId}
  `;
  if (existing[0]) {
    if (existing[0].tenantId && existing[0].tenantId !== tenantId) {
      throw new Error("Review entitlement belongs to a different tenant.");
    }
    if (!existing[0].tenantId) {
      await sql`
        update review_entitlement
        set tenant_id = ${tenantId}
        where user_id = ${userId} and tenant_id is null
      `;
    }
    return;
  }

  await sql`
    insert into review_entitlement (
      user_id, tenant_id, review_enabled, extra_run_credits, stronger_override_credits
    )
    values (${userId}, ${tenantId}, false, 0, 0)
  `;
}

export async function ensureAccount(
  userId: string,
  options: EnsureAccountOptions = {},
): Promise<Account> {
  const sql = await getSql();
  const { email, emailVerified, displayName } = await identityFor(userId);
  const existing = await sql<Account>`
    select user_id as "userId", email_normalised as "emailNormalised",
           email_verified_at as "emailVerifiedAt", display_name as "displayName", status
    from user_account where user_id = ${userId}
  `;
  if (existing[0]) {
    let account = existing[0];
    if (emailVerified && email && (!account.emailVerifiedAt || !account.emailNormalised)) {
      const at = account.emailVerifiedAt ?? nowIso();
      const name = account.displayName ?? displayName ?? email;
      await sql`
        update user_account
        set email_normalised = ${email},
            email_verified_at = ${at},
            display_name = ${name}
        where user_id = ${userId}
      `;
      account = { ...account, emailNormalised: email, emailVerifiedAt: at, displayName: name };
    }
    if (options.ensureEntitlement !== false) {
      await ensureReviewEntitlement(sql, userId);
    }
    return account;
  }

  const createdAt = nowIso();
  const emailVerifiedAt = emailVerified ? nowIso() : null;
  await sql`
    insert into user_account (user_id, email_normalised, email_verified_at, display_name, status, created_at)
    values (${userId}, ${email}, ${emailVerifiedAt}, ${displayName ?? email}, 'active', ${createdAt})
  `;
  if (options.ensureEntitlement !== false) {
    await ensureReviewEntitlement(sql, userId);
  }
  auditLog("account.ensure", { user_id: userId });
  return {
    userId,
    emailNormalised: email,
    emailVerifiedAt,
    displayName: displayName ?? email,
    status: "active",
  };
}

export async function requireVerified(userId: string): Promise<Account> {
  const account = await ensureAccount(userId);
  if (!account.emailVerifiedAt) {
    throw Object.assign(new Error("Email is not verified. Verify your email for Agmt before opening a Matter pack."), {
      code: "unverified_email",
    });
  }
  if (account.status !== "active") {
    throw Object.assign(new Error("Account is not active."), { code: "disabled" });
  }
  return account;
}
