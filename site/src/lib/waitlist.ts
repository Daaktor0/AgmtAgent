import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SEAT_OPEN, SEAT_RESERVED, SEAT_TOTAL } from "@/brand/tokens";

/**
 * The beta list.
 *
 * Seats are handed out inside a single SQL statement — the count and the
 * insert never come apart — and the unique index on `fcfs_seat` is the final
 * word if two submits race. Nothing here trusts a number read a moment ago.
 */

export type SeatStatus = "seat-fcfs" | "waitlist" | "reserved-allotted" | "reminder-only";

export type SeatCounts = {
  openTotal: number;
  reservedTotal: number;
  fcfsTaken: number;
  reservedAllotted: number;
  openRemaining: number;
  reservedRemaining: number;
};

/**
 * The only capacity information exposed to public routes. The internal split
 * remains available to the admin route and never crosses the public loader.
 */
export type PublicSeatStatus = {
  capacity: number;
  bookingOpen: boolean;
};

export type WaitlistRow = {
  id: number;
  created_at: string;
  name: string;
  email: string;
  firm: string | null;
  role: string | null;
  interest: "proof" | "review" | "both";
  remind_beta: boolean;
  remind_launch: boolean;
  status: SeatStatus;
  fcfs_seat: number | null;
  reserved_seat: number | null;
};

export type SignupResult = {
  ok: true;
  outcome: "booked" | "waitlist" | "reminder";
  /** True when this email was already on the list. */
  returning: boolean;
  /** True when this submit changed their standing — a new seat, or a promotion. */
  changed: boolean;
  /** The line shown on screen. Never says "you're in" for a reminder. */
  message: string;
};

export type Failure = { ok: false; error: string };

/**
 * Every read returns the same shape. `created_at` is cast to text so the two
 * drivers agree: node-postgres and PGLite parse timestamps differently.
 *
 * These fragments are composed into query text, never into a value position,
 * so parameters still travel as parameters.
 */
const COLUMNS = `id, created_at::text as created_at, name, email, firm, role,
       interest, remind_beta, remind_launch, status, fcfs_seat, reserved_seat`;
const SELECT_ROW = `select ${COLUMNS} from waitlist`;
const RETURNING = `returning ${COLUMNS}`;

const signupSchema = z.object({
  name: z.string().trim().min(1, "Your name is required.").max(120),
  email: z
    .string()
    .trim()
    .min(1, "A work email is required.")
    .max(200)
    .refine(
      (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v),
      "That does not look like an email address.",
    ),
  firm: z.string().trim().max(160).default(""),
  role: z.string().trim().max(120).default(""),
  interest: z.enum(["proof", "review", "both"]),
  /** "seat" asks for a seat (or the waitlist). "remind" claims nothing. */
  intent: z.enum(["seat", "remind"]),
  remindBeta: z.boolean(),
  remindLaunch: z.boolean(),
});

export type SignupInput = z.input<typeof signupSchema>;

const adminSchema = z.object({ password: z.string().min(1).max(200) });
const allotSchema = adminSchema.extend({ id: z.number().int().positive() });

async function sql() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

/** Two submits racing for the last seat: one insert loses on the unique index. */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  return e.code === "23505" || /duplicate key|unique constraint/i.test(e.message ?? "");
}

async function readCounts(): Promise<SeatCounts> {
  const db = await sql();
  const rows = await db<{ status: SeatStatus; n: number }>`
    select status, count(*)::int as n from waitlist group by status
  `;
  const by = new Map(rows.map((r) => [r.status, Number(r.n)]));
  const fcfsTaken = by.get("seat-fcfs") ?? 0;
  const reservedAllotted = by.get("reserved-allotted") ?? 0;
  return {
    openTotal: SEAT_OPEN,
    reservedTotal: SEAT_RESERVED,
    fcfsTaken,
    reservedAllotted,
    openRemaining: Math.max(0, SEAT_OPEN - fcfsTaken),
    reservedRemaining: Math.max(0, SEAT_RESERVED - reservedAllotted),
  };
}

