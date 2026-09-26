/**
 * Email for executed copies, through the Resend account the app already uses
 * for sign-in. Three messages: a thank-you to someone who asks for access, a
 * note to the founder about that request, and feedback to the founder.
 *
 * Sender: AUTH_EMAIL_FROM (a verified domain). Without it Resend's test
 * sender only delivers to the Resend account owner, so mail to anyone else is
 * not attempted. Founder address: AGMT_FEEDBACK_TO.
 */
import { serverEnv } from "../runtime-env.server.ts";

export type MailConfig = {
  apiKey: string | null;
  from: string;
  /** True when the sender is a verified domain, not Resend's test sender. */
  verifiedSender: boolean;
  founder: string[];
};

export function mailConfig(): MailConfig {
  const configured = serverEnv("AUTH_EMAIL_FROM");
  const from = configured ?? "Agmt <onboarding@resend.dev>";
  return {
    apiKey: serverEnv("RESEND_API_KEY") ?? null,
    from,
    verifiedSender: Boolean(configured) && !/onboarding@resend\.dev/i.test(from),
    founder: (serverEnv("AGMT_FEEDBACK_TO") ?? "").split(",").map((v) => v.trim()).filter(Boolean),
  };
}

export type Message = { to: string[]; subject: string; text: string; html?: string; replyTo?: string };

/** Send one message. Never throws; logs the provider status, never the recipient. */
export async function sendMail(config: MailConfig, message: Message, tag: string): Promise<boolean> {
  if (!config.apiKey || message.to.length === 0) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error(`[execute.email] ${tag} rejected by provider status=${res.status}`);
    return res.ok;
  } catch {
    console.error(`[execute.email] ${tag} provider unreachable`);
    return false;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

/** First name for a greeting: "Priya Nair" -> "Priya"; "Adv. R. K. Sharma" stays whole. */
export function greetingName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0] ?? "";
  return parts.length > 1 && /^[A-Za-z][a-z]+$/.test(first) ? first : name.trim();
}

/** Where the email header image is served from: this app's own public folder. */
function publicUrl(): string {
  return (serverEnv("AGMT_PUBLIC_URL") ?? "https://app.agmt.legal").replace(/\/+$/, "");
}

/**
 * Execute's email frame, in the app's own colours: paper ground, a vellum
 * card, the lock-up over an ink rule. Tables and inline styles only, so Gmail,
 * Outlook and Apple Mail agree. The lock-up is a PNG because Outlook doesn't
 * render SVG; its alt text carries the name if images are off.
 */
export function layout(bodyHtml: string, footer: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4efe6;color:#1c1917;font-family:Arial,Helvetica,sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4efe6;padding:36px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fbf8f1;border:1px solid #d9d2c4;border-radius:2px">
          <tr><td style="padding:24px 32px 20px;border-bottom:1px solid #1c1917">
            <img src="${publicUrl()}/brand/execute-lockup-email.png" width="${LOCKUP_WIDTH}" height="36" alt="Execute by Agmt" style="display:block;border:0;outline:none;text-decoration:none;height:36px;width:${LOCKUP_WIDTH}px;font-family:Georgia,serif;font-size:20px;color:#1c1917">
          </td></tr>
          <tr><td style="padding:26px 32px 32px">${bodyHtml}</td></tr>
        </table>
        <p style="max-width:560px;margin:14px auto 0;color:#565b5f;font-size:11.5px;line-height:1.5;text-align:left">${footer}</p>
      </td></tr>
    </table>
  </body>
</html>`;
}

/** Width of public/brand/execute-lockup-email.png at 1x (it is drawn at 2x). */
const LOCKUP_WIDTH = 229;

const P = 'style="margin:14px 0 0;color:#3b3734;font-size:15px;line-height:1.7"';
const H = 'style="margin:0 0 4px;font-family:Georgia,\'Times New Roman\',serif;font-size:23px;font-weight:400;line-height:1.25;color:#1c1917"';

export type AccessRequest = { name: string; email: string; firm?: string; note?: string };

/** To the person who asked: thanks, what happens next, reply to reach us. */
export function accessThanks(request: AccessRequest): { subject: string; text: string; html: string } {
  const who = greetingName(request.name);
  const firm = request.firm?.trim();
  const lines = [
    `Dear ${who},`,
    "",
    `Thank you for asking for access to Execute${firm ? ` for ${firm}` : ""}.`,
    "",
    "Access is by invitation for now. When yours is ready, we'll email you a link to set up your account. There's nothing more you need to do.",
    "",
    "Execute assembles an executed copy for every party to a multi-party agreement: signature pages out, signed pages and stamp papers in. It runs in your browser, and your documents are not uploaded.",
    "",
    "If you have a closing coming up, or a question, reply to this email.",
    "",
    "Regards,",
    "Agmt",
    "",
    "--",
    "You're receiving this because you asked for access to Execute at app.agmt.legal. If that wasn't you, you can ignore this email.",
  ];
  const html = layout(
    `<h1 ${H}>Thank you for asking</h1>
     <p ${P}>Dear ${escapeHtml(who)},</p>
     <p ${P}>Thank you for asking for access to Execute${firm ? ` for ${escapeHtml(firm)}` : ""}.</p>
     <p ${P}>Access is by invitation for now. When yours is ready, we'll email you a link to set up your account. There's nothing more you need to do.</p>
     <p ${P}>Execute assembles an executed copy for every party to a multi-party agreement: signature pages out, signed pages and stamp papers in. It runs in your browser, and your documents are not uploaded.</p>
     <p ${P}>If you have a closing coming up, or a question, reply to this email.</p>
     <p ${P}>Regards,<br>Agmt</p>`,
    "You're receiving this because you asked for access to Execute at app.agmt.legal. If that wasn't you, you can ignore this email.",
  );
  return { subject: "Your request for Execute by Agmt", text: lines.join("\n"), html };
}

/** To the founder: who asked, and the command that invites them. */
export function accessNotice(request: AccessRequest, acknowledged: boolean): { subject: string; text: string } {
  const firm = request.firm?.trim();
  const label = `${request.name.trim()}${firm ? `, ${firm}` : ""}`.replace(/"/g, "'");
  return {
    subject: `Access request: ${label}`,
    text: [
      `${request.name} asked for access to Execute.`,
      "",
      `Name:  ${request.name}`,
      `Email: ${request.email}`,
      `Firm:  ${firm || "not given"}`,
      "",
      "What they sign most often:",
      request.note?.trim() || "(not given)",
      "",
      acknowledged ? "They were sent a thank-you email." : "No thank-you email could be sent to them (check AUTH_EMAIL_FROM).",
      "",
      "To invite them, from the web folder:",
      `  npm run execute:invite -- --label "${label}" --days 90`,
      "then send them the link. Reply to this email to write to them directly.",
    ].join("\n"),
  };
}
