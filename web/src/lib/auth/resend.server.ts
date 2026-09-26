import { APIError } from "better-auth/api";
import { serverEnv } from "../runtime-env.server.ts";
import { AUTH_ERROR_CODES } from "./error-codes.ts";

type VerificationUser = {
  email: string;
  name?: string | null;
};

const VERIFICATION_SUBJECT = "Confirm your email for Agmt";
const RESEND_REQUEST_TIMEOUT_MS = 10_000;

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

function verificationEmail(url: string, name: string | null | undefined): { html: string; text: string } {
  const safeUrl = escapeHtml(url);
  const greeting = name?.trim() ? `Dear ${escapeHtml(name.trim())},` : "Hello,";
  const textGreeting = name?.trim() ? `Dear ${name.trim()},` : "Hello,";
  return {
    html: `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4efe6;color:#1c1917;font-family:Arial,Helvetica,sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4efe6;padding:36px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fbf8f1;border:1px solid #d9d2c4;border-radius:2px">
          <tr><td style="padding:26px 32px 20px;border-bottom:1px solid #1c1917">
            <span style="font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:600;line-height:1;letter-spacing:-0.03em;color:#1c1917">Agmt</span><span style="display:inline-block;width:5px;height:5px;background:#6b2b2b;vertical-align:top;margin:3px 0 0 3px"></span>
          </td></tr>
          <tr><td style="padding:26px 32px 32px">
            <h1 style="margin:0 0 4px;font-family:Georgia,'Times New Roman',serif;font-size:23px;font-weight:400;line-height:1.25;color:#1c1917">Confirm your email address</h1>
            <p style="margin:14px 0 0;color:#3b3734;font-size:15px;line-height:1.7">${greeting}</p>
            <p style="margin:14px 0 0;color:#3b3734;font-size:15px;line-height:1.7">Confirm your email address to finish setting up your Agmt account. This link expires in one hour.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 4px">
              <tr><td bgcolor="#6b2b2b" style="border-radius:2px">
                <a href="${safeUrl}" style="display:inline-block;padding:12px 20px;color:#fbf8f1;text-decoration:none;font-size:14px;font-weight:700">Confirm email</a>
              </td></tr>
            </table>
            <p style="margin:20px 0 0;color:#565b5f;font-size:13px;line-height:1.6">If you didn't create an Agmt account, you can ignore this email.</p>
          </td></tr>
        </table>
        <p style="max-width:560px;margin:14px auto 0;color:#565b5f;font-size:11.5px;line-height:1.5">Agmt</p>
      </td></tr>
    </table>
  </body>
</html>`,
    text: `${textGreeting}\n\nConfirm your email address to finish setting up your Agmt account:\n${url}\n\nThis link expires in one hour. If you didn't create an Agmt account, you can ignore this email.`,
  };
}

function fromHost(from: string): string {
  const match = from.match(/@([^>\s]+)/);
  return match?.[1]?.toLowerCase() ?? "unknown";
}

function productionMailRequired(): boolean {
  const publicUrl = serverEnv("AGMT_PUBLIC_URL") ?? serverEnv("BETTER_AUTH_URL") ?? "";
  return /agmt\.legal|workers\.dev/i.test(publicUrl);
}

export async function sendResendVerificationEmail(data: {
  user: VerificationUser;
  url: string;
}): Promise<void> {
  const { writeDevOutbox } = await import("../execute/mail.ts");
  const outbox = verificationEmail(data.url, data.user.name);
  if (await writeDevOutbox({ from: "dev", to: [data.user.email], subject: VERIFICATION_SUBJECT, ...outbox }, "verify-email").catch(() => false)) return;
  const apiKey = serverEnv("RESEND_API_KEY");
  if (!apiKey) {
    console.error("[auth.email] RESEND_API_KEY is not configured");
    throw new APIError("BAD_GATEWAY", {
      code: AUTH_ERROR_CODES.EMAIL_DELIVERY_FAILED,
      message: "We could not send the verification email.",
    });
  }

  const from = serverEnv("AUTH_EMAIL_FROM") ?? "Agmt <onboarding@resend.dev>";
  const testSender = !serverEnv("AUTH_EMAIL_FROM") || /onboarding@resend\.dev/i.test(from);
  if (testSender) {
    console.error("[auth.email] AUTH_EMAIL_FROM is unset or still the Resend test sender; only the Resend account owner can receive mail");
    if (productionMailRequired()) {
      throw new APIError("BAD_GATEWAY", {
        code: AUTH_ERROR_CODES.EMAIL_DELIVERY_FAILED,
        message: "We could not send the verification email.",
      });
    }
  }
  const email = verificationEmail(data.url, data.user.name);
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [data.user.email],
        subject: VERIFICATION_SUBJECT,
        html: email.html,
        text: email.text,
      }),
      signal: AbortSignal.timeout(RESEND_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    console.error(
      `[auth.email] provider request failed name=${error instanceof Error ? error.name : "unknown"}`,
    );
    throw new APIError("BAD_GATEWAY", {
      code: AUTH_ERROR_CODES.EMAIL_DELIVERY_FAILED,
      message: "We could not send the verification email.",
    });
  }

  if (!response.ok) {
    // Log only the provider's status — never the response body, which can
    // echo back the request (recipient address, subject).
    console.error(`[auth.email] provider rejected request status=${response.status} fromHost=${fromHost(from)}`);
    throw new APIError("BAD_GATEWAY", {
      code: AUTH_ERROR_CODES.EMAIL_DELIVERY_FAILED,
      message: "We could not send the verification email.",
    });
  }
}

/**
 * Forgot password. Better Auth answers the same whether or not the address
 * has an account, so a failure here is logged, never shown.
 */
export async function sendPasswordResetEmail(data: { user: VerificationUser; url: string }): Promise<void> {
  const { mailConfig, passwordReset, sendMail } = await import("../execute/mail.ts");
  const mail = mailConfig();
  const sent = await sendMail(mail, { to: [data.user.email], ...passwordReset(data.user.name, data.url) }, "password-reset");
  if (!sent) console.error(`[auth.email] password reset not sent: providerSet=${Boolean(mail.apiKey)} verifiedSender=${mail.verifiedSender}`);
}

/** A sign-up for an address that already has an account: send them home. */
export async function sendExistingAccountEmail(data: { user: VerificationUser }): Promise<void> {
  const { existingAccount, mailConfig, sendMail } = await import("../execute/mail.ts");
  const base = serverEnv("AGMT_PUBLIC_URL") ?? "http://localhost:8080";
  const mail = mailConfig();
  const reset = new URL("/reset-password", base);
  reset.searchParams.set("email", data.user.email);
  const sent = await sendMail(
    mail,
    { to: [data.user.email], ...existingAccount(data.user.name, { signIn: new URL("/", base).toString(), reset: reset.toString() }) },
    "existing-account",
  );
  if (!sent) console.error(`[auth.email] existing-account note not sent: providerSet=${Boolean(mail.apiKey)}`);
}