/** An untouched list, so a page still renders when the database is unreachable. */
const EMPTY_COUNTS: SeatCounts = {
  openTotal: SEAT_OPEN,
  reservedTotal: SEAT_RESERVED,
  fcfsTaken: 0,
  reservedAllotted: 0,
  openRemaining: SEAT_OPEN,
  reservedRemaining: SEAT_RESERVED,
};

/**
 * What the visitor is told. Straight sentences only — a seat confirmation is
 * not the place for a turn of phrase.
 */
function confirm(row: WaitlistRow): string {
  switch (row.status) {
    case "seat-fcfs":
      return "Your beta seat is booked. We will write to this address before access opens.";
    case "waitlist":
      return "Your seat request is on the waitlist. We will write if a place opens in the first beta.";
    case "reserved-allotted":
      return "Your beta seat is booked. We will write to this address before access opens.";
    case "reminder-only": {
      if (row.remind_beta && row.remind_launch) {
        return "We will write when the beta opens, and again when the product launches. No seat is held.";
      }
      if (row.remind_launch) {
        return "We will write when the product launches. No seat is held.";
      }
      return "We will write when the beta opens. No seat is held.";
    }
  }
}

function toResult(
  row: WaitlistRow,
  { returning, changed }: { returning: boolean; changed: boolean },
): SignupResult {
  return {
    ok: true,
    outcome:
      row.status === "seat-fcfs" || row.status === "reserved-allotted"
        ? "booked"
        : row.status === "waitlist"
          ? "waitlist"
          : "reminder",
    returning,
    changed,
    message: confirm(row),
  };
}

export const getSeatCounts = createServerFn({ method: "GET" }).handler(
  async (): Promise<SeatCounts> => {
    try {
      return await readCounts();
    } catch {
      return EMPTY_COUNTS;
    }
  },
);

export const getPublicSeatStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicSeatStatus> => {
    try {
      const counts = await readCounts();
      return { capacity: SEAT_TOTAL, bookingOpen: counts.openRemaining > 0 };
    } catch {
      return { capacity: SEAT_TOTAL, bookingOpen: true };
    }
  },
);

export const submitSignup = createServerFn({ method: "POST" })
  .validator((input: unknown) => signupSchema.parse(input))
  .handler(async ({ data }): Promise<SignupResult | Failure> => {
    // A public deployment must never confirm a signup into ephemeral memory.
    if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL?.trim()) {
      return { ok: false, error: "Updates are temporarily unavailable. Please try again later." };
    }
    const email = data.email.trim();
    const key = email.toLowerCase();
    const firm = data.firm.trim() || null;
    const role = data.role.trim() || null;
    // Asking to be reminded without ticking a box still means "remind me".
    const remindBeta =
      data.remindBeta || (data.intent === "remind" && !data.remindBeta && !data.remindLaunch);
    const remindLaunch = data.remindLaunch;

    try {
      const db = await sql();

      const existing = await db.query<WaitlistRow>(
        `${SELECT_ROW} where email_normalized = $1 limit 1`,
        [key],
      );
      if (existing[0]) {
        return await updateExisting(existing[0], {
          name: data.name,
          firm,
          role,
          interest: data.interest,
          intent: data.intent,
          remindBeta,
          remindLaunch,
        });
      }

      const values = {
        name: data.name,
        email,
        key,
        firm,
        role,
        interest: data.interest,
        remindBeta,
        remindLaunch,
      };

      if (data.intent === "remind") {
        const inserted = await db.query<WaitlistRow>(
          `insert into waitlist (
             name, email, email_normalized, firm, role, interest,
             remind_beta, remind_launch, status
           ) values ($1, $2, $3, $4, $5, $6, $7, $8, 'reminder-only')
           on conflict (email_normalized) do nothing
           ${RETURNING}`,
          [
            values.name,
            values.email,
            values.key,
            values.firm,
            values.role,
            values.interest,
            values.remindBeta,
            values.remindLaunch,
          ],
        );
        if (inserted[0]) return toResult(inserted[0], { returning: false, changed: true });
        return await readBack(key);
      }

      return await takeSeat(values);
    } catch {
      return { ok: false, error: "Could not save that. Please try again." };
    }
  });

