import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * /admin: a read-only view of the two sign-up lists earlier versions of the
 * site collected. Their forms are retired; nothing here, or anywhere on the
 * site, writes to these tables. The rows are real people's details, so the
 * page stays shut unless AGMT_ADMIN_PASSWORD is set: there is no default.
 */

export type WaitlistRow = {
  id: number;
  created_at: string;
  name: string;
  email: string;
  firm: string | null;
  role: string | null;
  interest: string;
  remind_beta: boolean;
  remind_launch: boolean;
  status: string;
  fcfs_seat: number | null;
  reserved_seat: number | null;
};

export type BuilderRow = {
  id: number;
  created_at: string;
  email: string;
  product_url: string | null;
  consent: boolean;
};

export type AdminResult =
  | { ok: true; waitlist: WaitlistRow[]; builders: BuilderRow[] }
  | { ok: false; error: string };

export const ADMIN_DISABLED =
  "Admin is switched off because AGMT_ADMIN_PASSWORD isn't set on this deployment.";

const input = z.object({ password: z.string().min(1).max(200) });

/** Constant-time compare, so a wrong guess doesn't reveal anything by timing. */
async function passwordMatches(given: string, expected: string): Promise<boolean> {
  const { createHash, timingSafeEqual } = await import("node:crypto");
  const hash = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(hash(given), hash(expected));
}

export async function loadAdmin(password: string): Promise<AdminResult> {
  const expected = process.env.AGMT_ADMIN_PASSWORD?.trim();
  if (!expected) return { ok: false, error: ADMIN_DISABLED };
  if (!(await passwordMatches(password, expected))) {
    // A pause on every wrong guess makes guessing slow.
    await new Promise((resolve) => setTimeout(resolve, 600));
    return { ok: false, error: "Wrong password." };
  }
  try {
    const { getSql } = await import("@/lib/db");
    const db = await getSql();
    const [waitlist, builders] = await Promise.all([
      db.query<WaitlistRow>(
        `select id, created_at::text as created_at, name, email, firm, role, interest,
                remind_beta, remind_launch, status, fcfs_seat, reserved_seat
           from waitlist order by created_at, id`,
      ),
      db.query<BuilderRow>(
        `select id, created_at::text as created_at, email, product_url, consent
           from builder_interest order by created_at, id`,
      ),
    ]);
    return { ok: true, waitlist, builders };
  } catch {
    return { ok: false, error: "The database isn't reachable right now." };
  }
}

export const adminUnlock = createServerFn({ method: "POST" })
  .validator((data: unknown) => input.parse(data))
  .handler(({ data }) => loadAdmin(data.password));
