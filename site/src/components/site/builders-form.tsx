import { useId, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { registerBuilderInterest } from "@/lib/builders";
import { BUILDERS } from "@/brand/copy";

function validateEmail(value: string): string | null {
  const v = value.trim();
  if (!v) return BUILDERS.validation.emailMissing;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return BUILDERS.validation.emailInvalid;
  return null;
}

function validateUrl(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes(".")) return BUILDERS.validation.urlInvalid;
    return null;
  } catch {
    return BUILDERS.validation.urlInvalid;
  }
}

export function BuildersForm() {
  const id = useId();
  const [email, setEmail] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [consent, setConsent] = useState(false);
  const [touched, setTouched] = useState({ email: false, productUrl: false, consent: false });
  const [status, setStatus] = useState<"idle" | "saving" | "success">("idle");
  const [formError, setFormError] = useState("");
  const submitting = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const errors = {
    email: validateEmail(email),
    productUrl: validateUrl(productUrl),
    consent: consent ? null : BUILDERS.validation.consentMissing,
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched({ email: true, productUrl: true, consent: true });
    if (errors.email || errors.productUrl || errors.consent) {
      const firstInvalid = errors.email
        ? `${id}-email`
        : errors.productUrl
          ? `${id}-url`
          : `${id}-consent`;
      document.getElementById(firstInvalid)?.focus();
      return;
    }
    if (submitting.current) return;
    submitting.current = true;
    setStatus("saving");
    setFormError("");
    try {
      const result = await registerBuilderInterest({
        data: { email: email.trim(), productUrl: productUrl.trim(), consent },
      });
      if (result.ok) {
        setStatus("success");
        requestAnimationFrame(() => headingRef.current?.focus());
      } else {
        setStatus("idle");
        setFormError(result.error);
      }
    } catch {
      setStatus("idle");
      setFormError(
        typeof navigator !== "undefined" && !navigator.onLine
          ? BUILDERS.validation.offline
          : BUILDERS.validation.saveFailure,
      );
    } finally {
      submitting.current = false;
    }
  }

  if (status === "success") {
    return (
      <div role="status">
        <h2 ref={headingRef} tabIndex={-1} className="text-product-title outline-none">
          {BUILDERS.confirmation.heading}
        </h2>
        <p className="mt-3 max-w-md text-[1.0625rem] leading-[1.7] text-[var(--color-ash)]">
          {BUILDERS.confirmation.body}
        </p>
        <Link to="/" className="text-link mt-6">
          {BUILDERS.confirmation.link}
        </Link>
      </div>
    );
  }

  const busy = status === "saving";

  return (
    <form onSubmit={submit} aria-busy={busy} noValidate className="max-w-md">
      <h2 className="text-product-title">{BUILDERS.formHeading}</h2>

      <div className="mt-7">
        <label htmlFor={`${id}-email`} className="field-label">
          {BUILDERS.fields.email.label}
        </label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder={BUILDERS.fields.email.placeholder}
          className="field-input mt-2"
          value={email}
          disabled={busy}
          aria-invalid={touched.email && !!errors.email}
          aria-describedby={`${id}-email-helper${touched.email && errors.email ? ` ${id}-email-error` : ""}`}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
        />
        <p id={`${id}-email-helper`} className="field-helper mt-1.5">
          {BUILDERS.fields.email.helper}
        </p>
        {touched.email && errors.email ? (
          <p id={`${id}-email-error`} role="alert" className="field-error mt-1.5">
            {errors.email}
          </p>
        ) : null}
      </div>

      <div className="mt-6">
        <label htmlFor={`${id}-url`} className="field-label">
          {BUILDERS.fields.url.label}
        </label>
        <input
          id={`${id}-url`}
          name="productUrl"
          type="text"
          inputMode="url"
          placeholder={BUILDERS.fields.url.placeholder}
          className="field-input mt-2"
          value={productUrl}
          disabled={busy}
          aria-invalid={touched.productUrl && !!errors.productUrl}
          aria-describedby={`${id}-url-helper${touched.productUrl && errors.productUrl ? ` ${id}-url-error` : ""}`}
          onChange={(e) => setProductUrl(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, productUrl: true }))}
        />
        <p id={`${id}-url-helper`} className="field-helper mt-1.5">
          {BUILDERS.fields.url.helper}
        </p>
        {touched.productUrl && errors.productUrl ? (
          <p id={`${id}-url-error`} role="alert" className="field-error mt-1.5">
            {errors.productUrl}
          </p>
        ) : null}
      </div>

      <label className="consent-row mt-6">
        <input
          id={`${id}-consent`}
          type="checkbox"
          checked={consent}
          disabled={busy}
          aria-invalid={touched.consent && !!errors.consent}
          aria-describedby={touched.consent && errors.consent ? `${id}-consent-error` : undefined}
          onChange={(e) => setConsent(e.target.checked)}
          onBlur={() => setTouched((t) => ({ ...t, consent: true }))}
        />
        <span>{BUILDERS.consentLabel}</span>
      </label>
      {touched.consent && errors.consent ? (
        <p id={`${id}-consent-error`} role="alert" className="field-error mt-1.5">
          {errors.consent}
        </p>
      ) : null}

      <button type="submit" className="btn btn-primary mt-7 w-full sm:w-auto" disabled={busy}>
        {busy ? BUILDERS.validation.saving : BUILDERS.cta}
      </button>

      {formError ? (
        <p role="alert" className="field-error mt-4">
          {formError}
        </p>
      ) : null}

      <p className="text-helper mt-6">
        {BUILDERS.privacyMicrocopyPrefix} <Link to="/privacy">Privacy Notice</Link>.
      </p>
    </form>
  );
}
