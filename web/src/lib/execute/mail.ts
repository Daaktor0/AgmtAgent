/**
 * Email for executed copies, through the Resend account the app already uses
 * for sign-in: a thank-you to someone who asks for access, a note to the
 * founder with Approve / Not yet / Decline buttons, the decision itself to
 * the person ("You're in", "Not yet", "Declined"), a password reset, and
 * feedback to the founder.
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

/**
 * Local development only: with AGMT_DEV_OUTBOX set to a file path, email is
 * appended to that file instead of being sent, so the account journey can be
 * tried end to end without a mail provider. Never in the Worker, never in a
 * production build.
 */
function devOutboxPath(): string | null {
  if (typeof process === "undefined" || process.env.NODE_ENV === "production") return null;
  if (typeof navigator === "object" && navigator !== null && navigator.userAgent === "Cloudflare-Workers") return null;
  return process.env.AGMT_DEV_OUTBOX?.trim() || null;
}

export async function writeDevOutbox(message: Message & { from: string }, tag: string): Promise<boolean> {
  const path = devOutboxPath();
  if (!path) return false;
  const { appendFile } = await import("node:fs/promises");
  await appendFile(path, `${JSON.stringify({ tag, ...message, at: new Date().toISOString() })}\n`);
  return true;
}

/** Send one message. Never throws; logs the provider status, never the recipient. */
export async function sendMail(config: MailConfig, message: Message, tag: string): Promise<boolean> {
  if (message.to.length === 0) return false;
  if (await writeDevOutbox({ ...message, from: config.from }, tag).catch(() => false)) return true;
  if (!config.apiKey) return false;
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

/** A button that survives email clients: a table cell with an oxblood fill. */
function button(href: string, label: string, primary = true): string {
  const safe = escapeHtml(href);
  return primary
    ? `<td bgcolor="#6f1d2b" style="border-radius:2px"><a href="${safe}" style="display:inline-block;padding:12px 18px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700">${escapeHtml(label)}</a></td>`
    : `<td style="border:1px solid #201d1b;border-radius:2px"><a href="${safe}" style="display:inline-block;padding:11px 17px;color:#201d1b;text-decoration:none;font-size:14px;font-weight:700">${escapeHtml(label)}</a></td>`;
}

function buttons(...cells: string[]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 6px"><tr>${cells.join('<td style="width:10px"></td>')}</tr></table>`;
}

const H1 = `style="margin:12px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:500;line-height:1.25;color:#201d1b"`;
const HI = 'style="margin:0;color:#514b47;font-size:15px;line-height:1.7"';
const SMALL = 'style="margin:22px 0 0;color:#6f6763;font-size:13px;line-height:1.6"';
const WHY = "You're receiving this because you asked for access at app.agmt.legal.";

export type AccessRequest = { name: string; email: string; firm?: string; note?: string };
export type Mail = { subject: string; text: string; html: string };

/** To the person who asked: thanks, what happens next, reply to reach us. */
export function accessThanks(request: AccessRequest): Mail {
  const who = greetingName(request.name);
  const firm = request.firm?.trim();
  const lines = [
    `Hi ${who},`,
    "",
    `Thank you for asking to try Agmt${firm ? ` at ${firm}` : ""}. Your request is noted, and we'll remember it.`,
    "",
    "We're opening Agmt to a small group of lawyers first, so we can learn from real closings and get every detail right. As soon as your place is ready, we'll email you to set up your account. There is nothing else you need to do.",
    "",
    "What you'll be able to do: add the final agreement, send each party its signature page, drop in the countersigned pages and stamp papers as they come back, and download a complete executed copy for every party. It all happens on your own computer; your documents are never uploaded.",
    "",
    "If you have a question, or a closing coming up that you'd like to try it on, just reply to this email.",
    "",
    "With thanks,",
    "Agmt",
  ];
  const html = layout(
    `<p ${HI}>Hi ${escapeHtml(who)},</p>
     <h1 ${H1}>Thank you for your interest in Agmt</h1>
     <p ${P}>Your request${firm ? ` for ${escapeHtml(firm)}` : ""} is noted, and we'll remember it.</p>
     <p ${P}>We're opening Agmt to a small group of lawyers first, so we can learn from real closings and get every detail right. As soon as your place is ready, we'll email you to set up your account. There is nothing else you need to do.</p>
     <p ${P}>What you'll be able to do: add the final agreement, send each party its signature page, drop in the countersigned pages and stamp papers as they come back, and download a complete executed copy for every party. It all happens on your own computer; your documents are never uploaded.</p>
     <p ${P}>If you have a question, or a closing coming up that you'd like to try it on, just reply to this email.</p>
     <p ${P}>With thanks,<br>Agmt</p>`,
    `${WHY} If that wasn't you, you can ignore this email.`,
  );
  return { subject: "Thank you for your interest in Agmt", text: lines.join("\n"), html };
}

/** To the founder: who asked, and one button per decision. */
export function accessNotice(request: AccessRequest, links: { decide: string }, context: { acknowledged: boolean; again: boolean }): Mail {
  const firm = request.firm?.trim();
  const label = `${request.name.trim()}${firm ? `, ${firm}` : ""}`;
  const note = request.note?.trim();
  const url = (action: string) => `${links.decide}?do=${action}`;
  const status = context.acknowledged ? "They were sent a thank-you email." : "No thank-you email could be sent to them (check AUTH_EMAIL_FROM).";
  const text = [
    `${request.name} ${context.again ? "asked again for" : "asked for"} access to Agmt.`,
    "",
    `Name:  ${request.name}`,
    `Email: ${request.email}`,
    `Firm:  ${firm || "not given"}`,
    "",
    "What they sign most often:",
    note || "(not given)",
    "",
    status,
    "",
    `Approve (sends "You're in"): ${url("approve")}`,
    `Not yet (keeps the request):  ${url("not_yet")}`,
    `Decline:                      ${url("decline")}`,
    "",
    "Each link opens a page where you confirm. Reply to this email to write to them directly.",
  ].join("\n");
  const row = (k: string, v: string) =>
    `<tr><td style="padding:4px 14px 4px 0;color:#8b827c;font-size:13px;vertical-align:top">${k}</td><td style="padding:4px 0;color:#201d1b;font-size:14px">${v}</td></tr>`;
  const html = layout(
    `<h1 ${H1}>${escapeHtml(label)} ${context.again ? "asked again for access" : "asked for access"}</h1>
     <table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 0">
       ${row("Name", escapeHtml(request.name))}
       ${row("Email", escapeHtml(request.email))}
       ${row("Firm", escapeHtml(firm || "not given"))}
       ${row("Signs", escapeHtml(note || "not given"))}
     </table>
     ${buttons(button(url("approve"), "Approve"), button(url("not_yet"), "Not yet", false), button(url("decline"), "Decline", false))}
     <p ${SMALL}>Each button opens a page where you confirm; nothing happens until you press the button there. Approve sends them "You're in" with a link to set up their account. ${escapeHtml(status)}</p>
     <p ${SMALL}>Reply to this email to write to them directly.</p>`,
    "Sent to you as the owner of Agmt. Anyone with this email can decide on this one request, so don't forward it.",
  );
  return { subject: `Access request: ${label}`, text, html };
}

/** Approved: set up an account with this email. The link holds no secret. */
export function youreIn(request: AccessRequest, links: { join: string; signIn: string }): Mail {
  const who = greetingName(request.name);
  const text = [
    `Hi ${who},`,
    "",
    "You're in. Your place in the Agmt beta is ready.",
    "",
    `Set up your account: ${links.join}`,
    "",
    `Use this email address (${request.email}) and choose a password. We'll send one short email to confirm the address is yours, and then you're in. After that, sign in at ${links.signIn} on any computer.`,
    "",
    "Your access belongs to your account, so forwarding this email won't let anyone else in. Your documents stay on your computer; they're never uploaded.",
    "",
    "Already have an Agmt account with this email? Just sign in.",
    "",
    "If anything doesn't work the way you expect, reply to this email. It comes straight to us.",
    "",
    "With thanks,",
    "Agmt",
  ].join("\n");
  const html = layout(
    `<p ${HI}>Hi ${escapeHtml(who)},</p>
     <h1 ${H1}>You're in</h1>
     <p ${P}>Your place in the Agmt beta is ready. Set up your account with this email address, <span style="color:#201d1b">${escapeHtml(request.email)}</span>, and choose a password. We'll send one short email to confirm the address is yours, and then you're in.</p>
     ${buttons(button(links.join, "Set up your account"))}
     <p ${P}>After that, sign in at <a href="${escapeHtml(links.signIn)}" style="color:#6f1d2b">app.agmt.legal</a> on any computer. Already have an Agmt account with this email? Just sign in.</p>
     <p ${P}>Your access belongs to your account, so forwarding this email won't let anyone else in. Your documents stay on your computer; they're never uploaded.</p>
     <p ${P}>If anything doesn't work the way you expect, reply to this email. It comes straight to us.</p>
     <p ${P}>With thanks,<br>Agmt</p>`,
    WHY,
  );
  return { subject: "You're in: set up your Agmt account", text, html };
}

/** Not yet: kept on the list, warmly. */
export function notYet(request: AccessRequest): Mail {
  const who = greetingName(request.name);
  const body = [
    "Thank you again for asking to try Agmt. We're keeping the beta small for now, so we can't open your place just yet.",
    "Your request stays with us; there's no need to ask again. We'll email you as soon as there's room.",
    "If you have a closing coming up that you'd like to try it on, reply to this email and tell us about it.",
  ];
  const text = [`Hi ${who},`, "", ...body.flatMap((l) => [l, ""]), "With thanks,", "Agmt"].join("\n");
  const html = layout(
    `<p ${HI}>Hi ${escapeHtml(who)},</p>
     <h1 ${H1}>Not just yet</h1>
     ${body.map((l) => `<p ${P}>${escapeHtml(l)}</p>`).join("\n")}
     <p ${P}>With thanks,<br>Agmt</p>`,
    WHY,
  );
  return { subject: "Your Agmt request: not just yet", text, html };
}

/** Declined: polite, and the door stays open for launch. */
export function declined(request: AccessRequest): Mail {
  const who = greetingName(request.name);
  const body = [
    "Thank you for asking to try Agmt. We're sorry: we can't include you in this closed beta.",
    "Agmt will open to everyone after the beta, and we'll let you know when it does.",
    "If you think we've misunderstood something, just reply to this email.",
  ];
  const text = [`Hi ${who},`, "", ...body.flatMap((l) => [l, ""]), "With thanks,", "Agmt"].join("\n");
  const html = layout(
    `<p ${HI}>Hi ${escapeHtml(who)},</p>
     <h1 ${H1}>About your Agmt request</h1>
     ${body.map((l) => `<p ${P}>${escapeHtml(l)}</p>`).join("\n")}
     <p ${P}>With thanks,<br>Agmt</p>`,
    WHY,
  );
  return { subject: "About your Agmt request", text, html };
}

/** Forgot password. The link expires in an hour. */
export function passwordReset(name: string | null | undefined, url: string): Mail {
  const who = name?.trim() ? greetingName(name) : "";
  const text = [
    who ? `Hi ${who},` : "Hello,",
    "",
    `Choose a new password for Agmt: ${url}`,
    "",
    "This link expires in one hour and works once. If you didn't ask for this, ignore this email; your password stays the same.",
  ].join("\n");
  const html = layout(
    `<p ${HI}>${who ? `Hi ${escapeHtml(who)},` : "Hello,"}</p>
     <h1 ${H1}>Choose a new password</h1>
     <p ${P}>Someone, hopefully you, asked to reset the password for your Agmt account.</p>
     ${buttons(button(url, "Choose a new password"))}
     <p ${SMALL}>This link expires in one hour and works once. If you didn't ask for this, ignore this email; your password stays the same.</p>`,
    "Agmt · executed copies for transactional documents",
  );
  return { subject: "Reset your Agmt password", text, html };
}

/** Someone tried to create an account that already exists: point them home. */
export function existingAccount(name: string | null | undefined, links: { signIn: string; reset: string }): Mail {
  const who = name?.trim() ? greetingName(name) : "";
  const text = [
    who ? `Hi ${who},` : "Hello,",
    "",
    "You already have an Agmt account with this email address, so there's nothing to set up.",
    "",
    `Sign in: ${links.signIn}`,
    `Forgotten the password? Choose a new one: ${links.reset}`,
    "",
    "If you didn't just try to create an account, you can ignore this email.",
  ].join("\n");
  const html = layout(
    `<p ${HI}>${who ? `Hi ${escapeHtml(who)},` : "Hello,"}</p>
     <h1 ${H1}>You already have an account</h1>
     <p ${P}>There's an Agmt account with this email address already, so there's nothing to set up. Sign in with your password.</p>
     ${buttons(button(links.signIn, "Sign in"), button(links.reset, "Choose a new password", false))}
     <p ${SMALL}>If you didn't just try to create an account, you can ignore this email.</p>`,
    "Agmt · executed copies for transactional documents",
  );
  return { subject: "You already have an Agmt account", text, html };
}