/**
 * Claim a first-come seat, or land on the waitlist if the thirty are gone.
 * The count and the insert are one statement, so no two rows can read the same
 * number and both act on it. A lost race raises a unique violation; retrying
 * re-counts and settles.
 */
async function takeSeat(v: {
  name: string;
  email: string;
  key: string;
  firm: string | null;
  role: string | null;
  interest: string;
  remindBeta: boolean;
  remindLaunch: boolean;
}): Promise<SignupResult | Failure> {
  const db = await sql();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const rows = await db.query<WaitlistRow>(
        `with taken as (
           select count(*)::int as n from waitlist where status = 'seat-fcfs'
         )
         insert into waitlist (
           name, email, email_normalized, firm, role, interest,
           remind_beta, remind_launch, status, fcfs_seat
         )
         select $1, $2, $3, $4, $5, $6, $7, $8,
                case when taken.n < $9 then 'seat-fcfs' else 'waitlist' end,
                case when taken.n < $9 then taken.n + 1 else null end
         from taken
         on conflict (email_normalized) do nothing
         ${RETURNING}`,
        [
          v.name,
          v.email,
          v.key,
          v.firm,
          v.role,
          v.interest,
          v.remindBeta,
          v.remindLaunch,
          SEAT_OPEN,
        ],
      );
      if (rows[0]) return toResult(rows[0], { returning: false, changed: true });
      // No row came back: this email was inserted by a request that beat us.
      return await readBack(v.key);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Someone took the seat number we counted. Count again.
    }
  }
  return { ok: false, error: "The seats moved while we were writing. Try once more." };
}

/** A second submit from the same address never takes a second seat. */
async function updateExisting(
  row: WaitlistRow,
  next: {
    name: string;
    firm: string | null;
    role: string | null;
    interest: "proof" | "review" | "both";
    intent: "seat" | "remind";
    remindBeta: boolean;
    remindLaunch: boolean;
  },
): Promise<SignupResult | Failure> {
  const db = await sql();
  // An optional field left blank means "no change", not "delete what I gave you".
  // Reminder flags only ever turn on: unticking a box is not a withdrawal.
  await db`
    update waitlist set
      name          = ${next.name},
      firm          = coalesce(${next.firm}, firm),
      role          = coalesce(${next.role}, role),
      interest      = ${next.intent === "remind" ? row.interest : next.interest},
      remind_beta   = remind_beta or ${next.remindBeta},
      remind_launch = remind_launch or ${next.remindLaunch}
    where id = ${row.id}
  `;

  // Someone who left an email and now wants a seat may still have one.
  if (next.intent === "seat" && row.status === "reminder-only") {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        const promoted = await db.query<WaitlistRow>(
          `with taken as (
             select count(*)::int as n from waitlist where status = 'seat-fcfs'
           )
           update waitlist set
             status    = case when taken.n < $2 then 'seat-fcfs' else 'waitlist' end,
             fcfs_seat = case when taken.n < $2 then taken.n + 1 else null end
           from taken
           where waitlist.id = $1 and waitlist.status = 'reminder-only'
           ${RETURNING}`,
          [row.id, SEAT_OPEN],
        );
        if (promoted[0]) return toResult(promoted[0], { returning: true, changed: true });
        break;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
  }

  return await readBack(row.email.toLowerCase(), true);
}

