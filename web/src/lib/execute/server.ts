/**
 * Server side of executed copies: beta access and the two things users can
 * send (feedback and access requests). Documents are never sent here; the
 * forms say so, and the schemas accept short text fields only.
 */
import { z } from "zod";
import { serverEnv } from "../runtime-env.server.ts";
import { INVITE_COOKIE, inviteCookie, parseAccessMode, parseRevoked, verifyInvite, type AccessMode } from "./access.ts";

export type ExecuteAccess = { mode: AccessMode; allowed: boolean; label: string | null };

/** Who may open the tool. Invite mode without a secret fails closed. */
export async function executeAccess(cookieToken: string | null | undefined, now = Date.now()): Promise<ExecuteAccess> {
  const mode = parseAccessMode(serverEnv("AGMT_EXECUTE_ACCESS"));
  if (mode === "public") return { mode, allowed: true, label: null };
  const secret = serverEnv("AGMT_INVITE_SECRET");
  if (!secret || !cookieToken) return { mode, allowed: false, label: null };
  const check = await verifyInvite(secret, cookieToken, now, parseRevoked(serverEnv("AGMT_INVITE_REVOKED")));
  return check.ok ? { mode, allowed: true, label: check.claims.label } : { mode, allowed: false, label: null };
}

/** GET /invite/<token>: accept an invite link, remember it, go to the tool. */
export async function acceptInvite(request: Request, token: string, now = Date.now()): Promise<Response> {
  const secret = serverEnv("AGMT_INVITE_SECRET");
  const home = new URL("/", request.url);
  const headers = new Headers({ "cache-control": "private, no-store", "referrer-policy": "no-referrer" });
  if (!secret) {
    home.searchParams.set("invite", "unavailable");
    headers.set("location", home.pathname + home.search);
    return new Response(null, { status: 302, headers });
  }
  const check = await verifyInvite(secret, token, now, parseRevoked(serverEnv("AGMT_INVITE_REVOKED")));
  if (!check.ok) {
    home.searchParams.set("invite", check.reason === "expired" ? "expired" : "invalid");
    headers.set("location", home.pathname + home.search);
    return new Response(null, { status: 302, headers });
  }
  console.info(JSON.stringify({ type: "EXECUTE_INVITE_ACCEPTED", inviteId: check.claims.id, at: new Date(now).toISOString() }));
  headers.set("set-cookie", inviteCookie(token, check.claims, now));
  headers.set("location", "/");
  return new Response(null, { status: 302, headers });
}

export { INVITE_COOKIE };

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

const LIMITS = { feedback: 20, access: 5 } as const;
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

async function emailFounder(subject: string, text: string, replyTo?: string): Promise<boolean> {
  const apiKey = serverEnv("RESEND_API_KEY");
  const to = serverEnv("AGMT_FEEDBACK_TO");
  if (!apiKey || !to) return false;
  const from = serverEnv("AUTH_EMAIL_FROM") ?? "Agmt <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: to.split(",").map((v) => v.trim()), subject, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error(`[execute.email] provider rejected status=${res.status}`);
    return res.ok;
  } catch {
    console.error("[execute.email] provider unreachable");
    return false;
  }
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

export async function handleExecuteApi(request: Request, now = Date.now()): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/^\/api\/execute\/?/, "");
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (path !== "feedback" && path !== "access-request") return json({ error: "not_found" }, 404);
  if (!originOk(request)) return json({ error: "invalid_origin" }, 403);
  const raw = await request.text();
  if (raw.length > MAX_BYTES) return json({ error: "too_large" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "invalid" }, 400);
  }
  const kind = path === "feedback" ? "feedback" : "access";
  const key = await ipKey(request, kind, now);
  const used = counts.get(key) ?? 0;
  if (used >= LIMITS[kind]) return json({ error: "rate_limited" }, 429);

  if (kind === "feedback") {
    const parsed = FeedbackSchema.safeParse(body);
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
    const delivered = await emailFounder(`Agmt feedback: ${KIND_LABEL[f.kind]}`, lines.join("\n"), f.email || undefined);
    return json({ ok: true, delivered });
  }

  const parsed = AccessRequestSchema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid" }, 400);
  counts.set(key, used + 1);
  const r = parsed.data;
  console.info(JSON.stringify({ type: "EXECUTE_ACCESS_REQUEST", at: new Date(now).toISOString() }));
  const delivered = await emailFounder(
    `Agmt access request: ${r.name}`,
    [`Name: ${r.name}`, `Email: ${r.email}`, `Firm: ${r.firm || "not given"}`, "", r.note || "(no note)", "", "Mint an invite: npm run execute:invite -- --label \"<name, firm>\""].join("\n"),
    r.email,
  );
  return json({ ok: true, delivered });
}
