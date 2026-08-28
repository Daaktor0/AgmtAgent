import { getSql } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/verify.server";
import { nowIso } from "@/lib/agmt/ids";
import { auditLog } from "@/lib/agmt/log";

export type Account = {
  userId: string;
  emailNormalised: string | null;
  emailVerifiedAt: string | null;
  displayName: string | null;
  status: string;
};

export async function ensureAccount(userId: string, bearer?: string): Promise<Account> {
  const sql = await getSql();
  const session = await getSessionUser(bearer);
  const email = session?.email?.toLowerCase() ?? null;
  const verified = Boolean(email);
  const existing = await sql<Account>`
    select user_id as "userId", email_normalised as "emailNormalised",
           email_verified_at as "emailVerifiedAt", display_name as "displayName", status
    from user_account where user_id = ${userId}
  `;
  if (existing[0]) {
    if (verified && !existing[0].emailVerifiedAt && email) {
      await sql`
        update user_account
        set email_normalised = ${email}, email_verified_at = ${nowIso()}
        where user_id = ${userId}
      `;
      return { ...existing[0], emailNormalised: email, emailVerifiedAt: nowIso() };
    }
    return existing[0];
  }
  await sql`
    insert into user_account (user_id, email_normalised, email_verified_at, display_name, status, created_at)
    values (${userId}, ${email}, ${verified ? nowIso() : null}, ${email}, 'active', ${nowIso()})
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
    displayName: email,
    status: "active",
  };
}

export async function requireVerified(userId: string): Promise<Account> {
  const sql = await getSql();
  const rows = await sql<Account>`
    select user_id as "userId", email_normalised as "emailNormalised",
           email_verified_at as "emailVerifiedAt", display_name as "displayName", status
    from user_account where user_id = ${userId}
  `;
  const a = rows[0];
  if (!a) throw new Error("Unauthorized");
  if (!a.emailVerifiedAt) {
    throw Object.assign(new Error("Email is not verified. Verify your email for Agmt before opening a Matter pack."), {
      code: "unverified_email",
    });
  }
  if (a.status !== "active") {
    throw Object.assign(new Error("Account is not active."), { code: "disabled" });
  }
  return a;
}
