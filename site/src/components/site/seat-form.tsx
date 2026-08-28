"use client";

import { useId, useState, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { ArrowRight, Bell, Check } from "lucide-react";
import { BETA } from "@/brand/copy";
import {
  getPublicSeatStatus,
  submitSignup,
  type PublicSeatStatus,
  type SignupResult,
} from "@/lib/waitlist";
import { cn } from "@/lib/utils";

type Interest = "proof" | "review" | "both";
type Intent = "seat" | "remind";

const INTERESTS: ReadonlyArray<[Interest, string]> = [
  ["proof", "Proof"],
  ["review", "Review"],
  ["both", "Both"],
];

export function SeatForm({ status }: { status: PublicSeatStatus }) {
  const router = useRouter();
  const uid = useId();
  const [live, setLive] = useState(status);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [firm, setFirm] = useState("");
  const [role, setRole] = useState("");
  const [interest, setInterest] = useState<Interest>("proof");
  const [remindBeta, setRemindBeta] = useState(true);
  const [remindLaunch, setRemindLaunch] = useState(false);
  const [busy, setBusy] = useState<Intent | null>(null);
  const [errors, setErrors] = useState<{ name?: string; email?: string; form?: string }>({});
  const [result, setResult] = useState<SignupResult | null>(null);

  async function send(intent: Intent) {
    const found: typeof errors = {};
    if (!name.trim()) found.name = "Your name is required.";
    if (!email.trim()) found.email = "An email address is required.";
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
      setLive(await getPublicSeatStatus());
      await router.invalidate();
    } catch {
      setErrors({ form: "Could not reach the server. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  function reset() {
    setResult(null);
    setName("");
    setEmail("");
    setFirm("");
    setRole("");
    setInterest("proof");
    setRemindBeta(true);
    setRemindLaunch(false);
    setErrors({});
  }

  if (result) return <Confirmation result={result} onReset={reset} />;

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void send("seat");
      }}
      className="signup-card overflow-hidden border border-rule bg-card"
    >
      <div className="flex items-center justify-between gap-4 border-b border-rule px-5 py-4 sm:px-6">
        <div>
          <p className="label text-accent">First beta · {live.capacity} seats</p>
          <p className="mt-1 text-sm text-muted">
            {live.bookingOpen ? "Seat booking is open." : "Seat requests now join the waitlist."}
          </p>
        </div>
        <span className="launch-pulse" aria-hidden />
      </div>

      <div className="px-5 py-6 sm:px-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id={`${uid}-name`} label="Name" error={errors.name}>
            {(props) => (
              <input
                {...props}
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </Field>

          <Field
            id={`${uid}-email`}
            label="Email"
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
                onChange={(event) => setEmail(event.target.value)}
              />
            )}
          </Field>

          <Field id={`${uid}-firm`} label="Firm" optional>
            {(props) => (
              <input
                {...props}
                autoComplete="organization"
                value={firm}
                onChange={(event) => setFirm(event.target.value)}
              />
            )}
          </Field>

          <Field id={`${uid}-role`} label="Role" optional>
            {(props) => (
              <input
                {...props}
                autoComplete="organization-title"
                value={role}
                onChange={(event) => setRole(event.target.value)}
              />
            )}
          </Field>
        </div>

        <fieldset className="mt-6">
          <legend className="label">What do you want first?</legend>
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
          <p role="alert" className="mt-5 border-l-2 border-accent pl-3 text-sm text-accent">
            {errors.form}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy !== null}
          className="group mt-6 inline-flex min-h-12 items-center gap-2 bg-accent px-5 font-medium text-accent-ink transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {busy === "seat"
            ? "Submitting…"
            : live.bookingOpen
              ? "Book my free beta seat"
              : "Join the beta waitlist"}
          {busy !== "seat" ? (
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          ) : null}
        </button>
      </div>

      <div className="border-t border-rule bg-paper-sunk px-5 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <Bell className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          <div>
            <p className="label">Only want the note?</p>
            <p className="mt-1 text-sm text-muted">{BETA.reminderNote}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-1">
          <CheckField checked={remindBeta} onChange={setRemindBeta}>
            When the beta opens
          </CheckField>
          <CheckField checked={remindLaunch} onChange={setRemindLaunch}>
            When Agmt launches
          </CheckField>
        </div>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void send("remind")}
          className="mt-3 inline-flex min-h-11 items-center border border-rule-strong bg-card px-4 text-[0.9375rem] text-ink-2 transition-colors hover:border-ink disabled:opacity-60"
        >
          {busy === "remind" ? "Submitting…" : "Set my reminder"}
        </button>
      </div>
    </form>
  );
}

function Confirmation({
  result,
  onReset,
}: {
  result: SignupResult;
  onReset: () => void;
}) {
  return (
    <div className="signup-card border border-rule bg-card" role="status" aria-live="polite">
      <div className="border-b border-rule px-5 py-7 sm:px-6">
        <span className="grid size-10 place-items-center rounded-full bg-accent-soft text-accent">
          <Check className="size-5" aria-hidden />
        </span>
        <p className="mt-5 label text-accent">
          {result.outcome === "booked"
            ? "Seat booked"
            : result.outcome === "waitlist"
              ? "Waitlist"
              : "Reminder set"}
        </p>
        <p className="mt-2 max-w-[var(--measure)] font-serif text-[1.375rem] leading-snug text-ink">
          {result.message}
        </p>
        {result.returning && !result.changed ? (
          <p className="mt-2 text-sm text-muted">
            This address was already recorded, so nothing was booked twice.
          </p>
        ) : null}
      </div>
      <div className="px-5 py-4 sm:px-6">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex min-h-11 items-center text-sm text-accent underline underline-offset-4"
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

function CheckField({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex min-h-10 items-center gap-3 text-sm text-ink-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-[var(--color-accent)]"
      />
      {children}
    </label>
  );
}
