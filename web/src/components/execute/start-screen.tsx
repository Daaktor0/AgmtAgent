import { useState } from "react";
import type { Signing } from "@/lib/execute/model";
import { progress, signingFlags } from "@/lib/execute/checks";
import { Button } from "@/components/ui/button";
import { DropZone } from "./drop-zone";

function when(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? `today, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

export function StartScreen({
  saved,
  busy,
  storageOff,
  onStart,
  onSample,
  onOpen,
  onDelete,
}: {
  saved: Signing[] | null;
  busy: string | null;
  storageOff: boolean;
  onStart: (files: File[], name?: string) => Promise<void>;
  onSample: () => Promise<void>;
  onOpen: (s: Signing) => void;
  onDelete: (s: Signing) => Promise<void>;
}) {
  const [confirm, setConfirm] = useState<string | null>(null);

  return (
    <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:gap-20" data-testid="start" data-ready={saved !== null}>
      <section className="max-w-[640px] space-y-8">
        <p className="text-[11px] uppercase tracking-[0.16em] text-stone">Executed copies</p>
        <h1 className="font-display text-[40px] leading-[1.05] sm:text-[56px]">
          Every executed copy, assembled on your computer.
        </h1>
        <p className="max-w-[560px] text-[17px] leading-8 text-ink/80">
          Add the final agreement. Send each party its signature page. Drop in the countersigned pages and stamp papers as
          they arrive, as PDFs or phone photos. Agmt sorts them, checks them and builds a complete copy for every party,
          each with its own stamp paper in front.
        </p>

        <DropZone
          onFiles={(files) => void onStart(files)}
          accept="application/pdf,.pdf"
          label="Add the final agreement as PDF"
          className="min-h-[190px]"
          testId="start-drop"
        >
          <span className="font-display text-2xl">Drop the final agreement here</span>
          <span className="text-sm text-stone">PDF of the agreed version. Several documents for one signing? Add them together.</span>
          {busy ? (
            <span className="mt-2 text-sm text-ink" role="status">
              {busy}
            </span>
          ) : null}
        </DropZone>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Button variant="secondary" onClick={() => void onSample()} disabled={Boolean(busy)} data-testid="sample">
            Try a sample signing
          </Button>
          <span className="text-sm text-stone">Two agreements, seven parties, made-up names.</span>
        </div>

        <ul className="grid gap-5 border-t border-rule pt-8 text-sm leading-6 sm:grid-cols-3">
          <li>
            <p className="font-medium text-ink">Nothing is uploaded</p>
            <p className="text-stone">Documents are read, sorted and assembled in this browser. Agmt's servers never receive them.</p>
          </li>
          <li>
            <p className="font-medium text-ink">Sorted by what they say</p>
            <p className="text-stone">A scan called scan0003.pdf still lands on the right party's page, and stamp papers go in the right copy.</p>
          </li>
          <li>
            <p className="font-medium text-ink">Checked before you send</p>
            <p className="text-stone">Missing pages, a stamp paper in the wrong party's name, the same certificate used twice.</p>
          </li>
        </ul>
      </section>

      <aside className="space-y-4 lg:pt-10" aria-labelledby="saved-heading">
        <div className="flex items-baseline justify-between border-b border-ink pb-3">
          <h2 id="saved-heading" className="font-display text-2xl">
            Signings on this computer
          </h2>
          {saved?.length ? <span className="text-[13px] text-stone">{saved.length}</span> : null}
        </div>
        {storageOff ? (
          <p className="text-sm leading-6 text-oxblood">
            This browser is not keeping work between visits (private window or blocked site data). Finish a signing before
            closing the tab.
          </p>
        ) : saved === null ? (
          <p className="text-sm text-stone">Looking…</p>
        ) : saved.length === 0 ? (
          <p className="text-sm leading-6 text-stone">
            Signings you start are kept here, in this browser only, so returns can arrive over days. Delete one at any time.
          </p>
        ) : (
          <ul className="divide-y divide-rule">
            {saved.map((s) => {
              const p = progress(s, signingFlags(s));
              return (
                <li key={s.id} className="flex items-center justify-between gap-4 py-4">
                  <button type="button" className="min-w-0 text-left" onClick={() => onOpen(s)}>
                    <span className="block truncate font-medium underline-offset-4 hover:underline">{s.name}</span>
                    <span className="block text-[13px] text-stone">
                      {s.documents.length} document{s.documents.length === 1 ? "" : "s"} · {p.signedDone} of {p.signedTotal} pages back ·
                      {" "}
                      {when(s.updatedAt)}
                    </span>
                  </button>
                  {confirm === s.id ? (
                    <span className="flex shrink-0 items-center gap-3 text-[13px]">
                      <button type="button" className="text-oxblood underline underline-offset-4" onClick={() => void onDelete(s).then(() => setConfirm(null))}>
                        Delete
                      </button>
                      <button type="button" className="text-stone" onClick={() => setConfirm(null)}>
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="shrink-0 text-[13px] text-stone hover:text-ink" onClick={() => setConfirm(s.id)} aria-label={`Delete ${s.name}`}>
                      Delete
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </div>
  );
}
