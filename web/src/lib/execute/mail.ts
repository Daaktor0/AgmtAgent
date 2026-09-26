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

/** Where the email header image is served from: this app's own public folder. */
function publicUrl(): string {
  return (serverEnv("AGMT_PUBLIC_URL") ?? "https://app.agmt.legal").replace(/\/+$/, "");
}

/** Width of public/brand/execute-lockup-email.png at 1x (it is drawn at 2x). */
const LOCKUP_WIDTH = 229;

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

const P = 'style="margin:14px 0 0;color:#3b3734;font-size:15px;line-height:1.7"';

/** A button that survives email clients: a table cell with an oxblood fill, or an ink outline. */
function button(href: string, label: string, primary = true): string {
  const safe = escapeHtml(href);
  return primary
    ? `<td bgcolor="#6b2b2b" style="border-radius:2px"><a href="${safe}" style="display:inline-block;padding:12px 18px;color:#fbf8f1;text-decoration:none;font-size:14px;font-weight:700">${escapeHtml(label)}</a></td>`
    : `<td style="border:1px solid #1c1917;border-radius:2px"><a href="${safe}" style="display:inline-block;padding:11px 17px;color:#1c1917;text-decoration:none;font-size:14px;font-weight:700">${escapeHtml(label)}</a></td>`;
}

function buttons(...cells: string[]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 4px"><tr>${cells.join('<td style="width:10px"></td>')}</tr></table>`;
}

const H1 = `style="margin:0 0 4px;font-family:Georgia,'Times New Roman',serif;font-size:23px;font-weight:400;line-height:1.25;color:#1c1917"`;
const SMALL = 'style="margin:20px 0 0;color:#565b5f;font-size:13px;line-height:1.6"';
const WHY = "You're receiving this because you asked for access to Execute at app.agmt.legal.";
const SIGN_OFF_TEXT = ["Regards,", "Agmt"];
const SIGN_OFF_HTML = `<p ${P}>Regards,<br>Agmt</p>`;

/** `firm` is no longer asked for; older requests may still carry one, and it is ignored. */
export type AccessRequest = { name: string; email: string; firm?: string; note?: string };
export type Mail = { subject: string; text: string; html: string };

/** Paragraphs to both forms at once, so the plain-text version never drifts from the HTML. */
function compose(opts: { greeting: string; heading: string; paras: string[]; after?: string; footer: string; small?: string[] }): { text: string; html: string } {
  const text = [opts.greeting, "", ...opts.paras.flatMap((l) => [l, ""]), ...(opts.small ?? []).flatMap((l) => [l, ""]), ...SIGN_OFF_TEXT, "", "--", opts.footer].join("\n");
  const html = layout(
    `<h1 ${H1}>${escapeHtml(opts.heading)}</h1>
     <p ${P}>${escapeHtml(opts.greeting)}</p>
     ${opts.paras.map((l) => `<p ${P}>${escapeHtml(l)}</p>`).join("\n     ")}
     ${opts.after ?? ""}
     ${(opts.small ?? []).map((l) => `<p ${SMALL}>${escapeHtml(l)}</p>`).join("\n     ")}
     ${SIGN_OFF_HTML}`,
    escapeHtml(opts.footer),
  );
  return { text, html };
}

const dear = (name: string | null | undefined) => (name?.trim() ? `Dear ${greetingName(name)},` : "Hello,");

/** To the person who asked: thanks, what happens next, reply to reach us. */
export function accessThanks(request: AccessRequest): Mail {
  const { text, html } = compose({
    greeting: dear(request.name),
    heading: "Thank you for asking",
    paras: [
      "Thank you for asking for access to Execute.",
      "Access is by invitation for now. When yours is ready, we'll email you a link to set up your account. There's nothing more you need to do.",
      "Execute assembles an executed copy for every party to a multi-party agreement: signature pages out, signed pages and stamp papers in. It runs in your browser, and your documents are not uploaded.",
      "If you have a closing coming up, or a question, reply to this email.",
    ],
    footer: `${WHY} If that wasn't you, you can ignore this email.`,
  });
  return { subject: "Your request for Execute by Agmt", text, html };
}

