import { createServerFn } from "@tanstack/react-start";
import { randomBytes } from "node:crypto";
import { getSql } from "@/lib/db";
import { writeAudit } from "@/lib/server/audit";
import { hashToken } from "@/lib/agmt/crypto";
import { newId, nowIso } from "@/lib/agmt/ids";
import {
  MAGIC_LINK_RATE_EMAIL,
  MAGIC_LINK_RATE_WINDOW_MS,
  MAGIC_LINK_SUBJECT,
  MAGIC_LINK_TTL_MS,
} from "@/lib/agmt/config";

const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

function publicOrigin(): string {
  const configured = env("AGMT_PUBLIC_URL") ?? env("BETTER_AUTH_URL");
  if (configured) return configured.replace(/\/+$/, "");

  const vercelHost = env("VERCEL_PROJECT_PRODUCTION_URL") ?? env("VERCEL_URL");
  if (vercelHost) {
    return /^https?:\/\//i.test(vercelHost)
      ? vercelHost.replace(/\/+$/, "")
      : `https://${vercelHost.replace(/\/+$/, "")}`;
  }
  return "http://localhost:8080";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const table: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return table[character] ?? character;
  });
}

function verificationEmail(url: string): { html: string; text: string } {
  const safeUrl = escapeHtml(url);
  const support = env("AUTH_SUPPORT_EMAIL");
  const supportHtml = support
    ? `<p style="margin:24px 0 0;color:#6f6763;font-size:13px;line-height:1.6">Need help? Reply to this email or contact ${escapeHtml(support)}.</p>`
    : "";
  const supportText = support ? `\nNeed help? Contact ${support}.` : "";

  return {
    html: `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f0e9;color:#201d1b;font-family:Arial,Helvetica,sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f0e9;padding:40px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffdf9;border:1px solid #d8d0c8;border-radius:2px">
          <tr><td style="padding:34px 38px 12px">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1;color:#201d1b">Agmt</div>
            <div style="margin-top:8px;width:38px;height:2px;background:#6f1d2b"></div>
          </td></tr>
          <tr><td style="padding:18px 38px 38px">
            <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:500;line-height:1.25;color:#201d1b">Sign in to your workspace</h1>
            <p style="margin:16px 0 0;color:#514b47;font-size:15px;line-height:1.7">Use the secure link below to sign in to Agmt. The link can be used once and expires in 15 minutes.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px">
              <tr><td bgcolor="#6f1d2b" style="border-radius:2px">
                <a href="${safeUrl}" style="display:inline-block;padding:13px 20px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:.01em">Sign in to Agmt</a>
              </td></tr>
            </table>
            <p style="margin:22px 0 0;color:#6f6763;font-size:13px;line-height:1.6">If you did not request this email, you can ignore it. No account access is granted unless the link is opened.</p>
            ${supportHtml}
          </td></tr>
        </table>
        <p style="max-width:560px;margin:16px auto 0;color:#8b827c;font-size:11px;line-height:1.5">Agmt · Proof for transactional documents</p>
      </td></tr>
    </table>
  </body>
</html>`,
    text: `Sign in to Agmt\n\nUse this secure, single-use link to sign in:\n${url}\n\nThis link expires in 15 minutes. If you did not request it, ignore this email.${supportText}`,
  };
}

async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const apiKey = env("RESEND_API_KEY");
  if (!apiKey) {
    throw Object.assign(
      new Error("Email sign-in is not configured yet. Continue with Google for now."),
      { code: "email_provider_not_configured" },
    );
  }

  const from = env("AUTH_EMAIL_FROM") ?? "Agmt <onboarding@resend.dev>";
  const verifyUrl = `${publicOrigin()}/verify?token=${encodeURIComponent(token)}`;
  const email = verificationEmail(verifyUrl);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: MAGIC_LINK_SUBJECT,
      html: email.html,
      text: email.text,
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    console.error(`[auth.email] provider rejected request status=${response.status} detail=${detail}`);
    throw Object.assign(
      new Error("We could not send the sign-in email. Try again or continue with Google."),
      { code: "email_delivery_failed" },
    );
  }
}

export const requestMagicLink = createServerFn({ method: "POST" })
  .validator((data: { email: string }) => data)
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Enter a valid email address.");
    }

    const sql = await getSql();
    const windowStart = new Date(Date.now() - MAGIC_LINK_RATE_WINDOW_MS).toISOString();
    const recent = await sql<{ n: number }>`
      select count(*) as n
      from magic_link_token
      where email_normalised = ${email} and created_at > ${windowStart}
    `;
    if (Number(recent[0]?.n ?? 0) >= MAGIC_LINK_RATE_EMAIL) {
      throw new Error("Too many sign-in requests. Try again in 15 minutes.");
    }

    const rawToken = randomBytes(32).toString("base64url");
    const tokenId = newId();
    const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS).toISOString();
    await sql`
      insert into magic_link_token (token_id, email_normalised, token_hash, expires_at)
      values (${tokenId}, ${email}, ${hashToken(rawToken)}, ${expiresAt})
    `;

    try {
      await sendVerificationEmail(email, rawToken);
    } catch (error) {
      await sql`delete from magic_link_token where token_id = ${tokenId}`;
      throw error;
    }

    await writeAudit({
      action: "auth.magic_link_request",
      subjectType: "magic_link_token",
      subjectId: tokenId,
      detailCodes: { delivery: "email" },
    });

    return {
      ok: true as const,
      subject: MAGIC_LINK_SUBJECT,
      expiresMinutes: Math.round(MAGIC_LINK_TTL_MS / 60000),
    };
  });

export const verifyMagicLink = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    if (!data.token || data.token.length > 256) {
      throw new Error("This sign-in link is invalid.");
    }

    const sql = await getSql();
    const tokenHash = hashToken(data.token);
    const usedAt = nowIso();
    const rows = await sql<{ token_id: string; email_normalised: string }>`
      update magic_link_token
      set used_at = ${usedAt}
      where token_hash = ${tokenHash}
        and used_at is null
        and expires_at > ${usedAt}
      returning token_id, email_normalised
    `;
    const token = rows[0];
    if (!token) {
      throw new Error("This sign-in link is invalid, expired, or has already been used.");
    }

    const { openVerifiedEmailSession } = await import("@/lib/server/session");
    const opened = await openVerifiedEmailSession(token.email_normalised);

    await sql`
      insert into user_account (user_id, email_normalised, email_verified_at, display_name, status)
      values (${opened.userId}, ${token.email_normalised}, ${usedAt}, ${token.email_normalised}, 'active')
      on conflict (user_id) do update
      set email_verified_at = excluded.email_verified_at,
          email_normalised = excluded.email_normalised
    `;
    await sql`
      insert into review_entitlement (user_id, review_enabled)
      values (${opened.userId}, false)
      on conflict (user_id) do nothing
    `;
    await writeAudit({
      ownerUserId: opened.userId,
      userId: opened.userId,
      action: "auth.magic_link_verify",
      subjectType: "user_account",
      subjectId: opened.userId,
    });

    return {
      ok: true as const,
      sessionToken: opened.sessionToken,
      email: token.email_normalised,
    };
  });
