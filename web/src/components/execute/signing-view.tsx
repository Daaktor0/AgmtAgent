import { useEffect, useMemo, useRef, useState } from "react";
import { chaseList, progress, signingFlags } from "@/lib/execute/checks";
import { renameSigning } from "@/lib/execute/signing";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useExecute } from "./execute-app";
import { DocumentsTab } from "./documents-tab";
import { ReturnsTab } from "./returns-tab";
import { CopiesTab } from "./copies-tab";
import { useModalFocus } from "./dialog";

export type Tab = "returns" | "documents" | "copies";

/** One rule per measure, like the fore-edge of a bound set: signed pages, stamp papers, copies ready. */
function Edge({ parts }: { parts: { done: number; total: number; testId: string; label: string }[] }) {
  return (
    <div className="grid gap-[3px]" aria-hidden="true">
      {parts.map((p, i) => (
        <div key={p.testId} className="h-[3px] bg-rule" data-testid={p.testId} data-done={p.done} data-total={p.total}>
          <div
            className={cn("h-full transition-[width] duration-500 ease-out motion-reduce:transition-none", i === 2 ? "bg-oxblood" : "bg-ink")}
            style={{ width: `${p.total ? Math.round((p.done / p.total) * 100) : 0}%` }}
          />
        </div>
      ))}
    </div>
  );
}

const SAVE_TEXT = {
  saved: "Saved in this browser",
  saving: "Saving…",
  unsaved: "Saving…",
  off: "Not saved. This browser isn't keeping site data.",
} as const;