async function readBack(key: string, returning = true): Promise<SignupResult | Failure> {
  const db = await sql();
  const rows = await db.query<WaitlistRow>(`${SELECT_ROW} where email_normalized = $1 limit 1`, [
    key,
  ]);
  if (!rows[0]) return { ok: false, error: "Could not save that. Please try again." };
  return toResult(rows[0], { returning, changed: false });
}

/* ---------------------------------------------------------------- admin --- */

function adminPassword(): string {
  return process.env.AGMT_ADMIN_PASSWORD?.trim() || "agmt-beta-admin";
}

/** Constant-time compare, so a wrong password does not leak its length by timing. */
async function passwordOk(input: string): Promise<boolean> {
  const { createHash, timingSafeEqual } = await import("node:crypto");
  const hash = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(hash(input), hash(adminPassword()));
}

export type AdminView = { ok: true; counts: SeatCounts; rows: WaitlistRow[] };

async function loadAdmin(password: string): Promise<AdminView | Failure> {
  if (!(await passwordOk(password))) return { ok: false, error: "Wrong password." };
  try {
    const db = await sql();
    const [counts, rows] = await Promise.all([
      readCounts(),
      db.query<WaitlistRow>(`${SELECT_ROW} order by created_at, id`),
    ]);
    return { ok: true, counts, rows };
  } catch {
    return { ok: false, error: "The database is not reachable." };
  }
}

export const adminUnlock = createServerFn({ method: "POST" })
  .validator((input: unknown) => adminSchema.parse(input))
  .handler(({ data }) => loadAdmin(data.password));

/**
 * Move a waitlist row into one of the twenty reserved seats. This is the only
 * way a reserved seat is ever filled: the public form cannot reach it.
 */
export const adminAllotReserved = createServerFn({ method: "POST" })
  .validator((input: unknown) => allotSchema.parse(input))
  .handler(async ({ data }): Promise<AdminView | Failure> => {
    if (!(await passwordOk(data.password))) {
      return { ok: false, error: "Wrong password." };
    }
    try {
      const db = await sql();
      const done = await db.query<WaitlistRow>(
        `with allotted as (
           select count(*)::int as n from waitlist where status = 'reserved-allotted'
         )
         update waitlist set
           status        = 'reserved-allotted',
           reserved_seat = allotted.n + 1
         from allotted
         where waitlist.id = $1
           and waitlist.status = 'waitlist'
           and allotted.n < $2
         ${RETURNING}`,
        [data.id, SEAT_RESERVED],
      );
      if (!done[0]) {
        const counts = await readCounts();
        return {
          ok: false,
          error:
            counts.reservedRemaining <= 0
              ? "All twenty reserved seats are allotted."
              : "That row is not on the waitlist any more.",
        };
      }
      return await loadAdmin(data.password);
    } catch {
      return { ok: false, error: "Could not allot that seat." };
    }
  });

export const adminExportCsv = createServerFn({ method: "POST" })
  .validator((input: unknown) => adminSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: true; csv: string } | Failure> => {
    const view = await loadAdmin(data.password);
    if (!view.ok) return view;
    const header = [
      "time",
      "name",
      "email",
      "firm",
      "role",
      "interest",
      "remind_beta",
      "remind_launch",
      "status",
      "fcfs_seat",
      "reserved_seat",
    ];
    const lines = [header.join(",")];
    for (const r of view.rows) {
      lines.push(
        [
          r.created_at,
          r.name,
          r.email,
          r.firm ?? "",
          r.role ?? "",
          r.interest,
          r.remind_beta ? "yes" : "no",
          r.remind_launch ? "yes" : "no",
          r.status,
          r.fcfs_seat?.toString() ?? "",
          r.reserved_seat?.toString() ?? "",
        ]
          .map(csvCell)
          .join(","),
      );
    }
    return { ok: true, csv: lines.join("\r\n") };
  });

/**
 * Quote for CSV. A leading =, +, - or @ is prefixed with a quote so a spreadsheet
 * treats a name like "-Rao" as text and not as a formula to run.
 */
function csvCell(value: string): string {
  const v = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
}