/** To the founder: who asked, and one button per decision. */
export function accessNotice(request: AccessRequest, links: { decide: string }, context: { acknowledged: boolean; again: boolean }): Mail {
  const label = request.name.trim();
  const note = request.note?.trim();
  const url = (action: string) => `${links.decide}?do=${action}`;
  const status = context.acknowledged ? "They were sent a thank-you email." : "No thank-you email could be sent to them (check AUTH_EMAIL_FROM).";
  const text = [
    `${request.name} ${context.again ? "asked again for" : "asked for"} access to Execute.`,
    "",
    `Name:  ${request.name}`,
    `Email: ${request.email}`,
    "",
    "What they sign most often:",
    note || "(not given)",
    "",
    status,
    "",
    `Approve (sends the set-up link): ${url("approve")}`,
    `Not yet (keeps the request):  ${url("not_yet")}`,
    `Decline:                      ${url("decline")}`,
    "",
    "Each link opens a page where you confirm. Reply to this email to write to them directly.",
  ].join("\n");
  const row = (k: string, v: string) =>
    `<tr><td style="padding:4px 14px 4px 0;color:#565b5f;font-size:13px;vertical-align:top">${k}</td><td style="padding:4px 0;color:#1c1917;font-size:14px">${v}</td></tr>`;
  const html = layout(
    `<h1 ${H1}>${escapeHtml(label)} ${context.again ? "asked again for access" : "asked for access"}</h1>
     <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0 0">
       ${row("Name", escapeHtml(request.name))}
       ${row("Email", escapeHtml(request.email))}
       ${row("Signs", escapeHtml(note || "not given"))}
     </table>
     ${buttons(button(url("approve"), "Approve"), button(url("not_yet"), "Not yet", false), button(url("decline"), "Decline", false))}
     <p ${SMALL}>Each button opens a page where you confirm; nothing happens until you press the button there. Approve sends them a link to set up their account. ${escapeHtml(status)}</p>
     <p ${SMALL}>Reply to this email to write to them directly.</p>`,
    "Sent to you as the owner of Agmt. Anyone with this email can decide on this one request, so don't forward it.",
  );
  return { subject: `Access request: ${label}`, text, html };
}

/** Approved: set up an account with this email. The link holds no secret. */
export function youreIn(request: AccessRequest, links: { join: string; signIn: string }): Mail {
  const { text, html } = compose({
    greeting: dear(request.name),
    heading: "Your access is ready",
    paras: [
      `Your request for Execute has been approved. Set up your account with this email address, ${request.email}, and choose a password. We'll send one short email to confirm the address is yours, and then Execute opens.`,
    ],
    after: buttons(button(links.join, "Set up your account")),
    small: [
      `Set up your account: ${links.join}`,
      `After that, sign in at ${links.signIn} on any computer. If you already have an Agmt account with this email, sign in instead.`,
      "Access belongs to your account, so forwarding this email won't let anyone else in. Execute runs in your browser; your documents are not uploaded.",
      "If anything doesn't work as you expect, reply to this email.",
    ],
    footer: WHY,
  });
  return { subject: "Set up your Execute account", text, html };
}

/** Not yet: the request stays on file. No date, no promise. */
export function notYet(request: AccessRequest): Mail {
  const { text, html } = compose({
    greeting: dear(request.name),
    heading: "Your request for Execute",
    paras: [
      "Thank you for asking for access to Execute. We can't offer you access yet.",
      "Your request stays on file, so there's no need to ask again. We'll write to you when we can.",
      "If you have a closing coming up, reply to this email and tell us about it.",
    ],
    footer: WHY,
  });
  return { subject: "Your request for Execute", text, html };
}

/** Declined: polite and short. */
export function declined(request: AccessRequest): Mail {
  const { text, html } = compose({
    greeting: dear(request.name),
    heading: "Your request for Execute",
    paras: [
      "Thank you for your interest. We're not able to offer you access to Execute.",
      "If you think we've misunderstood something, reply to this email.",
    ],
    footer: WHY,
  });
  return { subject: "Your request for Execute", text, html };
}

/** Forgot password. The link expires in an hour. */
export function passwordReset(name: string | null | undefined, url: string): Mail {
  const { text, html } = compose({
    greeting: dear(name),
    heading: "Choose a new password",
    paras: ["Use the button below to choose a new password for your Agmt account."],
    after: buttons(button(url, "Choose a new password")),
    small: [
      `Choose a new password: ${url}`,
      "This link expires in one hour and works once. If you didn't ask for this, ignore this email; your password hasn't changed.",
    ],
    footer: "Sent because a password reset was asked for at app.agmt.legal.",
  });
  return { subject: "Reset your Execute password", text, html };
}

/** Someone tried to create an account that already exists: point them home. */
export function existingAccount(name: string | null | undefined, links: { signIn: string; reset: string }): Mail {
  const { text, html } = compose({
    greeting: dear(name),
    heading: "You already have an account",
    paras: ["There's already an Agmt account with this email address, so there's nothing to set up. Sign in with your password."],
    after: buttons(button(links.signIn, "Sign in"), button(links.reset, "Choose a new password", false)),
    small: [`Sign in: ${links.signIn}`, `Forgotten the password? Choose a new one: ${links.reset}`, "If you didn't just try to create an account, you can ignore this email."],
    footer: "Sent because someone tried to set up an account with this address at app.agmt.legal.",
  });
  return { subject: "You already have an Agmt account", text, html };
}
