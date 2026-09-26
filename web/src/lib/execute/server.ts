/**
 * Server side of executed copies: beta access, the founder's decisions, and
 * the two things users can send (feedback and access requests). Documents
 * are never sent here; the forms say so, and the schemas accept short text
 * fields only.
 */
import { z } from "zod";
import { serverEnv } from "../runtime-env.server.ts";
import { createDecisionToken, normaliseEmail, parseAccessMode, parseEmails, verifyDecisionToken, type AccessMode } from "./access.ts";
import { accessStore, accessStoreConfigured, type AccessRecord, type AccessStatus } from "./access-store.ts";
import { accessNotice, accessThanks, declined, mailConfig, notYet, sendMail, youreIn } from "./mail.ts";

export type AccessState = "allowed" | "signed_out" | "not_requested" | "pending" | "declined" | "unavailable";
export type ExecuteAccess = { mode: AccessMode; state: AccessState; email: string | null; name: string | null };
export type SessionPerson = { email: string; emailVerified: boolean; name?: string | null } | null;

/** The founder's addresses: always let in, and where requests are sent. */
function owners(): string[] {
  return parseEmails(serverEnv("AGMT_FEEDBACK_TO"));
}

/** The access mode now. Public mode never consults the session. */
export function accessModeNow(): AccessMode {
  return parseAccessMode(serverEnv("AGMT_EXECUTE_ACCESS"));
}

/**
 * Who may open the tool. Public mode: everyone. Invite mode: a signed-in
 * person whose verified email is the owner's or has been approved. Anything
 * uncertain (no session, unverified email, the list unreachable) keeps the
 * tool closed.
 */
export async function executeAccess(person: SessionPerson): Promise<ExecuteAccess> {
  const mode = accessModeNow();
  const name = person?.name?.trim() || null;
  if (mode === "public") return { mode, state: "allowed", email: person?.email ?? null, name };
  if (!person || !person.emailVerified) return { mode, state: "signed_out", email: null, name: null };
  const email = normaliseEmail(person.email);
  if (owners().includes(email)) return { mode, state: "allowed", email, name };
  let record: AccessRecord | null;
  try {
    record = await accessStore().get(email);
  } catch (error) {
    console.error(`[execute.access] approved list unavailable: ${error instanceof Error ? error.message : "unknown"}`);
    return { mode, state: "unavailable", email, name };
  }
  const state: AccessState = !record
    ? "not_requested"
    : record.status === "approved"
      ? "allowed"
      : record.status === "declined"
        ? "declined"
        : "pending";
  return { mode, state, email, name: name ?? record?.name ?? null };
}

/** Where links in emails point: the public app address, else this request's. */
function publicBase(request: Request): string {
  const configured = serverEnv("AGMT_PUBLIC_URL");
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      /* fall through */
    }
  }
  return new URL(request.url).origin;
}

function joinLink(base: string, record: Pick<AccessRecord, "email" | "name">): string {
  const url = new URL("/join", base);
  url.searchParams.set("email", record.email);
  url.searchParams.set("name", record.name);
  return url.toString();
}

export type DecisionView =
  | { ok: true; record: AccessRecord }
  | { ok: false; reason: "unconfigured" | "invalid" | "not_found" | "unavailable" };

