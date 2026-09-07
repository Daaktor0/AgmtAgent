import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { BUILDERS } from "@/brand/copy";

/**
 * /builders registrations. Deliberately separate from `waitlist`: a contact
 * request from a legal-tech builder, never merged with product auth or a
 * newsletter list. A duplicate email returns the same confirmation without
 * revealing prior membership or touching the stored row — see
 * Agmt-Website-Copywriting-v2.md §8 (B03/B04).
 */

export type BuilderInterestResult = { ok: true };
export type Failure = { ok: false; error: string };

async function sql() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

const registerSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, BUILDERS.validation.emailMissing)
    .max(200)
    .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), BUILDERS.validation.emailInvalid),
  productUrl: z.string().trim().max(2000).optional().default(""),
  consent: z.boolean(),
});

export type RegisterBuilderInterestInput = z.input<typeof registerSchema>;

/** A bare domain becomes `https://domain`; only http/https survive. Never fetched. */
function normalizeUrl(raw: string): string | null | "" {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export const registerBuilderInterest = createServerFn({ method: "POST" })
  .validator((input: unknown) => registerSchema.parse(input))
  .handler(async ({ data }): Promise<BuilderInterestResult | Failure> => {
    if (!data.consent) {
      return { ok: false, error: BUILDERS.validation.consentMissing };
    }
    // A public deployment must never confirm a registration into ephemeral memory.
    if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL?.trim()) {
      return { ok: false, error: BUILDERS.validation.unavailable };
    }

    const productUrl = normalizeUrl(data.productUrl ?? "");
    if (productUrl === null) {
      return { ok: false, error: BUILDERS.validation.urlInvalid };
    }

    const email = data.email.trim();
    const key = email.toLowerCase();

    try {
      const db = await sql();
      // ON CONFLICT DO NOTHING: a repeat submission is confirmed, never merged
      // or overwritten — the first registration's details stand.
      await db.query(
        `insert into builder_interest (email, email_normalized, product_url, consent)
         values ($1, $2, $3, $4)
         on conflict (email_normalized) do nothing`,
        [email, key, productUrl || null, data.consent],
      );
      return { ok: true };
    } catch {
      return { ok: false, error: BUILDERS.validation.saveFailure };
    }
  });

/* ---------------------------------------------------------------- admin --- */

export type BuilderInterestRow = {
  id: number;
  created_at: string;
  email: string;
  product_url: string | null;
  consent: boolean;
};

const COLUMNS = "id, created_at::text as created_at, email, product_url, consent";

const adminSchema = z.object({ password: z.string().min(1).max(200) });

async function passwordOk(input: string): Promise<boolean> {
  const { createHash, timingSafeEqual } = await import("node:crypto");
  const hash = (v: string) => createHash("sha256").update(v).digest();
  const expected = process.env.AGMT_ADMIN_PASSWORD?.trim() || "agmt-beta-admin";
  return timingSafeEqual(hash(input), hash(expected));
}

export const adminListBuilderInterest = createServerFn({ method: "POST" })
  .validator((input: unknown) => adminSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: true; rows: BuilderInterestRow[] } | Failure> => {
    if (!(await passwordOk(data.password))) return { ok: false, error: "Wrong password." };
    try {
      const db = await sql();
      const rows = await db.query<BuilderInterestRow>(
        `select ${COLUMNS} from builder_interest order by created_at desc, id desc`,
      );
      return { ok: true, rows };
    } catch {
      return { ok: false, error: "The database is not reachable." };
    }
  });