function ChaseDialog({ text, onClose }: { text: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);
  useModalFocus(ref);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/30 px-4 py-10" onClick={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="chase-title" className="w-full max-w-[640px] space-y-4 border border-ink bg-paper p-6 sm:p-7" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <h2 id="chase-title" className="font-display text-3xl">
            Chase list
          </h2>
          <button type="button" onClick={onClose} className="px-1 text-2xl leading-none text-stone hover:text-ink" aria-label="Close chase list">
            ×
          </button>
        </div>
        <p className="text-sm text-stone">Plain text, ready to paste into an email.</p>
        <textarea ref={area} readOnly value={text} rows={Math.min(16, text.split("\n").length + 1)} className="block w-full resize-y border border-rule-strong bg-vellum p-3 text-[13px] leading-6 outline-none focus:border-ink" />
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() =>
              void navigator.clipboard?.writeText(text).then(
                () => setCopied(true),
                () => area.current?.select(),
              )
            }
          >
            {copied ? "Copied" : "Copy chase list"}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SigningView({ initialTab }: { initialTab?: Tab }) {
  const { signing, update, saveState, busy, ocrQueue, close } = useExecute();
  const hasPages = signing.documents.some((d) => Object.keys(d.sigPages).length > 0);
  const [tab, setTab] = useState<Tab>(initialTab ?? (hasPages && signing.returns.length ? "returns" : "documents"));
  const [copied, setCopied] = useState(false);
  const [chase, setChase] = useState<string | null>(null);
  const flags = useMemo(() => signingFlags(signing), [signing]);
  const p = useMemo(() => progress(signing, flags), [signing, flags]);
  const toFix = flags.filter((f) => f.severity === "problem").length;

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(t);
  }, [copied]);

  const tabs: { id: Tab; label: string; note: string }[] = [
    { id: "documents", label: "Documents", note: `${signing.documents.length}` },
    { id: "returns", label: "Returns", note: `${p.signedDone + p.stampDone} of ${p.signedTotal + p.stampTotal}` },
    { id: "copies", label: "Executed copies", note: `${p.copiesReady} of ${p.copiesTotal}` },
  ];

  return (
    <div className="space-y-7">
      <header className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[13px]">
          <button type="button" onClick={close} className="text-stone underline-offset-4 hover:text-ink hover:underline">
            ← All signings
          </button>
          <span className={cn("text-stone", saveState === "off" && "text-oxblood")} role="status">
            {busy ?? (ocrQueue ? `Reading ${ocrQueue} scan${ocrQueue === 1 ? "" : "s"} on this computer…` : SAVE_TEXT[saveState])}
          </span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <label className="group min-w-0 flex-1">
            <span className="text-[11px] uppercase tracking-[0.14em] text-stone opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
              Signing name
            </span>
            <textarea
              value={signing.name}
              rows={1}
              onChange={(e) => update((s) => renameSigning(s, e.target.value.replace(/\s*\n\s*/g, " ")))}
              onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
              style={{ fieldSizing: "content" } as React.CSSProperties}
              className="block w-full resize-none overflow-hidden border-0 border-b border-transparent bg-transparent px-0 font-display text-[30px] leading-tight tracking-[-0.015em] outline-none hover:border-rule focus:border-ink sm:text-[44px]"
              data-testid="signing-name"
            />
          </label>
          <div className="flex items-center gap-4 text-[13px]">
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={() => {
                const text = chaseList(signing);
                void navigator.clipboard?.writeText(text).then(
                  () => setCopied(true),
                  () => setChase(text),
                );
              }}
            >
              {copied ? "Chase list copied" : "Copy chase list"}
            </button>
            <button type="button" className="text-stone underline-offset-4 hover:text-ink hover:underline" onClick={() => setChase(chaseList(signing))}>
              View
            </button>
          </div>
        </div>
        <div className="space-y-2.5">
          <p className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-stone">
            <span data-testid="meter-pages">
              <b className="font-semibold tabular-nums text-ink">{p.signedDone}</b> of {p.signedTotal} signed pages
            </span>
            <span data-testid="meter-stamps">
              <b className="font-semibold tabular-nums text-ink">{p.stampDone}</b> of {p.stampTotal} stamp papers
            </span>
            <span data-testid="meter-copies">
              <b className="font-semibold tabular-nums text-ink">{p.copiesReady}</b> of {p.copiesTotal} executed copies ready
            </span>
            {toFix ? <span className="text-oxblood">{toFix} to fix</span> : null}
          </p>
          <Edge
            parts={[
              { done: p.signedDone, total: p.signedTotal, testId: "edge-pages", label: "Signed pages" },
              { done: p.stampDone, total: p.stampTotal, testId: "edge-stamps", label: "Stamp papers" },
              { done: p.copiesReady, total: p.copiesTotal, testId: "edge-copies", label: "Executed copies" },
            ]}
          />
        </div>
      </header>

      <nav className="grid grid-cols-3 border-b border-rule sm:flex sm:gap-1" aria-label="Signing">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            type="button"
            aria-current={tab === t.id ? "page" : undefined}
            onClick={() => setTab(t.id)}
            data-testid={`tab-${t.id}`}
            className={cn(
              "-mb-px flex min-w-0 flex-col items-start gap-0.5 border-b-2 px-2 py-2.5 text-left text-sm sm:flex-row sm:items-baseline sm:gap-2 sm:px-4 sm:py-3",
              tab === t.id ? "border-oxblood font-medium text-ink" : "border-transparent text-stone hover:text-ink",
            )}
          >
            <span className="flex items-baseline gap-1.5">
              <span className="font-display text-[13px] font-normal text-rule-strong" aria-hidden="true">
                {i + 1}
              </span>
              <span className="truncate">{t.id === "copies" ? <><span className="sm:hidden">Copies</span><span className="hidden sm:inline">{t.label}</span></> : t.label}</span>
            </span>
            <span className="text-[12px] font-normal tabular-nums text-stone">{t.note}</span>
          </button>
        ))}
      </nav>

      {tab === "documents" ? <DocumentsTab onDone={() => setTab("returns")} /> : null}
      {tab === "returns" ? <ReturnsTab flags={flags} onCopies={() => setTab("copies")} /> : null}
      {tab === "copies" ? <CopiesTab flags={flags} /> : null}
      {chase !== null ? <ChaseDialog text={chase} onClose={() => setChase(null)} /> : null}
    </div>
  );
}
