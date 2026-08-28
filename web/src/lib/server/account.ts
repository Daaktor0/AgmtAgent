import { getSql } from "@/lib/db";
import { auth } from "@/lib/auth/server";
import { nowIso } from "@/lib/agmt/ids";
import { auditLog } from "@/lib/agmt/log";

export type Account = {
  userId: string;
  emailNormalised: string | null;
  emailVerifiedAt: string | null;
  displayName: string | null;
  status: string;
};

/**
 * Resolve the Better Auth user by id. Live preview sessions ride a bearer
 * token, so cookies on this request are often empty — never look the email
 * up from getSessionUser() without that bearer.
 *
 * Any Better Auth email is treated as verified for Agmt: Google is a broker
 * identity, and the product-layer magic link marks emailVerified before
 * ensureAccount runs.
 */
async function identityFor(userId: string): Promise<{
  email: string | null;
  displayName: string | null;
}> {
  try {
    const ctx = await auth.$context;
    const user = await ctx.internalAdapter.findUserById(userId);
    const email = user?.email?.trim().toLowerCase() || null;
    const displayName = user?.name?.trim() || email;
    return { email, displayName };
  } catch {
    return { email: null, displayName: null };
  }
}

export async function ensureAccount(userId: string): Promise<Account> {
  const sql = await getSql();
  const { email, displayName } = await identityFor(userId);
  const verified = Boolean(email);
  const existing = await sql<Account>`
    select user_id as "userId", email_normalised as "emailNormalised",
           email_verified_at as "emailVerifiedAt", display_name as "displayName", status
    from user_account where user_id = ${userId}
  `;
  if (existing[0]) {
    if (verified && email && (!existing[0].emailVerifiedAt || !existing[0].emailNormalised)) {
      const at = existing[0].emailVerifiedAt ?? nowIso();
      const name = existing[0].displayName ?? displayName ?? email;
      await sql`
        update user_account
        set email_normalised = ${email},
            email_verified_at = ${at},
            display_name = ${name}
        where user_id = ${userId}
      `;
      return { ...existing[0], emailNormalised: email, emailVerifiedAt: at, displayName: name };
    }
    return existing[0];
  }
  await sql`
    insert into user_account (user_id, email_normalised, email_verified_at, display_name, status, created_at)
    values (${userId}, ${email}, ${verified ? nowIso() : null}, ${displayName ?? email}, 'active', ${nowIso()})
  `;
  await sql`
    insert into review_entitlement (user_id, review_enabled, extra_run_credits, stronger_override_credits)
    values (${userId}, false, 0, 0)
    on conflict (user_id) do nothing
  `;
  auditLog("account.ensure", { user_id: userId });
  return {
    userId,
    emailNormalised: email,
    emailVerifiedAt: verified ? nowIso() : null,
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
