import { useEffect, useMemo, useState } from "react";
import { chaseList, progress, signingFlags } from "@/lib/execute/checks";
import { renameSigning } from "@/lib/execute/signing";
import { cn } from "@/lib/utils";
import { useExecute } from "./execute-app";
import { DocumentsTab } from "./documents-tab";
import { ReturnsTab } from "./returns-tab";
import { CopiesTab } from "./copies-tab";

export type Tab = "returns" | "documents" | "copies";

function Meter({ label, done, total, testId }: { label: string; done: number; total: number; testId?: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="min-w-[150px] flex-1" data-testid={testId}>
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="text-stone">{label}</span>
        <span className="tabular-nums">
          {done}
          <span className="text-stone"> / {total}</span>
        </span>
      </div>
      <div className="mt-2 h-[3px] bg-rule" aria-hidden="true">
        <div className="h-full bg-ink transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const SAVE_TEXT = {
  saved: "Saved on this computer",
  saving: "Saving…",
  unsaved: "Saving…",
  off: "Not saved: this browser isn't keeping data",
} as const;

export function SigningView({ initialTab }: { initialTab?: Tab }) {
  const { signing, update, saveState, busy, ocrQueue, close } = useExecute();
  const hasPages = signing.documents.some((d) => Object.keys(d.sigPages).length > 0);
  const [tab, setTab] = useState<Tab>(initialTab ?? (hasPages && signing.returns.length ? "returns" : "documents"));
  const [copied, setCopied] = useState(false);
  const flags = useMemo(() => signingFlags(signing), [signing]);
  const p = useMemo(() => progress(signing, flags), [signing, flags]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(t);
  }, [copied]);

  const tabs: { id: Tab; label: string; note?: string }[] = [
    { id: "documents", label: "Documents", note: `${signing.documents.length}` },
    { id: "returns", label: "Returns", note: `${p.signedDone + p.stampDone} of ${p.signedTotal + p.stampTotal}` },
    { id: "copies", label: "Executed copies", note: `${p.copiesReady} ready` },
  ];

  return (
    <div className="space-y-8">
      <header className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[13px]">
          <button type="button" onClick={close} className="text-stone underline-offset-4 hover:text-ink hover:underline">
            ← All signings
          </button>
          <span className={cn("text-stone", saveState === "off" && "text-oxblood")} role="status">
            {busy ?? (ocrQueue ? `Reading ${ocrQueue} scan${ocrQueue === 1 ? "" : "s"}…` : SAVE_TEXT[saveState])}
          </span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Signing name</span>
            <textarea
              value={signing.name}
              rows={1}
              onChange={(e) => update((s) => renameSigning(s, e.target.value.replace(/\s*\n\s*/g, " ")))}
              onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
              style={{ fieldSizing: "content" } as React.CSSProperties}
              className="block w-full resize-none overflow-hidden border-0 border-b border-transparent bg-transparent px-0 font-display text-[28px] leading-tight outline-none hover:border-rule focus:border-ink sm:text-[44px]"
              data-testid="signing-name"
            />
          </label>
          <button
            type="button"
            className="text-[13px] text-ink underline underline-offset-4"
            onClick={() => {
              const text = chaseList(signing);
              void navigator.clipboard?.writeText(text).then(
                () => setCopied(true),
                () => window.prompt("Copy the chase list", text),
              );
            }}
          >
            {copied ? "Chase list copied" : "Copy chase list"}
          </button>
        </div>
        <div className="flex flex-wrap gap-x-10 gap-y-5 border-y border-rule py-5">
          <Meter label="Countersigned pages" done={p.signedDone} total={p.signedTotal} testId="meter-pages" />
          <Meter label="Stamp papers" done={p.stampDone} total={p.stampTotal} testId="meter-stamps" />
          <Meter label="Executed copies ready" done={p.copiesReady} total={p.copiesTotal} testId="meter-copies" />
        </div>
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-rule" aria-label="Signing">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={tab === t.id ? "page" : undefined}
            onClick={() => setTab(t.id)}
            data-testid={`tab-${t.id}`}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-4 py-3 text-sm",
              tab === t.id ? "border-oxblood font-medium text-ink" : "border-transparent text-stone hover:text-ink",
            )}
          >
            {t.label}
            {t.note ? <span className="ml-2 text-[12px] tabular-nums text-stone">{t.note}</span> : null}
          </button>
        ))}
      </nav>

      {tab === "documents" ? <DocumentsTab onDone={() => setTab("returns")} /> : null}
      {tab === "returns" ? <ReturnsTab flags={flags} onCopies={() => setTab("copies")} /> : null}
      {tab === "copies" ? <CopiesTab flags={flags} /> : null}
    </div>
  );
}
