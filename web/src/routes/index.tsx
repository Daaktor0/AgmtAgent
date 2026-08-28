import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { bootstrapAccount, createMatter, listMatters } from "@/lib/fn/agmt";
import { Shell } from "@/components/agmt/shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { Instrument, RepresentedParty, Stage } from "@/lib/agmt/types";

export const Route = createFileRoute("/")({ component: Home });

const PARTIES: RepresentedParty[] = ["company", "promoter", "investor", "seller", "purchaser", "other"];
const STAGES: Stage[] = ["drafting", "negotiation", "signing", "closing"];
const INSTRUMENTS: Instrument[] = ["sha", "ssa", "spa", "disclosure_letter"];

function Home() {
  const { user, isPending } = useCurrentUserState();
  const [matters, setMatters] = useState<Awaited<ReturnType<typeof listMatters>> | null>(null);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void bootstrapAccount()
      .then((a) => setVerified(a.emailVerified))
      .catch(() => setVerified(false));
    void listMatters()
      .then(setMatters)
      .catch((e: Error) => setError(e.message));
  }, [user]);

  if (isPending || !user) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper px-4">
        <div className="max-w-md text-center">
          <p className="font-display text-4xl font-medium tracking-tight">Agmt</p>
          <p className="mt-3 text-sm text-ink-muted">
            {isPending ? "Opening your Matters." : "Redirecting to sign in."}
          </p>
        </div>
        {!isPending && !user ? <RedirectToSignIn /> : null}
      </main>
    );
  }

  return (
    <Shell>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section>
          <h1 className="font-display text-3xl font-medium">Matters</h1>
          <p className="mt-1 text-sm text-ink-muted">One deal pack. Multiple documents. Proof first.</p>
          {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
          {matters && matters.length === 0 ? (
            <p className="mt-8 text-sm text-ink-muted">Create your first Matter.</p>
          ) : (
            <ul className="mt-6 space-y-3">
              {(matters ?? []).map((m) => (
                <li key={m.matterId}>
                  <Link
                    to="/matters/$matterId"
                    params={{ matterId: m.matterId }}
                    className="block rounded-[16px] border border-rule bg-paper-elevated p-4 hover:border-rule-strong"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{m.name}</p>
                        <p className="mt-1 text-xs text-ink-muted">
                          {m.representedParty ?? "—"} · {m.stage ?? "—"} · {Number(m.documentCount)} document
                          {Number(m.documentCount) === 1 ? "" : "s"}
                        </p>
                      </div>
                      <Badge>{m.status}</Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <NewMatter
          verified={verified !== false}
          onCreated={() => {
            void listMatters().then(setMatters);
          }}
        />
      </div>
    </Shell>
  );
}

function NewMatter({ verified, onCreated }: { verified: boolean; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [party, setParty] = useState<RepresentedParty>("company");
  const [stage, setStage] = useState<Stage>("signing");
  const [instruments, setInstruments] = useState<Instrument[]>(["sha"]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggle(i: Instrument) {
    setInstruments((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));
  }

  return (
    <Card>
      <h2 className="font-display text-xl font-medium">New Matter</h2>
      <p className="mt-1 text-sm text-ink-muted">Mandate chip is versioned when you save.</p>
      {!verified ? (
        <p className="mt-4 text-sm text-danger">Verify your email for Agmt before creating a Matter.</p>
      ) : null}
      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          void createMatter({
            data: {
              name,
              representedParty: party,
              stage,
              instruments,
              mustProtectNotes: notes || undefined,
            },
          })
            .then(() => {
              setName("");
              setNotes("");
              onCreated();
            })
            .catch((ex: Error) => setErr(ex.message))
            .finally(() => setBusy(false));
        }}
      >
        <label className="block text-sm font-medium">
          Name
          <Input className="mt-1" required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block text-sm font-medium">
          Represented party
          <select
            className="mt-1 h-11 w-full rounded-[10px] border border-rule bg-paper-elevated px-3 text-sm"
            value={party}
            onChange={(e) => setParty(e.target.value as RepresentedParty)}
          >
            {PARTIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Stage
          <select
            className="mt-1 h-11 w-full rounded-[10px] border border-rule bg-paper-elevated px-3 text-sm"
            value={stage}
            onChange={(e) => setStage(e.target.value as Stage)}
          >
            {STAGES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend className="text-sm font-medium">Instruments</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {INSTRUMENTS.map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggle(i)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  instruments.includes(i) ? "border-forest bg-forest text-forest-fg" : "border-rule"
                }`}
              >
                {i}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="block text-sm font-medium">
          Must-protect notes
          <Textarea
            className="mt-1"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Priority or position. Not evidence of a document fact."
          />
        </label>
        <Button type="submit" className="w-full" disabled={busy || !verified || !instruments.length}>
          Create Matter
        </Button>
        {err ? <p className="text-sm text-danger">{err}</p> : null}
      </form>
    </Card>
  );
}
