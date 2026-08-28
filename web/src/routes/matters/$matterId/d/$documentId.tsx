import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  confirmCanonicalMap,
  getCanonicalMap,
  getProof,
  voteNotADefect,
} from "@/lib/fn/agmt";
import { Shell } from "@/components/agmt/shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { UserDecision } from "@/lib/agmt/types";

export const Route = createFileRoute("/matters/$matterId/d/$documentId")({
  component: DocumentPage,
});

const MUST_FIX = new Set([
  "structure.broken_xref",
  "exec.suspicious_field",
  "exec.unfilled_placeholder",
  "exec.unresolved_comment",
  "party.header_counterparty_mismatch",
  "amount.table_prose_conflict",
]);

function DocumentPage() {
  const { matterId, documentId } = Route.useParams();
  const { user, isPending } = useCurrentUserState();
  const [map, setMap] = useState<Awaited<ReturnType<typeof getCanonicalMap>> | undefined>();
  const [proof, setProof] = useState<Awaited<ReturnType<typeof getProof>> | undefined>();
  const [error, setError] = useState<string | null>(null);

  function reload() {
    void getCanonicalMap({ data: { documentId } }).then(setMap);
    void getProof({ data: { documentId } }).then(setProof);
  }

  useEffect(() => {
    if (!user) return;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, documentId]);

  if (isPending || !user) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper px-5">
        <div className="text-center">
          <p className="inline-block border-b-2 border-oxblood pb-1 font-display text-3xl font-semibold tracking-[-0.03em]">
            Agmt
          </p>
          <p className="mt-4 text-sm text-stone">Opening the document.</p>
        </div>
        {!isPending && !user ? <RedirectToSignIn /> : null}
      </main>
    );
  }

  if (map === null) {
    return (
      <Shell>
        <p className="text-sm text-stone">Document not found.</p>
      </Shell>
    );
  }

  if (!map) {
    return (
      <Shell>
        <div className="h-28 animate-pulse border-y border-rule bg-paper-sunk/50" />
      </Shell>
    );
  }

  const confirmed = map.map?.status === "confirmed" || map.version.ingestStatus === "indexed";
  const refused = map.version.ingestStatus === "refused";

  return (
    <Shell>
      <div className="border-b border-rule pb-6">
        <Link
          to="/matters/$matterId"
          params={{ matterId }}
          className="text-xs tracking-[0.04em] text-stone hover:text-ink"
        >
          Matter
        </Link>
        <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="font-display text-[28px] leading-[34px]">{map.document.logicalName}</h1>
            <p className="mt-2 text-xs text-stone tabular-nums">
              {map.document.detectedInstrument} · {map.version.pageCount} pages · {map.version.sourceQuality}
            </p>
          </div>
          <div className="text-xs tracking-[0.04em] text-stone">
            {confirmed ? "Proof" : "Map"}
          </div>
        </div>
      </div>

      {error ? (
        <p className="mt-4 border-l-2 border-oxblood pl-3 text-sm text-oxblood">{error}</p>
      ) : null}

      {refused ? (
        <section className="mt-8 border-y border-rule py-6">
          <p className="text-xs uppercase tracking-[0.14em] text-oxblood">Refused</p>
          <h2 className="mt-2 text-xl">We could not safely inspect this file.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone">
            {map.version.refusalCode}. No quality conclusion has been made for this version.
          </p>
        </section>
      ) : confirmed && proof?.run ? (
        <ProofPanel proof={proof} onVote={reload} />
      ) : (
        <MapPanel
          map={map}
          onConfirm={async (decisions) => {
            setError(null);
            try {
              const response = await confirmCanonicalMap({ data: { documentId, decisions } });
              if (!response.ok) setError(response.code);
              reload();
            } catch (cause) {
              setError((cause as Error).message);
            }
          }}
        />
      )}
    </Shell>
  );
}

