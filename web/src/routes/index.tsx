import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { createMatter, listMatters } from "@/lib/fn/agmt";
import { Shell } from "@/components/agmt/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Instrument, RepresentedParty, Stage } from "@/lib/agmt/types";

export const Route = createFileRoute("/")({ component: Home });

const PARTIES: Array<{ value: RepresentedParty; label: string }> = [
  { value: "company", label: "Company" },
  { value: "promoter", label: "Promoter" },
  { value: "investor", label: "Investor" },
  { value: "seller", label: "Seller" },
  { value: "purchaser", label: "Purchaser" },
  { value: "other", label: "Other" },
];

const STAGES: Array<{ value: Stage; label: string }> = [
  { value: "drafting", label: "Drafting" },
  { value: "negotiation", label: "Negotiation" },
  { value: "signing", label: "Signing" },
  { value: "closing", label: "Closing" },
];

const INSTRUMENTS: Array<{ value: Instrument; label: string }> = [
  { value: "sha", label: "SHA" },
  { value: "ssa", label: "SSA" },
  { value: "spa", label: "SPA" },
  { value: "disclosure_letter", label: "Disclosure letter" },
];

function partyLabel(value: string | null): string {
  return PARTIES.find((item) => item.value === value)?.label ?? "—";
}

function stageLabel(value: string | null): string {
  return STAGES.find((item) => item.value === value)?.label ?? "—";
}

