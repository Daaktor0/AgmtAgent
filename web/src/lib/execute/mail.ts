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

/** The same look as the sign-in email: paper, a serif wordmark, an oxblood rule. */
function layout(bodyHtml: string, footer: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f0e9;color:#201d1b;font-family:Arial,Helvetica,sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f0e9;padding:40px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffdf9;border:1px solid #d8d0c8;border-radius:2px">
          <tr><td style="padding:34px 38px 12px">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1;color:#201d1b">Agmt</div>
            <div style="margin-top:8px;width:38px;height:2px;background:#6f1d2b"></div>
          </td></tr>
          <tr><td style="padding:18px 38px 38px">${bodyHtml}</td></tr>
        </table>
        <p style="max-width:560px;margin:16px auto 0;color:#8b827c;font-size:11px;line-height:1.5">${footer}</p>
      </td></tr>
    </table>
  </body>
</html>`;
}

const P = 'style="margin:16px 0 0;color:#514b47;font-size:15px;line-height:1.7"';

export type AccessRequest = { name: string; email: string; firm?: string; note?: string };

/** To the person who asked: thanks, what happens next, reply to reach us. */
export function accessThanks(request: AccessRequest): { subject: string; text: string; html: string } {
  const who = greetingName(request.name);
  const firm = request.firm?.trim();
  const lines = [
    `Hi ${who},`,
    "",
    `Thank you for asking to try Agmt${firm ? ` at ${firm}` : ""}. Your request is noted, and we'll remember it.`,
    "",
    "We're opening Agmt to a small group of lawyers first, so we can learn from real closings and get every detail right. As soon as your place is ready, we'll email you a personal invite link. There is nothing else you need to do.",
    "",
    "What you'll be able to do: add the final agreement, send each party its signature page, drop in the countersigned pages and stamp papers as they come back, and download a complete executed copy for every party. It all happens on your own computer; your documents are never uploaded.",
    "",
    "If you have a question, or a closing coming up that you'd like to try it on, just reply to this email.",
    "",
    "With thanks,",
    "Agmt",
  ];
  const html = layout(
    `<p style="margin:0;color:#514b47;font-size:15px;line-height:1.7">Hi ${escapeHtml(who)},</p>
     <h1 style="margin:12px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:500;line-height:1.25;color:#201d1b">Thank you for your interest in Agmt</h1>
     <p ${P}>Your request${firm ? ` for ${escapeHtml(firm)}` : ""} is noted, and we'll remember it.</p>
     <p ${P}>We're opening Agmt to a small group of lawyers first, so we can learn from real closings and get every detail right. As soon as your place is ready, we'll email you a personal invite link. There is nothing else you need to do.</p>
     <p ${P}>What you'll be able to do: add the final agreement, send each party its signature page, drop in the countersigned pages and stamp papers as they come back, and download a complete executed copy for every party. It all happens on your own computer; your documents are never uploaded.</p>
     <p ${P}>If you have a question, or a closing coming up that you'd like to try it on, just reply to this email.</p>
     <p ${P}>With thanks,<br>Agmt</p>`,
    "You're receiving this because you asked for access at app.agmt.legal. If that wasn't you, you can ignore this email.",
  );
  return { subject: "Thank you for your interest in Agmt", text: lines.join("\n"), html };
}

/** To the founder: who asked, and the command that invites them. */
export function accessNotice(request: AccessRequest, acknowledged: boolean): { subject: string; text: string } {
  const firm = request.firm?.trim();
  const label = `${request.name.trim()}${firm ? `, ${firm}` : ""}`.replace(/"/g, "'");
  return {
    subject: `Access request: ${label}`,
    text: [
      `${request.name} asked for access to Agmt.`,
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