/** What the founder's decision page shows for a decision link. */
export async function decisionView(token: string): Promise<DecisionView> {
  const secret = serverEnv("AGMT_INVITE_SECRET");
  if (!secret || secret.length < 32) return { ok: false, reason: "unconfigured" };
  const check = await verifyDecisionToken(secret, token);
  if (!check.ok) return { ok: false, reason: "invalid" };
  try {
    const record = await accessStore().get(check.email);
    return record ? { ok: true, record } : { ok: false, reason: "not_found" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

/* ------------------------------------------------------ feedback & requests */

export const FeedbackSchema = z.strictObject({
  kind: z.enum(["broke", "wrong-match", "missing", "works", "other"]),
  message: z.string().trim().min(1).max(2000),
  email: z.string().trim().max(200).email().optional().or(z.literal("")),
  technical: z
    .strictObject({ browser: z.string().max(300), path: z.string().max(200), version: z.string().max(64) })
    .nullable()
    .optional(),
});

export const AccessRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().max(200).email(),
  firm: z.string().trim().max(160).optional().or(z.literal("")),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
});

// Per connection per day. A whole firm often shares one office connection,
// so access requests allow for colleagues asking on the same day.
const LIMITS = { feedback: 20, access: 20 } as const;
const counts = new Map<string, number>();
const MAX_BYTES = 8 * 1024;

function trustedOrigins(): string[] {
  const out = ["http://localhost:8080", "http://127.0.0.1:8080"];
  const pub = serverEnv("AGMT_PUBLIC_URL");
  if (pub) {
    try {
      out.push(new URL(pub).origin);
    } catch {
      /* ignore */
    }
  }
  return out;
}

function originOk(request: Request): boolean {
  const origin = request.headers.get("origin");
  const own = new URL(request.url).origin;
  return Boolean(origin && (origin === own || trustedOrigins().includes(origin)));
}

async function ipKey(request: Request, kind: string, now: number): Promise<string> {
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip)));
  const short = Array.from(digest.slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${kind}:${new Date(now).toISOString().slice(0, 10)}:${short}`;
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });

const KIND_LABEL: Record<z.infer<typeof FeedbackSchema>["kind"], string> = {
  broke: "Something broke",
  "wrong-match": "A file went to the wrong place",
  missing: "Missing something I need",
  works: "This works well",
  other: "Other",
};

/**
 * GET /api/execute/status: whether beta access and email are set up, as
 * yes/no answers only. Never returns a value, a key or an address.
 */
export function executeStatus(): Record<string, boolean | string> {
  const mail = mailConfig();
  return {
    accessMode: parseAccessMode(serverEnv("AGMT_EXECUTE_ACCESS")),
    inviteSecretSet: (serverEnv("AGMT_INVITE_SECRET")?.length ?? 0) >= 32,
    approvedListSet: accessStoreConfigured(),
    emailProviderSet: Boolean(mail.apiKey),
    verifiedSenderSet: mail.verifiedSender,
    founderAddressSet: mail.founder.length > 0,
  };
}

export const DecisionSchema = z.strictObject({
  token: z.string().min(10).max(1024),
  action: z.enum(["approve", "not_yet", "decline"]),
});

const TARGET: Record<z.infer<typeof DecisionSchema>["action"], AccessStatus> = {
  approve: "approved",
  not_yet: "not_yet",
  decline: "declined",
};

async function readJson(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  const raw = await request.text();
  if (raw.length > MAX_BYTES) return { ok: false, response: json({ error: "too_large" }, 413) };
  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch {
    return { ok: false, response: json({ error: "invalid" }, 400) };
  }
}

export async function handleExecuteApi(request: Request, now = Date.now()): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/^\/api\/execute\/?/, "");
  if (request.method === "GET" && path === "status") return json(executeStatus());
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (path !== "feedback" && path !== "access-request" && path !== "decide") return json({ error: "not_found" }, 404);
  if (!originOk(request)) return json({ error: "invalid_origin" }, 403);
  const read = await readJson(request);
  if (!read.ok) return read.response;
  if (path === "decide") return decide(request, read.body, now);

  const kind = path === "feedback" ? "feedback" : "access";
  const key = await ipKey(request, kind, now);
  const used = counts.get(key) ?? 0;
  if (used >= LIMITS[kind]) return json({ error: "rate_limited" }, 429);

  if (kind === "feedback") {
    const parsed = FeedbackSchema.safeParse(read.body);
    if (!parsed.success) return json({ error: "invalid" }, 400);
    counts.set(key, used + 1);
    const f = parsed.data;
    console.info(JSON.stringify({ type: "EXECUTE_FEEDBACK", kind: f.kind, length: f.message.length, withEmail: Boolean(f.email), at: new Date(now).toISOString() }));
    const lines = [
      `Kind: ${KIND_LABEL[f.kind]}`,
      `From: ${f.email || "not given"}`,
      "",
      f.message,
      "",
      f.technical ? `Browser: ${f.technical.browser}\nPage: ${f.technical.path}\nVersion: ${f.technical.version}` : "No technical details shared.",
    ];
    const mail = mailConfig();
    const delivered = await sendMail(
      mail,
      { to: mail.founder, subject: `Agmt feedback: ${KIND_LABEL[f.kind]}`, text: lines.join("\n"), replyTo: f.email || undefined },
      "feedback",
    );
    if (!delivered) console.error(JSON.stringify({ type: "EXECUTE_FEEDBACK_UNDELIVERED", founderAddressSet: mail.founder.length > 0 }));
    return json({ ok: true, delivered });
  }

  const parsed = AccessRequestSchema.safeParse(read.body);
  if (!parsed.success) return json({ error: "invalid" }, 400);
  counts.set(key, used + 1);
  return accessRequest(request, parsed.data, now);
}

async function accessRequest(request: Request, input: z.infer<typeof AccessRequestSchema>, now: number): Promise<Response> {
  const at = new Date(now).toISOString();
  const email = normaliseEmail(input.email);
  const r = { name: input.name, email, firm: input.firm || undefined, note: input.note || undefined };
  const mail = mailConfig();
  const base = publicBase(request);

  // Keep the request on the approved list, so the founder's buttons have
  // something to decide on. If the list can't be reached, the request is
  // still emailed and logged, never lost.
  let existing: AccessRecord | null = null;
  let saved = false;
  try {
    const store = accessStore();
    existing = await store.get(email);
    const status: AccessStatus = !existing || existing.status === "declined" ? "requested" : existing.status;
    await store.put({
      ...r,
      status,
      requestedAt: existing && existing.status !== "declined" ? existing.requestedAt : at,
      decidedAt: status === "requested" ? undefined : existing?.decidedAt,
      updatedAt: at,
    });
    saved = true;
  } catch (error) {
    console.error(`[execute.access] request not saved to the approved list: ${error instanceof Error ? error.message : "unknown"}`);
  }

  // Already approved: they've probably lost the email. Send it again; the
  // founder has nothing to decide.
  if (existing?.status === "approved") {
    const again = youreIn(r, { join: joinLink(base, r), signIn: `${base}/` });
    const acknowledged = mail.verifiedSender ? await sendMail(mail, { to: [email], ...again, replyTo: mail.founder[0] }, "access-reminder") : false;
    console.info(JSON.stringify({ type: "EXECUTE_ACCESS_REMINDER", email, acknowledged, at }));
    return json({ ok: true, acknowledged, notified: false, status: "approved" });
  }

  // The thank-you goes to the requester; replies reach the founder. Resend's
  // test sender can only mail its own account owner, so without a verified
  // sender it is not attempted.
  const acknowledged = mail.verifiedSender
    ? await sendMail(mail, { to: [email], ...accessThanks(r), replyTo: mail.founder[0] }, "access-thanks")
    : false;
  const secret = serverEnv("AGMT_INVITE_SECRET");
  const token = secret && secret.length >= 32 ? await createDecisionToken(secret, email) : null;
  const decide = token && saved ? `${base}/access/${token}` : `${base}/access/unavailable`;
  const notice = accessNotice(r, { decide }, { acknowledged, again: Boolean(existing) });
  const notified = await sendMail(mail, { to: mail.founder, ...notice, replyTo: email }, "access-notice");

  // The request itself is always kept in the Worker's logs as well. It holds
  // only what the person typed into the form.
  console.info(
    JSON.stringify({ type: "EXECUTE_ACCESS_REQUEST", name: r.name, email, firm: r.firm ?? null, note: r.note ?? null, saved, acknowledged, notified, at }),
  );
  if (!notified) {
    console.error(
      `[execute.email] access request not emailed to the founder: providerSet=${Boolean(mail.apiKey)} founderAddressSet=${mail.founder.length > 0}`,
    );
  }
  return json({ ok: true, acknowledged, notified, status: existing?.status === "not_yet" ? "not_yet" : "requested" });
}

/** POST /api/execute/decide: the founder pressed Approve, Not yet or Decline. */
async function decide(request: Request, body: unknown, now: number): Promise<Response> {
  const parsed = DecisionSchema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid" }, 400);
  const view = await decisionView(parsed.data.token);
  if (!view.ok) return json({ error: view.reason }, view.reason === "invalid" ? 403 : view.reason === "not_found" ? 404 : 503);
  const record = view.record;
  const target = TARGET[parsed.data.action];
  if (record.status === target) return json({ ok: true, changed: false, status: target, emailed: false, decidedAt: record.decidedAt ?? null });

  const at = new Date(now).toISOString();
  const updated: AccessRecord = { ...record, status: target, decidedAt: at, updatedAt: at };
  try {
    await accessStore().put(updated);
  } catch {
    return json({ error: "unavailable" }, 503);
  }
  const mail = mailConfig();
  const base = publicBase(request);
  const message =
    target === "approved" ? youreIn(record, { join: joinLink(base, record), signIn: `${base}/` }) : target === "not_yet" ? notYet(record) : declined(record);
  const emailed = mail.verifiedSender ? await sendMail(mail, { to: [record.email], ...message, replyTo: mail.founder[0] }, `access-${target}`) : false;
  console.info(JSON.stringify({ type: "EXECUTE_ACCESS_DECISION", email: record.email, from: record.status, to: target, emailed, at }));
  return json({ ok: true, changed: true, status: target, emailed, decidedAt: at });
}

/** Link for someone approved: exposed for the decision page's copy button. */
export function joinLinkFor(request: Request, record: Pick<AccessRecord, "email" | "name">): string {
  return joinLink(publicBase(request), record);
}
