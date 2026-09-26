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

const STEPS = [
  ["Add the finals", "PDFs of the execution versions. Execute finds the signature pages and who signs each."],
  ["Send out signature pages", "One PDF per party, taken from the final itself."],
  ["Drop in the returns", "Signed pages and stamp papers, as PDFs, scans or JPG photos, as they arrive."],
  ["Download executed copies", "One PDF per party, stamp paper in front, with a closing index."],
] as const;

const LIMITS = [
  "The final must be a PDF. For a scanned final, you mark the signature pages yourself.",
  "Text in scans and photos is read in English. Handwriting isn't read.",
  "“Doesn't read like the final” catches the wrong page or document, not a changed word.",
  "iPhone HEIC photos don't open in Chrome or Edge. Ask for JPG or PDF.",
  "Signings are saved in this browser on this computer only. Clearing this site's data deletes them.",
  "Execute is tested in Chromium, the engine behind Chrome and Edge.",
];

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
    <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:gap-20" data-testid="start" data-ready={saved !== null}>
      <section className="min-w-0 max-w-[680px] space-y-9">
        <h1 className="font-display text-[38px] leading-[1.04] tracking-[-0.02em] sm:text-[54px]">
          An executed copy for every party, assembled on your computer.
        </h1>

        <ol className="grid gap-x-8 gap-y-5 border-y border-ink py-6 sm:grid-cols-2">
          {STEPS.map(([title, note], i) => (
            <li key={title} className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-2">
              <span className="font-display text-[22px] leading-none text-oxblood" aria-hidden="true">
                {i + 1}
              </span>
              <span>
                <span className="block font-medium">{title}</span>
                <span className="block text-[14px] leading-6 text-stone">{note}</span>
              </span>
            </li>
          ))}
        </ol>

        <DropZone
          onFiles={(files) => void onStart(files)}
          accept="application/pdf,.pdf"
          label="Add the finals as PDF"
          className="min-h-[176px]"
          testId="start-drop"
        >
          <span className="font-display text-[24px] leading-tight">Drop the finals here, or choose files</span>
          <span className="text-sm text-stone">PDF only. Add every document in this signing together, or add more later.</span>
          {busy ? (
            <span className="mt-2 text-sm text-ink" role="status">
              {busy}
            </span>
          ) : null}
        </DropZone>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Button variant="secondary" onClick={() => void onSample()} disabled={Boolean(busy)} data-testid="sample">
            Open the sample signing
          </Button>
          <span className="text-sm text-stone">An SHA and an SSA with seven fictional parties, returns already in.</span>
        </div>

        <ul className="grid gap-6 border-t border-rule pt-8 text-sm leading-6 sm:grid-cols-3">
          <li>
            <p className="font-medium text-ink">Your documents stay on this computer</p>
            <p className="text-stone">They are read, sorted and assembled in this browser. Nothing is uploaded, and Agmt's servers never receive them.</p>
          </li>
          <li>
            <p className="font-medium text-ink">Sorted by what the page says</p>
            <p className="text-stone">A scan named scan0003.pdf is matched by its text, not its name. E-stamp certificates are read for the certificate number and whose name they're in.</p>
          </li>
          <li>
            <p className="font-medium text-ink">Checked before you send</p>
            <p className="text-stone">Flags a missing page, a stamp paper in another party's name, one certificate used twice, and a returned page that doesn't read like the final.</p>
          </li>
        </ul>

        <details className="group border-t border-rule pt-5 text-sm">
          <summary className="cursor-pointer list-none font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-oxblood">
            <span className="mr-2 inline-block text-stone transition-transform group-open:rotate-90" aria-hidden="true">›</span>
            What Execute doesn't do
          </summary>
          <ul className="mt-3 max-w-[60ch] list-disc space-y-1.5 pl-5 leading-6 text-stone">
            {LIMITS.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </details>
      </section>

      <aside className="min-w-0 space-y-4 lg:pt-3" aria-labelledby="saved-heading">
        <div className="flex items-baseline justify-between border-b border-ink pb-3">
          <h2 id="saved-heading" className="font-display text-2xl">
            Signings in this browser
          </h2>
          {saved?.length ? <span className="text-[13px] tabular-nums text-stone">{saved.length}</span> : null}
        </div>
        {storageOff ? (
          <p className="border-l-2 border-oxblood pl-3 text-sm leading-6">
            This browser isn't saving signings: it's a private window, or site data is blocked. Download your executed copies before you
            close this tab.
          </p>
        ) : saved === null ? (
          <p className="text-sm text-stone" role="status">
            Loading saved signings…
          </p>
        ) : saved.length === 0 ? (
          <p className="text-sm leading-6 text-stone">
            Signings you start are saved here, in this browser only, so returns can arrive over days. Clearing this site's data deletes
            them.
          </p>
        ) : (
          <ul className="divide-y divide-rule">
            {saved.map((s) => {
              const p = progress(s, signingFlags(s));
              return (
                <li key={s.id} className="py-4">
                  {confirm === s.id ? (
                    <div className="space-y-2 text-[13px]" role="group" aria-label={`Delete ${s.name}?`}>
                      <p>
                        Delete <span className="font-medium">{s.name}</span> from this browser?
                      </p>
                      <span className="flex gap-4">
                        <button type="button" autoFocus className="font-medium text-oxblood underline underline-offset-4" onClick={() => void onDelete(s).then(() => setConfirm(null))}>
                          Delete signing
                        </button>
                        <button type="button" className="text-stone hover:text-ink" onClick={() => setConfirm(null)}>
                          Keep
                        </button>
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-4">
                      <button type="button" className="min-w-0 text-left" onClick={() => onOpen(s)}>
                        <span className="block font-display text-[19px] leading-snug underline-offset-4 hover:underline">{s.name}</span>
                        <span className="mt-0.5 block text-[13px] tabular-nums text-stone">
                          {s.documents.length} document{s.documents.length === 1 ? "" : "s"} · {p.signedDone} of {p.signedTotal} signed pages ·{" "}
                          {p.copiesReady} of {p.copiesTotal} copies ready · {when(s.updatedAt)}
                        </span>
                      </button>
                      <button type="button" className="shrink-0 text-[13px] text-stone hover:text-ink" onClick={() => setConfirm(s.id)} aria-label={`Delete ${s.name}`}>
                        Delete
                      </button>
                    </div>
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
