import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { confirmCanonicalMap, getCanonicalMap, getProof, voteNotADefect } from "@/lib/fn/agmt";
import { Shell } from "@/components/agmt/shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { UserDecision } from "@/lib/agmt/types";

export const Route = createFileRoute("/matters/$matterId/d/$documentId")({
  component: DocumentPage,
});

function DocumentPage() {
  const { matterId, documentId } = Route.useParams();
  const { user, isPending } = useCurrentUserState();
  const [map, setMap] = useState<Awaited<ReturnType<typeof getCanonicalMap>> | undefined>(undefined);
  const [proof, setProof] = useState<Awaited<ReturnType<typeof getProof>> | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);

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
      <main className="grid min-h-screen place-items-center bg-paper px-4">
        <div className="text-center">
          <p className="font-display text-3xl">Agmt</p>
          <p className="mt-2 text-sm text-ink-muted">Opening the document.</p>
        </div>
        {!isPending && !user ? <RedirectToSignIn /> : null}
      </main>
    );
  }
  if (map === null) {
    return (
      <Shell>
        <p className="text-sm text-ink-muted">Document not found.</p>
      </Shell>
    );
  }
  if (!map) {
    return (
      <Shell>
        <div className="h-40 animate-pulse rounded-[24px] bg-rule/40" />
      </Shell>
    );
  }

  const confirmed = map.map?.status === "confirmed" || map.version.ingestStatus === "indexed";
  const refused = map.version.ingestStatus === "refused";

  return (
    <Shell>
      <Link
        to="/matters/$matterId"
        params={{ matterId }}
        className="text-sm text-ink-muted hover:text-ink"
      >
        Back to Matter
      </Link>
      <h1 className="mt-3 font-display text-3xl font-medium">{map.document.logicalName}</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {map.document.detectedInstrument} · {map.version.pageCount} pages · {map.version.sourceQuality}
        {map.version.structureConfidence != null
          ? ` · structure ${Number(map.version.structureConfidence).toFixed(2)}`
          : ""}
      </p>
      {map.document.detectedInstrument === "spa" ? (
        <p className="mt-3 rounded-[12px] border border-warn/40 bg-paper-elevated px-3 py-2 text-sm text-warn">
          SPA detected. Review is unsupported in v1. Proof remains available.
        </p>
      ) : null}
      {err ? <p className="mt-3 text-sm text-danger">{err}</p> : null}

      {refused ? (
        <Card className="mt-6">
          <p className="font-medium text-danger">Refused</p>
          <p className="mt-2 text-sm">{map.version.refusalCode}. The original is stored but not indexed.</p>
        </Card>
      ) : confirmed && proof?.run ? (
        <ProofPanel proof={proof} onVote={() => reload()} />
      ) : (
        <MapPanel
          map={map}
          onConfirm={async (decisions) => {
            setErr(null);
            try {
              const r = await confirmCanonicalMap({ data: { documentId, decisions } });
              if (!r.ok) setErr(r.code);
              reload();
            } catch (e) {
              setErr((e as Error).message);
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
  onConfirm: (d: Record<string, { decision: UserDecision; replacement?: string }>) => Promise<void>;
}) {
  const [decisions, setDecisions] = useState<
    Record<string, { decision: UserDecision; replacement?: string }>
  >({});
  const [busy, setBusy] = useState(false);

  const identifiers = map.entries.filter((e) => e.kind === "identifier");
  const names = map.entries.filter((e) => e.kind === "legal_name");
  const identifierPending = identifiers.some((e) => !decisions[e.entryId]);

  return (
    <div className="mt-6 space-y-6">
      <Card>
        <h2 className="font-display text-xl">Canonicalisation map</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Confirm legal-name mappings and identifier removals. You cannot edit canonical text directly.
          Defined terms stay visible. Amounts, dates, percentages, clause numbers and governing law are not masked.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(map.identifierCounts).map(([k, n]) => (
            <Badge key={k}>
              {k} · {n}
            </Badge>
          ))}
          {Object.keys(map.identifierCounts).length === 0 ? <Badge>No identifiers proposed</Badge> : null}
        </div>
      </Card>

      <Card>
        <h3 className="font-medium">Legal names → defined terms</h3>
        {names.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">No explicit defined-term mappings proposed.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {names.map((e) => (
              <li key={e.entryId} className="rounded-[12px] border border-rule p-3 text-sm">
                <p>
                  <span className="font-mono text-xs">{e.originalPreview}</span>
                  <span className="mx-2 text-ink-subtle">→</span>
                  <strong>{e.replacement}</strong>
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={decisions[e.entryId]?.decision === "accept" || !decisions[e.entryId] ? "primary" : "secondary"}
                    onClick={() => setDecisions((d) => ({ ...d, [e.entryId]: { decision: "accept" } }))}
                  >
                    Accept
                  </Button>
                  <label className="flex items-center gap-2 text-xs">
                    Correct to
                    <Input
                      className="h-9 min-h-9 w-40"
                      defaultValue={e.replacement}
                      onBlur={(ev) =>
                        setDecisions((d) => ({
                          ...d,
                          [e.entryId]: { decision: "correct", replacement: ev.target.value },
                        }))
                      }
                    />
                  </label>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h3 className="font-medium">Identifiers</h3>
        <p className="mt-1 text-sm text-ink-muted">
          Original values are not shown in full. Mark false matches “not an identifier”.
        </p>
        {identifiers.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">None detected.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {identifiers.map((e) => (
              <li key={e.entryId} className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-rule p-3 text-sm">
                <span>
                  {e.originalPreview} → <span className="font-mono">{e.replacement}</span>
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={decisions[e.entryId]?.decision === "accept" ? "primary" : "secondary"}
                    onClick={() => setDecisions((d) => ({ ...d, [e.entryId]: { decision: "accept" } }))}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant={decisions[e.entryId]?.decision === "not_identifier" ? "primary" : "secondary"}
                    onClick={() =>
                      setDecisions((d) => ({ ...d, [e.entryId]: { decision: "not_identifier" } }))
                    }
                  >
                    Not an identifier
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {identifiers.length ? (
          <Button
            className="mt-3"
            variant="secondary"
            onClick={() => {
              const next = { ...decisions };
              for (const e of identifiers) next[e.entryId] = { decision: "accept" };
              setDecisions(next);
            }}
          >
            Accept all identifiers
          </Button>
        ) : null}
      </Card>

      <Button
        disabled={busy || identifierPending}
        onClick={() => {
          setBusy(true);
          const merged = { ...decisions };
          for (const e of names) if (!merged[e.entryId]) merged[e.entryId] = { decision: "accept" };
          void onConfirm(merged).finally(() => setBusy(false));
        }}
      >
        {busy ? "Running Proof…" : "Confirm map and run Proof"}
      </Button>
      {identifierPending ? (
        <p className="text-sm text-ink-muted">Review every identifier candidate before confirmation.</p>
      ) : null}
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
  const [tab, setTab] = useState<"hits" | "deal" | "outline" | "index" | "coverage">("hits");
  const statusTone =
    proof.run?.status === "complete" ? "ok" : proof.run?.status === "partial" ? "warn" : "danger";
  const suppressed = proof.executions.filter((e) => e.status === "suppressed");
  const q = proof.quality;
  const qualityTone =
    q?.sourceQuality === "high" ? "ok" : q?.sourceQuality === "unreadable" ? "danger" : "warn";
  const gate = proof.reviewGate;
  const unclassifiedShare =
    q && q.classifiedShare != null ? Math.round((1 - q.classifiedShare) * 100) : null;

  const defsByScope = new Map<string, typeof proof.definitions>();
  for (const d of proof.definitions) {
    const key = `${d.scopeType} · ${d.scopeId}`;
    const list = defsByScope.get(key) ?? [];
    list.push(d);
    defsByScope.set(key, list);
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={statusTone}>Proof {proof.run?.status}</Badge>
        <Badge>LLM calls {proof.llmCalls}</Badge>
        {q ? (
          <Badge tone={qualityTone}>Source quality {q.sourceQuality}</Badge>
        ) : proof.version.sourceQuality !== "high" ? (
          <Badge tone="warn">Source quality {proof.version.sourceQuality}</Badge>
        ) : null}
        {q?.materialUnclassified ? <Badge tone="warn">incomplete source</Badge> : null}
        {q && !q.usableOutline ? <Badge tone="danger">no usable outline</Badge> : null}
      </div>

      {q ? (
        <Card>
          <p className="text-xs uppercase tracking-wider text-ink-subtle">Source quality</p>
          <p className="mt-1 font-display text-xl">
            {q.sourceQuality}
            {q.structureConfidence != null ? (
              <span className="ml-2 font-sans text-sm text-ink-muted">
                structure {Number(q.structureConfidence).toFixed(2)} · {q.indexQualityVersion}
              </span>
            ) : null}
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            Classified coverage {Math.round((q.classifiedShare ?? 0) * 100)}%. Unclassified{" "}
            {q.unclassifiedLeafCount} {q.unclassifiedLeafCount === 1 ? "leaf" : "leaves"},{" "}
            {q.unclassifiedChars.toLocaleString()} characters
            {unclassifiedShare != null ? ` (${unclassifiedShare}%)` : ""}.
            {q.materialUnclassified
              ? " Material unclassified text — Review would run with incomplete_source, not a refusal."
              : q.usableOutline
                ? " Outline is usable."
                : " No usable outline — Review is blocked."}
          </p>
          {q.components && Object.keys(q.components).length > 0 ? (
            <ul className="mt-3 grid gap-1 text-xs text-ink-muted sm:grid-cols-2">
              {Object.entries(q.components).map(([k, n]) => (
                <li key={k} className="flex justify-between gap-3 border-b border-rule/50 py-1">
                  <span>{k}</span>
                  <span className="font-mono">{Number(n).toFixed(2)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}

      <p className="text-xs text-ink-muted">
        Source capability:{" "}
        {proof.capabilities.length
          ? proof.capabilities.map((c) => `${c.name} ${c.available ? "available" : "off"}`).join(" · ")
          : "not recorded"}
      </p>
      {proof.run?.status === "partial" ? (
        <p className="text-sm text-warn">
          Partial. Suppressed checks: {suppressed.map((s) => s.checkId).join(", ") || "none listed"}. This is not a
          clean result.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(["hits", "deal", "outline", "index", "coverage"] as const).map((t) => (
          <Button key={t} size="sm" variant={tab === t ? "primary" : "secondary"} onClick={() => setTab(t)}>
            {t === "hits"
              ? "Hits"
              : t === "deal"
                ? "Deal map"
                : t === "outline"
                  ? "Outline"
                  : t === "index"
                    ? "Index"
                    : "Coverage"}
          </Button>
        ))}
      </div>

      {tab === "hits" ? (
        <Card>
          {proof.noHitsCopy ? (
            <p>{proof.noHitsCopy}</p>
          ) : proof.hits.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No hits stored. {suppressed.length ? "Required checks were suppressed — not a clean pass." : ""}
            </p>
          ) : (
            <ul className="space-y-4">
              {proof.hits.map((h) => (
                <li key={h.proofHitId} className="border-b border-rule pb-4 last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={h.severity === "high" ? "danger" : "neutral"}>
                      {h.checkId} · v{h.checkVersion}
                    </Badge>
                    <Badge>{h.severity}</Badge>
                    <Badge>{h.certainty}</Badge>
                    <span className="text-xs text-ink-muted">{h.clause}</span>
                    {!h.citationFaithful ? <Badge tone="danger">citation invalid</Badge> : null}
                  </div>
                  <blockquote className="mt-2 border-l-2 border-forest pl-3 font-mono text-xs leading-relaxed">
                    {h.quote}
                  </blockquote>
                  <p className="mt-1 text-xs text-ink-subtle">
                    {h.detailCode} · offsets {h.quoteStart}–{h.quoteEnd}
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-1"
                    onClick={() => {
                      void voteNotADefect({ data: { proofHitId: h.proofHitId } }).then(onVote);
                    }}
                  >
                    Not a defect
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === "deal" ? (
        <Card>
          <ul className="space-y-2 text-sm">
            {proof.dealMap.map((e, i) => (
              <li key={i} className="flex justify-between gap-4 border-b border-rule/70 py-2">
                <span className="text-ink-muted">{e.category}</span>
                <span className="text-right">{e.value ?? e.uncertainty ?? "absent"}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wider text-ink-subtle">Signature inventory</p>
            <p className="mt-2 text-sm">
              Named parties: {proof.signatures?.namedParties.length ? proof.signatures.namedParties.join(", ") : "none"}
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {(proof.signatures?.blocks ?? []).map((b) => (
                <li key={b.provisionId} className="font-mono text-xs">
                  {b.label}
                </li>
              ))}
              {(proof.signatures?.blocks ?? []).length === 0 ? (
                <li className="text-ink-muted">No signature blocks extracted.</li>
              ) : null}
            </ul>
          </div>
        </Card>
      ) : null}

      {tab === "outline" ? (
        <Card>
          <p className="text-xs uppercase tracking-wider text-ink-subtle">Provision tree</p>
          <ul className="mt-2 space-y-1 font-mono text-xs">
            {proof.outline.map((p) => {
              const depth = p.parent && p.parent !== "p:root" ? 1 : 0;
              const unclassified = p.nodeType === "unclassified";
              return (
                <li
                  key={p.provisionId}
                  className={unclassified ? "text-warn" : undefined}
                >
                  {depth ? <span className="inline-block w-3" /> : null}
                  <span className="text-ink-subtle">{p.nodeType}</span>{" "}
                  {p.number ? <strong>{p.number}</strong> : null} {p.heading || p.preview}
                  {unclassified ? " · unclassified" : null}
                  {!p.ownsText ? " · container" : null}
                </li>
              );
            })}
          </ul>
          {q ? (
            <p className="mt-3 text-xs text-ink-muted">
              Unclassified volume: {q.unclassifiedLeafCount} leaves / {q.unclassifiedChars.toLocaleString()} characters.
              Every non-blank line owns exactly one leaf.
            </p>
          ) : null}
        </Card>
      ) : null}

      {tab === "index" ? (
        <Card>
          <p className="text-xs uppercase tracking-wider text-ink-subtle">Namespaced definitions</p>
          {defsByScope.size === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">No definitions stored.</p>
          ) : (
            [...defsByScope.entries()].map(([scope, list]) => (
              <div key={scope} className="mt-3">
                <p className="text-xs text-ink-muted">{scope}</p>
                <ul className="mt-1 flex flex-wrap gap-2">
                  {list.map((d, i) => (
                    <Badge key={`${d.term}-${i}`}>
                      {d.term}
                      {d.kind === "defined_party" ? " · party" : ""}
                    </Badge>
                  ))}
                </ul>
              </div>
            ))
          )}
        </Card>
      ) : null}

      {tab === "coverage" ? (
        <Card>
          <p className="text-sm">Every required v1 check is completed or expressly suppressed.</p>
          <ul className="mt-3 space-y-2 text-sm">
            {proof.executions.map((e) => (
              <li key={e.checkId} className="flex justify-between gap-3">
                <span className="font-mono text-xs">
                  {e.checkId} · v{e.checkVersion}
                </span>
                <span>
                  {e.status}
                  {e.hitCount ? ` · ${e.hitCount} hits` : ""}
                  {Array.isArray(e.missing) && (e.missing as string[]).length
                    ? ` · missing ${(e.missing as string[]).join(", ")}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wider text-ink-subtle">Capabilities</p>
            <ul className="mt-2 text-sm">
              {proof.capabilities.map((c) => (
                <li key={c.name}>
                  {c.name}: {c.available ? "available" : `suppressed${c.reason ? ` — ${c.reason}` : ""}`}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      ) : null}

      <Card>
        <p className="text-sm text-ink-muted">{gate?.reason ?? "Run Review is unavailable in this slice."}</p>
        {gate?.coverage === "incomplete_source" ? (
          <p className="mt-2 text-sm text-warn">Coverage flag: incomplete_source. This is not a clean Review path.</p>
        ) : null}
        <Button className="mt-3" disabled>
          {gate?.code === "no_usable_outline" || gate?.code === "unreadable" || gate?.code === "refused"
            ? "Run Review — blocked"
            : gate?.coverage === "incomplete_source"
              ? "Run Review — incomplete source"
              : "Run Review — Slice 3"}
        </Button>
      </Card>
    </div>
  );
}

