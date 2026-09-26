import { Alert, Check } from "./icons";
import { cn } from "@/lib/utils";

/**
 * The home page's opening picture: three pages of a signing set (an e-stamp
 * certificate, the agreement's cover, its execution page). On load the page is
 * signed, its flag comes off, and Execute reports what it placed and what it
 * caught. Names and certificate numbers come from Execute's built-in sample,
 * so nothing here is a real party. Sizes use container units, so the whole
 * set scales as one object.
 */
export function ClosingSet({ className }: { className?: string }) {
  return (
    <figure
      className={cn("relative mx-auto w-full max-w-[600px] [container-type:inline-size]", className)}
      aria-label="A signing set: an e-stamp certificate, the agreement's cover page and its execution page, signed in blue ink, with Execute's notes on what it placed and caught."
    >
      <div className="relative aspect-[1/0.98]">
        {/* Back: the e-stamp certificate */}
        <div
          className="cs-page absolute top-[2%] left-[4%] w-[54%]"
          style={{ transform: "rotate(-7deg)" }}
        >
          <div className="doc doc-estamp relative w-full p-[7%]">
            <p className="text-center font-sans text-[1.55cqw] font-semibold tracking-[0.08em]">
              INDIA NON JUDICIAL
            </p>
            <p className="mt-[3%] text-center text-[2.6cqw] italic">e-Stamp</p>
            <dl className="mt-[8%] grid grid-cols-[auto_1fr] gap-x-[5%] gap-y-[2.2cqw] font-sans text-[1.3cqw] leading-tight">
              <dt className="text-[var(--paper-ink-2)]">Certificate No.</dt>
              <dd className="font-mono">IN-DEMO402167</dd>
              <dt className="text-[var(--paper-ink-2)]">First party</dt>
              <dd>Meridian Foods Private Limited</dd>
              <dt className="text-[var(--paper-ink-2)]">Description</dt>
              <dd>Shareholders' agreement</dd>
              <dt className="text-[var(--paper-ink-2)]">Stamp duty (Rs.)</dt>
              <dd className="font-mono">500</dd>
            </dl>
          </div>
        </div>

        {/* Middle: the agreement's cover */}
        <div
          className="cs-page cs-page-2 absolute top-[5%] left-[21%] w-[54%]"
          style={{ transform: "rotate(-1.5deg)" }}
        >
          <div className="doc relative w-full px-[9%] py-[10%] text-center">
            <p className="font-sans text-[1.35cqw] tracking-[0.06em]">DATED ____________ 2026</p>
            <div className="mt-[14%] space-y-[3cqw] text-[1.55cqw] leading-snug">
              <p>
                (1) MERIDIAN FOODS
                <br />
                PRIVATE LIMITED
              </p>
              <p>(2) BANYAN CAPITAL FUND I</p>
              <p>
                (3) THE PERSONS LISTED IN
                <br />
                PART A OF SCHEDULE 1
              </p>
            </div>
            <div className="mx-auto mt-[14%] h-px w-[40%] bg-[var(--paper-line)]" />
            <p className="mt-[10%] text-[2.5cqw] font-semibold tracking-[0.04em]">
              SHAREHOLDERS'
              <br />
              AGREEMENT
            </p>
            <p className="mt-[5%] text-[1.4cqw] italic text-[var(--paper-ink-2)]">
              relating to Meridian Foods Private Limited
            </p>
          </div>
        </div>

        {/* Front: the execution page, signed on load */}
        <div
          className="cs-page cs-page-3 absolute top-[16%] right-[3%] w-[56%]"
          style={{ transform: "rotate(3deg)" }}
        >
          <div className="doc relative flex w-full flex-col overflow-visible px-[9%] pt-[9%] pb-[7%]">
            <div className="flex justify-between font-sans text-[1.2cqw] tracking-[0.06em] text-[var(--paper-ink-2)]">
              <span>SHAREHOLDERS' AGREEMENT</span>
              <span>PAGE 7</span>
            </div>
            <p className="mt-[12%] text-center text-[1.75cqw] font-semibold tracking-[0.1em]">
              EXECUTION PAGE
            </p>
            <p className="mt-[7%] text-justify text-[1.4cqw] leading-relaxed text-[var(--paper-ink-2)]">
              IN WITNESS WHEREOF the Parties have executed this Agreement on the date first
              written above, in counterparts, each of which is an original.
            </p>
            <div className="mt-[20%] grid grid-cols-[1fr_1.4cqw_1.1fr] gap-x-[2%] gap-y-[1.1cqw] text-[1.45cqw] leading-snug">
              <span>SIGNED for and on behalf of</span>
              <span className="text-[var(--paper-ink-2)]">)</span>
              <span />
              <span className="font-semibold">BANYAN CAPITAL FUND I</span>
              <span className="text-[var(--paper-ink-2)]">)</span>
              <span className="relative border-b border-[var(--paper-ink)]">
                <svg
                  viewBox="0 0 200 64"
                  className="absolute bottom-[10%] left-[-4%] w-[112%] overflow-visible"
                  aria-hidden
                >
                  <path
                    className="sig-path cs-sign"
                    d="M8 46 C 14 30, 22 10, 30 12 C 38 14, 26 44, 20 50 C 16 54, 14 46, 22 40 C 30 34, 40 36, 42 42 C 44 48, 36 50, 40 42 C 44 34, 50 30, 54 36 C 57 41, 56 46, 60 44 C 66 40, 66 30, 72 30 C 78 30, 74 44, 80 44 C 86 44, 88 30, 94 32 C 99 34, 96 44, 102 44 C 110 44, 116 22, 124 14 C 128 10, 130 16, 126 26 C 122 36, 116 48, 122 46 C 130 44, 136 34, 142 36 C 147 38, 144 46, 150 45 C 160 43, 172 34, 190 30 M 28 54 C 70 50, 120 49, 176 52"
                  />
                </svg>
                <span
                  className="flag cs-flag absolute text-[1.2cqw]"
                  style={{
                    left: "calc(100% + 0.5em)",
                    bottom: "-1.05em",
                    padding: "0.55em 0.9em 0.55em 1.7em",
                    clipPath: "polygon(0 50%, 1em 0, 100% 0, 100% 100%, 1em 100%)",
                  }}
                  aria-hidden
                >
                  Sign here
                </span>
              </span>
              <span>by its authorised signatory</span>
              <span className="text-[var(--paper-ink-2)]">)</span>
              <span className="text-[1.25cqw] text-[var(--paper-ink-2)]">Name:</span>
              <span />
              <span className="text-[var(--paper-ink-2)]">)</span>
              <span className="text-[1.25cqw] text-[var(--paper-ink-2)]">Designation:</span>
            </div>
            <p className="mt-auto pt-[8%] text-center text-[1.15cqw] italic text-[var(--paper-ink-2)]">
              [Signature page to the Shareholders' Agreement]
            </p>
          </div>
        </div>
      </div>

      {/* What Execute reports once the page is in */}
      <figcaption className="mt-6 grid gap-2.5 sm:mt-0 sm:block">
        <StatusCard
          className="cs-card cs-card-1 sm:absolute sm:top-[6%] sm:right-[-2%] sm:w-[46%]"
          tone="ok"
          title="Signed page placed"
          detail="Banyan Capital Fund I · SHA, page 7"
        />
        <StatusCard
          className="cs-card cs-card-2 sm:absolute sm:top-[60%] sm:left-[-3%] sm:w-[48%]"
          tone="ok"
          title="Stamp paper matched"
          detail="Meridian Foods · IN‑DEMO402167"
        />
        <StatusCard
          className="cs-card cs-card-3 sm:absolute sm:right-[1%] sm:bottom-[-3%] sm:w-[52%]"
          tone="flag"
          title="Certificate used twice"
          detail="IN‑DEMO402139 is on two parties' copies. Each needs its own."
        />
      </figcaption>
    </figure>
  );
}

function StatusCard({
  title,
  detail,
  tone,
  className,
}: {
  title: string;
  detail: string;
  tone: "ok" | "flag";
  className?: string;
}) {
  return (
    <div className={cn("status-card", className)}>
      <span
        className={cn(
          "status-icon",
          tone === "ok" ? "bg-ok-wash text-ok" : "bg-execute-wash text-execute",
        )}
      >
        {tone === "ok" ? <Check size={12} strokeWidth={2.2} /> : <Alert size={12} strokeWidth={2.4} />}
      </span>
      <span>
        <b>{title}</b>
        {detail}
      </span>
    </div>
  );
}