function Home() {
  const { user, isPending } = useCurrentUserState();
  const [matters, setMatters] = useState<Awaited<ReturnType<typeof listMatters>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    setError(null);
    void listMatters()
      .then(setMatters)
      .catch((cause: Error) => setError(cause.message));
  }

  useEffect(() => {
    if (!user) return;
    reload();
  }, [user]);

  if (isPending || !user) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper px-5">
        <div className="text-center">
          <p className="inline-block border-b-2 border-oxblood pb-1 font-display text-4xl font-semibold tracking-[-0.04em]">
            Agmt
          </p>
          <p className="mt-4 text-sm text-stone">
            {isPending ? "Opening your workspace." : "Preparing your private workspace."}
          </p>
        </div>
        {!isPending && !user ? <RedirectToSignIn /> : null}
      </main>
    );
  }

  return (
    <Shell>
      <header className="flex flex-col gap-7 border-b border-rule pb-9 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-oxblood">Workspace · Proof</p>
          <h1 className="mt-3 font-display text-[46px] leading-[0.98] tracking-[-0.045em] text-ink sm:text-[58px]">
            Matters
          </h1>
          <p className="mt-5 max-w-2xl text-[15px] leading-7 text-stone sm:text-base">
            Keep the deal pack together. Add the native Word agreement, confirm what the document contains, then run a structured Proof pass.
          </p>
        </div>
        <a
          href="#new-matter"
          className="inline-flex min-h-11 w-fit items-center gap-3 border border-oxblood bg-oxblood px-5 text-sm font-medium text-paper no-underline transition-colors hover:bg-oxblood-pressed"
        >
          New matter
          <span aria-hidden="true">→</span>
        </a>
      </header>

      <div className="mt-9 grid gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)] xl:gap-16">
        <section aria-labelledby="matter-list-heading">
          <div className="flex items-end justify-between gap-5">
            <div>
              <p id="matter-list-heading" className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">
                Your work
              </p>
              <p className="mt-1 text-sm text-stone">
                {matters ? `${matters.length} active matter${matters.length === 1 ? "" : "s"}` : "Loading matters"}
              </p>
            </div>
          </div>

          {error ? (
            <div className="mt-5 border-l-2 border-oxblood bg-paper-sunk/50 px-5 py-4">
              <p className="text-sm font-medium text-oxblood">Could not open your matters</p>
              <p className="mt-1 text-sm leading-6 text-stone">{error}</p>
              <button className="mt-3 text-sm font-medium text-ink underline underline-offset-4" onClick={reload}>
                Try again
              </button>
            </div>
          ) : null}

          {!error && matters === null ? (
            <div className="mt-5 space-y-3">
              <div className="h-24 animate-pulse border-y border-rule bg-paper-sunk/40" />
              <div className="h-24 animate-pulse border-y border-rule bg-paper-sunk/25" />
            </div>
          ) : null}

          {!error && matters?.length === 0 ? (
            <div className="mt-5 border border-rule bg-[linear-gradient(135deg,rgba(237,231,218,0.72),rgba(244,239,230,0.2))] px-7 py-9 sm:px-10 sm:py-11">
              <div className="max-w-2xl">
                <span className="inline-flex border border-rule-strong px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.13em] text-stone">
                  Empty workspace
                </span>
                <h2 className="mt-6 max-w-[15ch] font-display text-[34px] leading-[1.04] tracking-[-0.025em] sm:text-[42px]">
                  Start with the agreement you are working on now.
                </h2>
                <p className="mt-4 max-w-xl text-[15px] leading-7 text-stone">
                  A Matter is one deal pack. Set the mandate once, add one or more native Word documents, and keep Proof results attached to the right version.
                </p>
              </div>

              <ol className="mt-10 grid border-l border-t border-rule sm:grid-cols-3">
                {[
                  ["01", "Create the Matter", "Who you act for, deal stage and instruments."],
                  ["02", "Add the Word file", "Upload the native .docx. No PDF conversion."],
                  ["03", "Run Proof", "Confirm the document map, then inspect the findings."],
                ].map(([number, title, copy]) => (
                  <li key={number} className="min-h-40 border-b border-r border-rule bg-paper/55 p-5">
                    <span className="text-[10px] font-medium tracking-[0.14em] text-oxblood">{number}</span>
                    <p className="mt-7 font-display text-xl text-ink">{title}</p>
                    <p className="mt-2 text-xs leading-5 text-stone">{copy}</p>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {!error && matters && matters.length > 0 ? (
            <div className="mt-5 border-t border-rule">
              {matters.map((matter) => (
                <Link
                  key={matter.matterId}
                  to="/matters/$matterId"
                  params={{ matterId: matter.matterId }}
                  className="group grid gap-5 border-b border-rule px-1 py-6 no-underline transition-colors hover:bg-paper-sunk/45 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-4"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="truncate font-display text-[25px] leading-tight text-ink">{matter.name}</h2>
                      <span className="border border-rule px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-stone">
                        {matter.status}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-stone">
                      {partyLabel(matter.representedParty)} · {stageLabel(matter.stage)} · {Number(matter.documentCount)} document{Number(matter.documentCount) === 1 ? "" : "s"}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {(matter.instruments ?? []).map((instrument) => (
                        <span key={instrument} className="border border-rule bg-paper px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] text-stone">
                          {INSTRUMENTS.find((item) => item.value === instrument)?.label ?? instrument}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 self-center text-xs font-medium text-oxblood">
                    Open matter
                    <span className="transition-transform group-hover:translate-x-1" aria-hidden="true">→</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : null}
        </section>

        <NewMatter />
      </div>
    </Shell>
  );
}

function NewMatter() {
  const [name, setName] = useState("");
  const [party, setParty] = useState<RepresentedParty>("company");
  const [stage, setStage] = useState<Stage>("signing");
  const [instruments, setInstruments] = useState<Instrument[]>(["sha"]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggle(instrument: Instrument) {
    setInstruments((current) =>
      current.includes(instrument)
        ? current.filter((value) => value !== instrument)
        : [...current, instrument],
    );
  }

  return (
    <aside id="new-matter" className="scroll-mt-24 lg:sticky lg:top-[104px] lg:self-start">
      <div className="border border-rule bg-paper-sunk/35">
        <div className="border-b border-rule px-6 py-6 sm:px-7">
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-oxblood">New matter</p>
          <h2 className="mt-3 font-display text-[30px] leading-tight tracking-[-0.025em]">Set the mandate.</h2>
          <p className="mt-3 text-sm leading-6 text-stone">
            This context stays with the deal pack and tells Agmt how to organise the work around it.
          </p>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            setErr(null);
            void createMatter({
              data: {
                name,
                representedParty: party,
                stage,
                instruments,
                mustProtectNotes: notes.trim() || undefined,
              },
            })
              .then(({ matterId }) => {
                window.location.assign(`/matters/${matterId}`);
              })
              .catch((cause: Error) => setErr(cause.message))
              .finally(() => setBusy(false));
          }}
          className="px-6 py-6 sm:px-7"
        >
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-stone">Matter name</span>
            <Input
              className="mt-2 h-12 bg-paper text-[15px]"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Acme Series A"
            />
          </label>

          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <label className="block">
              <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-stone">You act for</span>
              <select
                className="mt-2 h-12 w-full border border-rule bg-paper px-3 text-sm text-ink outline-none focus:border-oxblood"
                value={party}
                onChange={(event) => setParty(event.target.value as RepresentedParty)}
              >
                {PARTIES.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-stone">Deal stage</span>
              <select
                className="mt-2 h-12 w-full border border-rule bg-paper px-3 text-sm text-ink outline-none focus:border-oxblood"
                value={stage}
                onChange={(event) => setStage(event.target.value as Stage)}
              >
                {STAGES.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
          </div>

          <fieldset className="mt-6">
            <legend className="text-[11px] font-medium uppercase tracking-[0.1em] text-stone">Documents in this deal</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {INSTRUMENTS.map((item) => {
                const selected = instruments.includes(item.value);
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => toggle(item.value)}
                    className={`min-h-11 border px-3 text-left text-xs font-medium transition-colors ${
                      selected
                        ? "border-oxblood bg-oxblood text-paper"
                        : "border-rule bg-paper text-ink hover:border-rule-strong"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label className="mt-6 block">
            <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-stone">
              Must-protect position <span className="normal-case tracking-normal text-stone/70">· optional</span>
            </span>
            <Textarea
              className="mt-2 min-h-24 bg-paper text-sm"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="The commercial or legal position that should stay visible during Review."
            />
          </label>

          {err ? (
            <p className="mt-4 border-l-2 border-oxblood pl-3 text-sm leading-6 text-oxblood">{err}</p>
          ) : null}

          <Button type="submit" className="mt-6 h-12 w-full justify-between px-4" disabled={busy || !name.trim() || !instruments.length}>
            <span>{busy ? "Creating matter…" : "Create matter"}</span>
            {!busy ? <span aria-hidden="true">→</span> : null}
          </Button>

          <p className="mt-4 text-[11px] leading-5 text-stone">
            Proof is free. Review remains unavailable in this testing build.
          </p>
        </form>
      </div>
    </aside>
  );
}
