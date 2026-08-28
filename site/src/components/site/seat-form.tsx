"use client";

import { useId, useState, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { BETA } from "@/brand/copy";
import { SEAT_OPEN, SEAT_RESERVED } from "@/brand/tokens";
import { SeatMeter } from "@/components/site/seat-meter";
import { getSeatCounts, submitSignup, type SeatCounts, type SignupResult } from "@/lib/waitlist";
import { cn } from "@/lib/utils";

type Interest = "proof" | "review" | "both";
type Intent = "seat" | "remind";

const INTERESTS: ReadonlyArray<[Interest, string]> = [
  ["proof", "Proof"],
  ["review", "Review"],
  ["both", "Both"],
];

export function SeatForm({ counts }: { counts: SeatCounts }) {
  const router = useRouter();
  const uid = useId();
  const [live, setLive] = useState(counts);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [firm, setFirm] = useState("");
  const [role, setRole] = useState("");
  const [interest, setInterest] = useState<Interest>("both");
  const [remindBeta, setRemindBeta] = useState(true);
  const [remindLaunch, setRemindLaunch] = useState(false);
  const [busy, setBusy] = useState<Intent | null>(null);
  const [errors, setErrors] = useState<{ name?: string; email?: string; form?: string }>({});
  const [result, setResult] = useState<SignupResult | null>(null);

  const seatsOpen = live.openRemaining > 0;

  async function send(intent: Intent) {
    const found: typeof errors = {};
    if (!name.trim()) found.name = "Your name is required.";
    if (!email.trim()) found.email = "A work email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      found.email = "That does not look like an email address.";
    }
    setErrors(found);
    if (found.name || found.email) return;

    setBusy(intent);
    try {
      const response = await submitSignup({
        data: {
          name,
          email,
          firm,
          role,
          interest,
          intent,
          remindBeta,
          remindLaunch,
        },
      });
      if (!response.ok) {
        setErrors({ form: response.error });
        return;
      }
      setResult(response);
      setLive(await getSeatCounts());
      await router.invalidate();
    } catch {
      setErrors({ form: "Could not reach the server. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  /** A fresh form for the next person: nobody's details linger in the fields. */
  function reset() {
    setResult(null);
    setName("");
    setEmail("");
    setFirm("");
    setRole("");
    setInterest("both");
    setRemindBeta(true);
    setRemindLaunch(false);
    setErrors({});
  }

  if (result) return <Confirmation result={result} counts={live} onReset={reset} />;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void send("seat");
      }}
      className="border border-rule bg-card"
    >
      <div className="border-b border-rule px-5 py-5 sm:px-6">
        <SeatMeter counts={live} />
      </div>

      <div className="px-5 py-6 sm:px-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id={`${uid}-name`} label="Name" error={errors.name}>
            {(props) => (
              <input
                {...props}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </Field>

          <Field
            id={`${uid}-email`}
            label="Work email"
            hint={BETA.emailHelper}
            error={errors.email}
          >
            {(props) => (
              <input
                {...props}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Field>

          <Field id={`${uid}-firm`} label="Firm" optional>
            {(props) => (
              <input
                {...props}
                autoComplete="organization"
                value={firm}
                onChange={(e) => setFirm(e.target.value)}
              />
            )}
          </Field>

          <Field id={`${uid}-role`} label="Role" optional>
            {(props) => (
              <input
                {...props}
                autoComplete="organization-title"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
            )}
          </Field>
        </div>

        <fieldset className="mt-6">
          <legend className="label">Which mode</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {INTERESTS.map(([value, label]) => (
              <label
                key={value}
                className={cn(
                  "inline-flex min-h-11 items-center border px-4 text-[0.9375rem] transition-colors",
                  interest === value
                    ? "border-accent bg-accent text-accent-ink"
                    : "border-rule-strong text-ink-2 hover:border-ink",
                )}
              >
                <input
                  type="radio"
                  name={`${uid}-interest`}
                  className="sr-only"
                  checked={interest === value}
                  onChange={() => setInterest(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        {errors.form ? (
          <p
            role="alert"
            className="mt-5 border-l-2 border-accent pl-3 text-[0.9375rem] text-accent"
          >
            {errors.form}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy !== null}
          className="mt-6 inline-flex min-h-11 items-center bg-accent px-6 text-[0.9375rem] font-medium text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {busy === "seat" ? "Submitting…" : seatsOpen ? "Hold a beta seat" : "Join the waitlist"}
        </button>
        <p className="mt-2 text-sm text-muted">
          {seatsOpen
            ? `${live.openRemaining} of ${SEAT_OPEN} open seats available.`
            : `All ${SEAT_OPEN} open seats are taken. ${SEAT_RESERVED} are reserved for manual allotment.`}
        </p>
      </div>

      <div className="border-t border-rule bg-paper-sunk px-5 py-5 sm:px-6">
        <p className="label">Or just a reminder</p>
        <p className="mt-1.5 text-sm text-muted">{BETA.reminderNote}</p>
        <div className="mt-3 flex flex-col gap-1">
          <Check checked={remindBeta} onChange={setRemindBeta}>
            When the beta opens
          </Check>
          <Check checked={remindLaunch} onChange={setRemindLaunch}>
            When the product launches
          </Check>
        </div>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void send("remind")}
          className="mt-3 inline-flex min-h-11 items-center border border-rule-strong bg-card px-4 text-[0.9375rem] text-ink-2 transition-colors hover:border-ink disabled:opacity-60"
        >
          {busy === "remind" ? "Submitting…" : "Remind me only"}
        </button>
      </div>
    </form>
  );
}

/** The stamped result. Straight sentences: no turn of phrase lands here. */
function Confirmation({
  result,
  counts,
  onReset,
}: {
  result: SignupResult;
  counts: SeatCounts;
  onReset: () => void;
}) {
  const held = result.status === "seat-fcfs" || result.status === "reserved-allotted";
  return (
    <div className="border border-rule bg-card" role="status" aria-live="polite">
      <div
        className={cn(
          "border-b px-5 py-6 sm:px-6",
          held ? "border-accent bg-accent-soft" : "border-rule",
        )}
      >
        {held && result.seat != null ? (
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-accent">
            Seat {result.seat} of {result.status === "seat-fcfs" ? SEAT_OPEN : SEAT_RESERVED}
          </p>
        ) : (
          <p className="label">{result.status === "waitlist" ? "Waitlist" : "Reminder"}</p>
        )}
        <p className="mt-2 max-w-[var(--measure)] font-serif text-[1.375rem] leading-snug text-ink">
          {result.message}
        </p>
        {result.returning && !result.changed ? (
          <p className="mt-2 text-sm text-muted">
            This email was already on the list, so nothing was taken twice.
          </p>
        ) : null}
      </div>
      <div className="px-5 py-5 sm:px-6">
        <SeatMeter counts={counts} />
        <button
          type="button"
          onClick={onReset}
          className="mt-5 inline-flex min-h-11 items-center text-[0.9375rem] text-accent underline underline-offset-4"
        >
          Enter another email
        </button>
      </div>
    </div>
  );
}

type InputProps = {
  id: string;
  name: string;
  className: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

function Field({
  id,
  label,
  hint,
  error,
  optional,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: (props: InputProps) => ReactNode;
}) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-err` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div>
      <label htmlFor={id} className="flex items-baseline gap-2">
        <span className="label">{label}</span>
        {optional ? <span className="text-xs text-faint">optional</span> : null}
      </label>
      {children({
        id,
        name: id,
        className: cn(
          "mt-1.5 block h-11 w-full border bg-paper px-3 text-base text-ink outline-none transition-colors focus:border-accent",
          error ? "border-accent" : "border-rule-strong",
        ),
        "aria-describedby": describedBy || undefined,
        "aria-invalid": error ? true : undefined,
      })}
      {hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-err`} className="mt-1.5 text-sm text-accent">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Check({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-[0.9375rem] text-ink-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[#7a1c1c]"
      />
      {children}
    </label>
  );
}
