import { APIError } from "better-auth/api";
import { serverEnv } from "../runtime-env.server.ts";
import { AUTH_ERROR_CODES } from "./error-codes.ts";

type VerificationUser = {
  email: string;
  name?: string | null;
};

const VERIFICATION_SUBJECT = "Verify your email for Agmt";
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
  const greeting = name?.trim() ? `Hi ${escapeHtml(name.trim())},` : "Hello,";
  const textGreeting = name?.trim() ? `Hi ${name.trim()},` : "Hello,";
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
            <p style="margin:0;color:#514b47;font-size:15px;line-height:1.7">${greeting}</p>
            <h1 style="margin:12px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:500;line-height:1.25;color:#201d1b">Verify your email address</h1>
            <p style="margin:16px 0 0;color:#514b47;font-size:15px;line-height:1.7">Confirm your email to sign in to Agmt and use Proof. This link expires in one hour.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px">
              <tr><td bgcolor="#6f1d2b" style="border-radius:2px">
                <a href="${safeUrl}" style="display:inline-block;padding:13px 20px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:.01em">Verify email</a>
              </td></tr>
            </table>
            <p style="margin:22px 0 0;color:#6f6763;font-size:13px;line-height:1.6">If you did not create an Agmt account, you can ignore this email.</p>
          </td></tr>
        </table>
        <p style="max-width:560px;margin:16px auto 0;color:#8b827c;font-size:11px;line-height:1.5">Agmt · Proof for transactional documents</p>
      </td></tr>
    </table>
  </body>
</html>`,
    text: `${textGreeting}\n\nVerify your email address to sign in to Agmt and use Proof:\n${url}\n\nThis link expires in one hour. If you did not create an Agmt account, ignore this email.`,
  };
}

export async function sendResendVerificationEmail(data: {
  user: VerificationUser;
  url: string;
}): Promise<void> {
  const apiKey = serverEnv("RESEND_API_KEY");
  if (!apiKey) {
    console.error("[auth.email] RESEND_API_KEY is not configured");
    throw new APIError("BAD_GATEWAY", {
      code: AUTH_ERROR_CODES.EMAIL_DELIVERY_FAILED,
      message: "We could not send the verification email.",
    });
  }

  const from = serverEnv("AUTH_EMAIL_FROM") ?? "Agmt <onboarding@resend.dev>";
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
    console.error(`[auth.email] provider rejected request status=${response.status}`);
    throw new APIError("BAD_GATEWAY", {
      code: AUTH_ERROR_CODES.EMAIL_DELIVERY_FAILED,
      message: "We could not send the verification email.",
    });
  }
}