function MapPanel({
  map,
  onConfirm,
}: {
  map: NonNullable<Awaited<ReturnType<typeof getCanonicalMap>>>;
  onConfirm: (
    decisions: Record<string, { decision: UserDecision; replacement?: string }>,
  ) => Promise<void>;
}) {
  const [decisions, setDecisions] = useState<
    Record<string, { decision: UserDecision; replacement?: string }>
  >({});
  const [busy, setBusy] = useState(false);

  const identifiers = map.entries.filter((entry) => entry.kind === "identifier");
  const names = map.entries.filter((entry) => entry.kind === "legal_name");
  const identifierPending = identifiers.some((entry) => !decisions[entry.entryId]);

  return (
    <div className="mt-8">
      <section className="border-b border-rule pb-6">
        <p className="text-[11px] uppercase tracking-[0.14em] text-stone">Canonicalisation</p>
        <h2 className="mt-2 text-2xl">Confirm what Proof may replace.</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-stone">
          Proof is deterministic and makes no model calls. This map protects identifiers and keeps defined terms stable.
          Review ambiguous detections before the final projection is created; amounts, dates, percentages and clause
          numbers are left untouched.
        </p>
      </section>

      <section className="border-b border-rule py-6">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="font-display text-lg">Legal names</h3>
          <span className="text-xs text-stone tabular-nums">{names.length}</span>
        </div>
        {names.length === 0 ? (
          <p className="mt-3 text-sm text-stone">No explicit legal-name mappings proposed.</p>
        ) : (
          <div className="mt-3 border-t border-rule">
            {names.map((entry) => {
              const decision = decisions[entry.entryId];
              return (
                <div
                  key={entry.entryId}
                  className="grid gap-4 border-b border-rule py-4 md:grid-cols-[1fr_1fr_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <p className="text-xs text-stone">Detected</p>
                    <p className="mt-1 truncate text-sm">{entry.originalPreview}</p>
                  </div>
                  <div>
                    <p className="text-xs text-stone">Canonical form</p>
                    <Input
                      className="mt-1 h-10 min-h-10 rounded-[2px]"
                      defaultValue={entry.replacement}
                      onBlur={(event) => {
                        const replacement = event.target.value.trim();
                        setDecisions((current) => ({
                          ...current,
                          [entry.entryId]: replacement === entry.replacement
                            ? { decision: "accept" }
                            : { decision: "correct", replacement },
                        }));
                      }}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant={!decision || decision.decision === "accept" ? "primary" : "secondary"}
                    onClick={() =>
                      setDecisions((current) => ({
                        ...current,
                        [entry.entryId]: { decision: "accept" },
                      }))
                    }
                  >
                    Accept
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="border-b border-rule py-6">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h3 className="font-display text-lg">Identifiers</h3>
            <p className="mt-1 text-sm text-stone">
              Each candidate requires an explicit decision. There is no bulk accept.
            </p>
          </div>
          <span className="text-xs text-stone tabular-nums">{identifiers.length}</span>
        </div>

        {identifiers.length === 0 ? (
          <p className="mt-3 text-sm text-stone">No identifier candidates detected.</p>
        ) : (
          <div className="mt-4 border-t border-rule">
            {identifiers.map((entry) => {
              const decision = decisions[entry.entryId]?.decision;
              return (
                <div
                  key={entry.entryId}
                  className="grid gap-3 border-b border-rule py-4 md:grid-cols-[1fr_auto] md:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone">
                      <span>{entry.originalPreview}</span>
                      <span>{entry.detector}</span>
                      <span className="tabular-nums">{Math.round(Number(entry.confidence) * 100)}%</span>
                    </div>
                    <p className="mt-2 text-sm">
                      Replace with <span className="font-medium">{entry.replacement}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={decision === "accept" ? "primary" : "secondary"}
                      onClick={() =>
                        setDecisions((current) => ({
                          ...current,
                          [entry.entryId]: { decision: "accept" },
                        }))
                      }
                    >
                      Replace
                    </Button>
                    <Button
                      size="sm"
                      variant={decision === "not_identifier" ? "primary" : "secondary"}
                      onClick={() =>
                        setDecisions((current) => ({
                          ...current,
                          [entry.entryId]: { decision: "not_identifier" },
                        }))
                      }
                    >
                      Not an identifier
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="pt-6">
        <Button
          disabled={busy || identifierPending}
          onClick={() => {
            setBusy(true);
            const merged = { ...decisions };
            for (const entry of names) {
              if (!merged[entry.entryId]) merged[entry.entryId] = { decision: "accept" };
            }
            void onConfirm(merged).finally(() => setBusy(false));
          }}
        >
          {busy ? "Running Proof…" : "Confirm map and run Proof"}
        </Button>
        {identifierPending ? (
          <p className="mt-3 text-sm text-stone">Decide every identifier candidate before Proof can run.</p>
        ) : null}
      </div>
    </div>
  );
}

function ProofPanel({
  proof,
  onVote,
}: {
  proof: NonNullable<Awaited<ReturnType<typeof getProof>>>;
  onVote: () => void;
}) {
  const suppressed = proof.executions.filter((execution) => execution.status === "suppressed");
  const failed = proof.executions.filter((execution) => execution.status === "failed");
  const invalidEvidence = proof.hits.filter((hit) => !hit.citationFaithful);
  const incomplete =
    proof.run?.status !== "complete" || suppressed.length > 0 || failed.length > 0 || invalidEvidence.length > 0;

  const visibleHits = proof.hits.filter((hit) => hit.citationFaithful);
  const mustFix = visibleHits.filter(
    (hit) => MUST_FIX.has(hit.checkId) || (hit.certainty === "exact" && hit.severity === "high"),
  );
  const consistency = visibleHits.filter((hit) => !mustFix.includes(hit));

  const title = incomplete
    ? "Proof finished with coverage gaps."
    : visibleHits.length
      ? "Proof found items to check."
      : "No issues found by the checks listed below.";

  const description = incomplete
    ? "One or more checks did not complete, or evidence could not be verified. No clean-document conclusion is made."
    : visibleHits.length
      ? "All applicable checks completed for this version. Clear the findings below before relying on the document."
      : "All applicable checks completed for this exact uploaded version. This is not a conclusion that the document is error-free or legally correct.";

  const completed = proof.executions.filter((execution) => execution.status === "completed").length;

  return (
    <div className="mt-8">
      <section className="border-b border-rule pb-7">
        <div className="flex flex-wrap items-center gap-3 text-xs text-stone">
          <span className={incomplete ? "text-oxblood" : "text-ink"}>
            {incomplete ? "Incomplete" : visibleHits.length ? "Attention required" : "Clear for this version"}
          </span>
          <span className="tabular-nums">{visibleHits.length} findings</span>
          <span className="tabular-nums">{completed}/{proof.executions.length} checks completed</span>
          <span>LLM calls {proof.llmCalls}</span>
        </div>
        <h2 className="mt-3 max-w-3xl font-display text-[28px] leading-[36px]">{title}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-stone">{description}</p>
      </section>

      <IssueSection title="Must fix" hits={mustFix} onVote={onVote} defaultOpen />
      <IssueSection title="Consistency" hits={consistency} onVote={onVote} defaultOpen={mustFix.length === 0} />

      <section className="border-b border-rule py-6">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="font-display text-lg">Language</h3>
          <span className="text-xs text-stone">Not enabled in this ruleset</span>
        </div>
        <p className="mt-2 text-sm text-stone">
          Legal-language and typography rules stay hidden until they meet their measured precision gate.
        </p>
      </section>

      <section className="border-b border-rule py-6">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="font-display text-lg">Formatting</h3>
          <span className="text-xs text-stone">Not enabled in this ruleset</span>
        </div>
        <p className="mt-2 text-sm text-stone">
          Visual and layout checks require the isolated rendering path; Proof does not guess when that capability is absent.
        </p>
      </section>

      <CoverageSection proof={proof} />
    </div>
  );
}

function IssueSection({
  title,
  hits,
  onVote,
  defaultOpen,
}: {
  title: string;
  hits: NonNullable<Awaited<ReturnType<typeof getProof>>>["hits"];
  onVote: () => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="border-b border-rule py-6">
      <button
        type="button"
        className="flex w-full items-baseline justify-between gap-4 text-left"
        onClick={() => setOpen((value) => !value)}
      >
        <h3 className="font-display text-xl">{title}</h3>
        <span className="text-xs text-stone tabular-nums">{hits.length} {open ? "−" : "+"}</span>
      </button>

      {open ? (
        hits.length ? (
          <div className="mt-4 border-t border-rule">
            {hits.map((hit) => (
              <FindingRow key={hit.proofHitId} hit={hit} onVote={onVote} />
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-stone">No active findings in this group.</p>
        )
      ) : null}
    </section>
  );
}

function FindingRow({
  hit,
  onVote,
}: {
  hit: NonNullable<Awaited<ReturnType<typeof getProof>>>["hits"][number];
  onVote: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const copy = findingCopy(hit.checkId);

  return (
    <article className="border-b border-rule py-5 last:border-b-0">
      <div className="grid gap-4 md:grid-cols-[120px_1fr_auto]">
        <div className="text-xs text-stone">
          <p className="tabular-nums">{hit.clause || "Document"}</p>
          <p className="mt-1">{hit.severity}</p>
        </div>
        <div>
          <p className="text-sm font-medium leading-5">{copy.title}</p>
          <p className="mt-1 text-sm leading-6 text-stone">{copy.why}</p>
          {hit.quote ? (
            <blockquote className="mt-4 border-l-2 border-rule-strong pl-4 font-display text-[16px] italic leading-[26px] text-ink">
              “{hit.quote}”
            </blockquote>
          ) : null}
          {expanded ? (
            <div className="mt-4 text-xs leading-5 text-stone">
              <p>
                Proof basis: {hit.checkId} · v{hit.checkVersion} · {hit.certainty}
              </p>
              <p className="mt-1 break-words">Observed: {JSON.stringify(hit.detailArgs)}</p>
            </div>
          ) : null}
        </div>
        <div className="flex items-start gap-2 md:flex-col">
          <Button size="sm" variant="secondary" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Less" : "Evidence"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void voteNotADefect({ data: { proofHitId: hit.proofHitId } }).then(onVote);
            }}
          >
            Not a defect
          </Button>
        </div>
      </div>
    </article>
  );
}

function CoverageSection({
  proof,
}: {
  proof: NonNullable<Awaited<ReturnType<typeof getProof>>>;
}) {
  const [open, setOpen] = useState(false);
  const capabilityText = useMemo(
    () =>
      proof.capabilities.map((capability) => ({
        name: capability.name,
        state: capability.available ? "present" : "absent",
      })),
    [proof.capabilities],
  );

  return (
    <section className="py-6">
      <button
        type="button"
        className="flex w-full items-baseline justify-between gap-4 text-left"
        onClick={() => setOpen((value) => !value)}
      >
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-stone">Coverage</p>
          <h3 className="mt-1 font-display text-xl">What Proof inspected</h3>
        </div>
        <span className="text-xs text-stone">{open ? "−" : "+"}</span>
      </button>

      {open ? (
        <div className="mt-5 grid gap-8 lg:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-stone">Rules</p>
            <div className="mt-2 border-t border-rule">
              {proof.executions.map((execution) => (
                <div
                  key={`${execution.checkId}:${execution.checkVersion}`}
                  className="flex items-center justify-between gap-4 border-b border-rule py-2 text-xs"
                >
                  <span>{execution.checkId}</span>
                  <span
                    className={
                      execution.status === "completed"
                        ? "text-stone"
                        : execution.status === "suppressed"
                          ? "text-ink"
                          : "text-oxblood"
                    }
                  >
                    {execution.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-stone">Source capabilities</p>
            <div className="mt-2 border-t border-rule">
              {capabilityText.map((capability) => (
                <div
                  key={capability.name}
                  className="flex items-center justify-between gap-4 border-b border-rule py-2 text-xs"
                >
                  <span>{capability.name}</span>
                  <span className="text-stone">{capability.state}</span>
                </div>
              ))}
            </div>
            {proof.quality ? (
              <p className="mt-4 text-xs leading-5 text-stone">
                Source quality {proof.quality.sourceQuality} · classified coverage{" "}
                {Math.round((proof.quality.classifiedShare ?? 0) * 100)}% · structure{" "}
                {Number(proof.quality.structureConfidence ?? 0).toFixed(2)}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function findingCopy(checkId: string): { title: string; why: string } {
  const copy: Record<string, { title: string; why: string }> = {
    "defterm.undefined_candidate": {
      title: "A capitalised term may be used without a definition.",
      why: "The reader may not know whether the wording is intended to carry a defined meaning.",
    },
    "defterm.unused": {
      title: "A defined term does not appear to be used.",
      why: "Unused definitions often indicate stale drafting or a deleted operative reference.",
    },
    "structure.broken_xref": {
      title: "An internal cross-reference does not resolve.",
      why: "The reader cannot reliably reach the provision the document points to.",
    },
    "structure.numbering_gap": {
      title: "The clause sequence contains a numbering gap.",
      why: "A missing number can indicate an omitted clause or an unintended numbering change.",
    },
    "structure.duplicate_number": {
      title: "The same clause number appears more than once.",
      why: "Duplicate labels make internal references ambiguous.",
    },
    "exec.signature_block_mismatch": {
      title: "The execution blocks do not match the detected parties.",
      why: "A party may be missing from, or incorrectly carried into, the signature section.",
    },
    "exec.hidden_character": {
      title: "Hidden or zero-width text is present.",
      why: "Invisible characters can split words, defined terms and search results without being obvious in Word.",
    },
    "exec.suspicious_field": {
      title: "A field may contain unresolved or external content.",
      why: "Stale or linked Word fields can display content that does not match the document source.",
    },
    "exec.unfilled_placeholder": {
      title: "An unfinished drafting placeholder remains.",
      why: "The document may still contain text that was intended to be completed before circulation or signing.",
    },
    "exec.unresolved_comment": {
      title: "An unresolved comment remains in the document.",
      why: "Open drafting comments can expose internal discussion or leave an issue unresolved.",
    },
    "party.header_counterparty_mismatch": {
      title: "A header or footer appears to contain an inconsistent party name.",
      why: "This can be residue from another document or an earlier transaction version.",
    },
    "amount.table_prose_conflict": {
      title: "An amount in a table conflicts with related prose.",
      why: "Two expressions of the same labelled value should not disagree.",
    },
  };
  return (
    copy[checkId] ?? {
      title: "Proof found a consistency issue.",
      why: "Review the source evidence and decide whether the difference is intentional.",
    }
  );
}
