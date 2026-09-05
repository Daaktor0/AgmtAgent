import { useId, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, Check } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { submitSignup } from "@/lib/waitlist";
import { DISPATCH } from "@/brand/copy";

/** Reuses the existing reminder lane; never books or consumes a beta seat. */
export function DispatchForm() {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const submitting = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const data = new FormData(event.currentTarget);
    if (!data.get("consent")) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await submitSignup({
        data: {
          name: String(data.get("name") || "").trim(),
          email: String(data.get("email") || "").trim(),
          firm: "",
          role: "",
          interest: "both",
          intent: "remind",
          remindBeta: true,
          remindLaunch: true,
        },
      });
      if (result.ok) setSaved(true);
      else setError("We couldn’t save your details. Please try again in a moment.");
    } catch {
      setError("We couldn’t connect. Your details haven’t been confirmed. Please try again.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="dispatch-form-wrap">
      {saved ? (
        <div className="dispatch-success" role="status">
          <span className="success-mark">
            <Check aria-hidden />
          </span>
          <h3>You’re on the list.</h3>
          <p>
            We’ll write when there’s a beta opening or product launch to share. This signs you up
            for updates; it doesn’t reserve access.
          </p>
          <button type="button" className="text-link" onClick={() => setSaved(false)}>
            Use another email <ArrowUpRight size={16} aria-hidden />
          </button>
        </div>
      ) : (
        <form
          onSubmit={submit}
          className="dispatch-form"
          aria-label="Agmt Dispatch signup"
          aria-busy={busy}
        >
          <div className="field">
            <label htmlFor={`${id}-name`}>Your name</label>
            <input
              id={`${id}-name`}
              name="name"
              autoComplete="name"
              required
              maxLength={120}
              pattern=".*\S.*"
              placeholder="Alex Sharma"
              disabled={busy}
            />
          </div>
          <div className="field">
            <label htmlFor={`${id}-email`}>Email address</label>
            <input
              id={`${id}-email`}
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              maxLength={200}
              placeholder="you@example.com"
              disabled={busy}
            />
          </div>
          <label className="consent">
            <input name="consent" type="checkbox" required disabled={busy} />
            <span>{DISPATCH.consent}</span>
          </label>
          <button className="button button-accent" type="submit" disabled={busy}>
            {busy ? "Saving your details…" : "Keep me posted"}
            <ArrowUpRight size={18} aria-hidden />
          </button>
          <p className="form-note">
            Updates, not an access reservation. <Link to="/legal">How we use your details</Link>.
          </p>
          <p role="alert" className="form-error">
            {error}
          </p>
        </form>
      )}
    </div>
  );
}
