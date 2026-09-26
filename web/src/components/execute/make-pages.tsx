import { useEffect, useRef, useState } from "react";
import type { MakeParty, MakeSetup, MakeTemplate, SigningDocument } from "@/lib/execute/model";
import { newId } from "@/lib/execute/model";
import { PARTY_PLACEHOLDER, PRESET_FORMATS } from "@/lib/execute/generate";
import { partyKind } from "@/lib/execute/parties";
import { saveMakeSetup, setupKey } from "@/lib/execute/signing";
import type { FoundParties } from "@/lib/execute/browser/make";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useExecute } from "./execute-app";
import { DropZone } from "./drop-zone";
import { useViewPages } from "./page-viewer";
import { useThumbnail } from "./thumbs";

export type Source = "agreement" | "parties" | "template";

const FIELD = "h-10 border border-rule bg-paper px-3 text-[15px] outline-none focus:border-ink";

function freshSetup(found: FoundParties | null, from: "parties" | "template"): MakeSetup {
  return {
    from,
    parties: (found?.parties ?? []).map((p) => ({ id: newId("mkp"), name: p.name, formatId: partyKind(p.name), templateId: null, group: p.group })),
    formats: Object.values(PRESET_FORMATS).map((f) => ({ ...f })),
    templates: [],
    footer: found?.footer ?? "",
    useFooter: true,
  };
}

/** The choice at the top of a document: where its signature pages come from. */
export function SourceSwitch({ value, found, onChange }: { value: Source; found: number; onChange: (s: Source) => void }) {
  const options: { id: Source; label: string; note: string }[] = [
    { id: "agreement", label: "In this agreement", note: found ? `${found} found` : "None found" },
    { id: "parties", label: "Make from the parties", note: "From the parties clause" },
    { id: "template", label: "Use my template", note: "Your PDF, name changed" },
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Where the signature pages come from">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          data-testid={`source-${o.id}`}
          onClick={() => onChange(o.id)}
          className={cn(
            "border px-4 py-3 text-left transition-colors",
            value === o.id ? "border-ink bg-ink text-paper" : "border-rule bg-paper hover:border-ink",
          )}
        >
          <span className="block text-[15px] font-medium">{o.label}</span>
          <span className={cn("block text-[12px]", value === o.id ? "text-paper/70" : "text-stone")}>{o.note}</span>
        </button>
      ))}
    </div>
  );
}

export const SOURCE_NOTE: Record<Source, string> = {
  agreement: "Use the unsigned signature pages already in this PDF. Signed pages replace them in place.",
  parties: "Execute makes one page per party. Signed pages are added at the end of each executed copy, after the schedules.",
  template: "Upload your own signature page as a PDF. Execute makes one per party, changing only the name. Signed pages are added at the end, after the schedules.",
};

function MadeThumb({ fileId, index, label }: { fileId: string; index: number; label: string }) {
  const { getBytes } = useExecute();
  const view = useViewPages();
  const url = useThumbnail(fileId, "pdf", index + 1, 180, getBytes);
  return (
    <button
      type="button"
      onClick={() => view({ title: label, pages: [{ fileId, kind: "pdf", page: index + 1, label }] })}
      className="block w-full border border-rule bg-white text-left shadow-[0_1px_2px_rgba(28,25,23,0.12)] transition-transform hover:-translate-y-0.5"
      aria-label={`View ${label}`}
    >
      {url ? <img src={url} alt="" className="block w-full" /> : <span className="block aspect-[1/1.414] w-full" />}
    </button>
  );
}

function TemplateCard({ doc, t }: { doc: SigningDocument; t: MakeTemplate }) {
  const { getBytes, setTemplateSample, removeTemplate } = useExecute();
  const url = useThumbnail(t.fileId, "pdf", t.pageIndex + 1, 220, getBytes);
  const [sample, setSample] = useState(t.sample);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return (
    <li className="grid gap-5 border-t border-rule py-5 sm:grid-cols-[110px_minmax(0,1fr)]" data-testid="template-card">
      <div className="w-[110px] border border-rule bg-white">{url ? <img src={url} alt="" className="block w-full" /> : <span className="block aspect-[1/1.414]" />}</div>
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="truncate font-medium">{t.fileName}</p>
          <button type="button" className="text-[13px] text-stone hover:text-oxblood" onClick={() => removeTemplate(doc.id, t.id)}>
            Remove
          </button>
        </div>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">The name printed on this page</span>
          <input
            value={sample}
            onChange={(e) => {
              const v = e.target.value;
              setSample(v);
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(() => void setTemplateSample(doc.id, t.id, v), 350);
            }}
            aria-label={`The name printed on ${t.fileName}`}
            data-testid="template-sample"
            className={cn(FIELD, "w-full max-w-lg")}
          />
        </label>
        <p className={cn("text-[13px] leading-5", t.slots.length ? "text-stone" : "text-oxblood")} data-testid="template-status">
          {t.slots.length
            ? `Found ${t.slots.length === 1 ? "once" : `${t.slots.length} times`}. On each page it is replaced by the party's name, in the same place and style. Everything else stays exactly as it is.`
            : "Not found as a line of its own on this page. Type the name exactly as it is printed in the signature block."}
        </p>
        {t.residue ? (
          <p className="border-l-2 border-oxblood pl-3 text-[13px] leading-5">
            This PDF keeps its text in a way Execute can't edit, so the sample name is covered on each page but can still be found by copying the
            text. Export the page from Word again (File → Save as PDF) and add it instead.
          </p>
        ) : null}
      </div>
    </li>
  );
}

function PasteList({ onAdd, onClose }: { onAdd: (names: string[]) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const names = text
    .split(/\r?\n/)
    .map((line) => line.split("\t").map((c) => c.trim()).find((c) => c && !/^\(?\d{1,3}[.)]?$/.test(c)) ?? "")
    .map((n) => n.replace(/^\d{1,3}[.)]\s+/, "").trim())
    .filter(Boolean);
  return (
    <div className="space-y-3 border border-rule bg-paper p-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Paste names, one per line</span>
        <span className="block text-[13px] text-stone">A column copied from Excel or a table in Word works too; serial numbers are skipped.</span>
        <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} autoFocus className="block w-full border border-rule bg-paper p-3 text-sm outline-none focus:border-ink" />
      </label>
      <div className="flex items-center gap-3">
        <Button size="sm" disabled={!names.length} onClick={() => onAdd(names)}>
          Add {names.length || ""} {names.length === 1 ? "party" : "parties"}
        </Button>
        <button type="button" className="text-sm text-stone hover:text-ink" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Making signature pages for an agreement: who signs, how each block reads, then the pages. */
export function MakePanel({ doc, from }: { doc: SigningDocument; from: "parties" | "template" }) {
  const { update, readParties, addTemplate, makePages, downloadPacks, busy } = useExecute();
  const [note, setNote] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [reading, setReading] = useState(false);
  const [openFormat, setOpenFormat] = useState<string | null>(null);
  const setup = doc.setup?.from === from ? doc.setup : null;

  const save = (fn: (s: MakeSetup) => MakeSetup) => update((sg) => {
    const current = sg.documents.find((d) => d.id === doc.id)?.setup;
    return current ? saveMakeSetup(sg, doc.id, fn(current)) : sg;
  });

  async function read(replace: boolean) {
    setReading(true);
    const found = await readParties(doc.id);
    setReading(false);
    const named = found?.parties.filter((p) => !p.group).length ?? 0;
    const grouped = found?.parties.filter((p) => p.group).length ?? 0;
    setNote(
      !found || found.empty
        ? "No parties clause was found in this agreement. Add the parties below, or paste a list."
        : `Found ${named} ${named === 1 ? "party" : "parties"} in the parties clause${grouped ? ` and ${grouped} more in ${[...new Set(found.parties.filter((p) => p.group).map((p) => p.group!.split(" · ")[1]))].join(", ")}` : ""}. Check every name before making pages.${found.unreadGroups.length ? ` Couldn't read the names in ${found.unreadGroups.map((g) => g.split(" · ")[1]).join(", ")}: add them, or paste the list.` : ""}`,
    );
    update((sg) => {
      const current = sg.documents.find((d) => d.id === doc.id)?.setup;
      const fresh = freshSetup(found, from);
      const next = current && !replace ? { ...current, from } : current ? { ...current, from, parties: fresh.parties, footer: fresh.footer } : fresh;
      return saveMakeSetup(sg, doc.id, next);
    });
  }

  // First visit: read the parties; switching between the two ways keeps them.
  useEffect(() => {
    if (setup) return;
    if (doc.setup) {
      update((sg) => saveMakeSetup(sg, doc.id, { ...doc.setup!, from }));
      return;
    }
    void read(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, from]);

  if (!setup) {
    return <p className="text-sm text-stone" role="status">{reading ? "Reading the parties clause…" : "Getting ready…"}</p>;
  }

  const parties = setup.parties;
  const named = parties.filter((p) => p.name.trim());
  const groups = [...new Set(parties.map((p) => p.group))];
  const usedFormats = [...new Set(parties.map((p) => p.formatId))];
  const made = doc.made?.from === from ? doc.made : null;
  const stale = made && made.key !== setupKey(setup);
  const setParty = (id: string, patch: Partial<MakeParty>) => save((s) => ({ ...s, parties: s.parties.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  const ready = named.length > 0 && (from === "parties" || (setup.templates.length > 0 && setup.templates.every((t) => t.slots.length > 0)));

  return (
    <div className="space-y-10" data-testid={`make-${from}`}>
      {/* Who signs */}
      <section className="space-y-4" aria-labelledby={`who-${doc.id}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 id={`who-${doc.id}`} className="font-display text-xl">
            Who signs
          </h3>
          <button type="button" className="text-[13px] text-stone underline-offset-4 hover:text-ink hover:underline" onClick={() => void read(true)}>
            Read the agreement again
          </button>
        </div>
        {note ? <p className="text-sm leading-6 text-stone" data-testid="parties-note">{note}</p> : null}
        <div className="border-y border-rule">
          {groups.map((group) => (
            <div key={group ?? "named"}>
              {group ? <p className="bg-paper-sunk px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-stone">{group}</p> : null}
              <ul className="divide-y divide-rule">
                {parties
                  .filter((p) => p.group === group)
                  .map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-3 px-1 py-2.5" data-testid="make-party">
                      <span className="w-6 text-right text-[12px] tabular-nums text-stone">{parties.indexOf(p) + 1}</span>
                      <input
                        value={p.name}
                        onChange={(e) => setParty(p.id, { name: e.target.value })}
                        aria-label={`Party ${parties.indexOf(p) + 1}`}
                        className={cn(FIELD, "min-w-0 flex-1 basis-60")}
                      />
                      {from === "parties" ? (
                        <select value={p.formatId} onChange={(e) => setParty(p.id, { formatId: e.target.value })} aria-label={`Signature block for ${p.name}`} className="h-10 border border-rule bg-paper px-2 text-sm">
                          {setup.formats.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                      ) : setup.templates.length > 1 ? (
                        <select
                          value={p.templateId ?? setup.templates[0].id}
                          onChange={(e) => setParty(p.id, { templateId: e.target.value })}
                          aria-label={`Template for ${p.name}`}
                          className="h-10 max-w-[200px] border border-rule bg-paper px-2 text-sm"
                        >
                          {setup.templates.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      <button
                        type="button"
                        aria-label={`Remove ${p.name || "this party"}`}
                        className="px-2 text-[13px] text-stone hover:text-oxblood"
                        onClick={() => save((s) => ({ ...s, parties: s.parties.filter((x) => x.id !== p.id) }))}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          {!parties.length ? <p className="px-3 py-4 text-sm text-stone">No parties yet.</p> : null}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <button
            type="button"
            className="text-[13px] text-ink underline underline-offset-4"
            data-testid="add-make-party"
            onClick={() => save((s) => ({ ...s, parties: [...s.parties, { id: newId("mkp"), name: "", formatId: "company", templateId: null, group: null }] }))}
          >
            + Add a party
          </button>
          <button type="button" className="text-[13px] text-ink underline underline-offset-4" onClick={() => setPasting(true)}>
            Paste a list
          </button>
        </div>
        {pasting ? (
          <PasteList
            onClose={() => setPasting(false)}
            onAdd={(names) => {
              save((s) => ({ ...s, parties: [...s.parties, ...names.map((name) => ({ id: newId("mkp"), name, formatId: partyKind(name), templateId: null, group: null }))] }));
              setPasting(false);
            }}
          />
        ) : null}
      </section>

      {/* How each page reads */}
      {from === "parties" ? (
        <section className="space-y-4" aria-label="Signature block wording">
          <h3 className="font-display text-xl">How each block reads</h3>
          <ul className="divide-y divide-rule border-y border-rule">
            {setup.formats
              .filter((f) => usedFormats.includes(f.id))
              .map((f) => (
                <li key={f.id} className="py-3">
                  <button type="button" className="flex w-full items-baseline justify-between gap-4 text-left" aria-expanded={openFormat === f.id} onClick={() => setOpenFormat(openFormat === f.id ? null : f.id)}>
                    <span className="font-medium">{f.label}</span>
                    <span className="truncate text-[13px] text-stone">{f.body.split("\n")[0]}</span>
                  </button>
                  {openFormat === f.id ? (
                    <label className="mt-3 block space-y-1.5">
                      <textarea
                        rows={Math.max(6, f.body.split("\n").length + 1)}
                        value={f.body}
                        onChange={(e) => save((s) => ({ ...s, formats: s.formats.map((x) => (x.id === f.id ? { ...x, body: e.target.value } : x)) }))}
                        aria-label={`Wording for ${f.label}`}
                        className="block w-full max-w-xl border border-rule bg-paper p-3 font-mono text-[13px] leading-6 outline-none focus:border-ink"
                      />
                      <span className="block text-[13px] text-stone">
                        {PARTY_PLACEHOLDER} becomes each party's name. A line of underscores becomes the line to sign on.
                      </span>
                    </label>
                  ) : null}
                </li>
              ))}
          </ul>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={setup.useFooter} onChange={(e) => save((s) => ({ ...s, useFooter: e.target.checked }))} className="accent-[var(--color-oxblood)]" />
              Footer on every page
            </label>
            {setup.useFooter ? (
              <>
                <textarea
                  rows={3}
                  value={setup.footer}
                  onChange={(e) => save((s) => ({ ...s, footer: e.target.value }))}
                  aria-label="Footer"
                  data-testid="make-footer"
                  className="block w-full border border-rule bg-paper p-3 text-sm italic leading-6 outline-none focus:border-ink"
                />
                <p className="text-[13px] text-stone">No date, so the pages stay good if the execution date moves.</p>
              </>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="space-y-4" aria-label="Your signature page template">
          <h3 className="font-display text-xl">Your signature page</h3>
          <p className="text-sm leading-6 text-stone">
            One filled-in signature page, exported from Word as PDF. Add a second one if, say, individuals sign on a different block from
            companies, and choose which each party uses.
          </p>
          {setup.templates.length ? (
            <ul className="border-b border-rule">
              {setup.templates.map((t) => (
                <TemplateCard key={t.id} doc={doc} t={t} />
              ))}
            </ul>
          ) : null}
          <DropZone onFiles={(files) => files[0] && void addTemplate(doc.id, files[0])} accept="application/pdf,.pdf" multiple={false} label="Add your signature page template (PDF)" className="min-h-[110px]" testId="add-template">
            <span className="font-medium">{setup.templates.length ? "+ Add another template" : "Add your signature page (PDF)"}</span>
            <span className="text-[12px] text-stone">Drop it here, or click to choose</span>
          </DropZone>
        </section>
      )}

      {/* The pages */}
      <section className="space-y-4" aria-label="The signature pages">
        <div className="flex flex-wrap items-center justify-between gap-4 bg-paper-sunk px-5 py-4">
          <div>
            <p className="font-medium">
              {made ? (stale ? "You've changed something since these pages were made." : `${made.pages.length} signature pages made`) : "Make the pages"}
            </p>
            <p className="text-[13px] text-stone">
              {made && !stale
                ? "Signed pages go at the end of each executed copy, after the schedules. No Execute or Agmt name or mark appears on any page."
                : `One page per party, ${named.length} in all. You can change anything and make them again.`}
            </p>
          </div>
          <Button onClick={() => void makePages(doc.id)} disabled={!ready || Boolean(busy)} variant={made && !stale ? "secondary" : "primary"} data-testid="make-pages">
            {made ? (stale ? "Make them again" : "Make again") : `Make ${named.length} signature page${named.length === 1 ? "" : "s"}`}
          </Button>
        </div>
        {made ? (
          <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-4" data-testid="made-pages">
              {made.pages.map((p, i) => (
                <figure key={`${made.fileId}-${i}`} className="space-y-1.5">
                  <MadeThumb fileId={made.fileId} index={i} label={p.suggestedParties[0] ?? `Signature page ${i + 1}`} />
                  <figcaption className="truncate text-[12px] text-stone">{p.suggestedParties[0]}</figcaption>
                </figure>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-rule pt-4">
              <p className="text-[13px] text-stone">One PDF per party, named after the party, ready to send.</p>
              <Button variant="secondary" onClick={() => void downloadPacks(doc.id)} data-testid="download-packs">
                Download {made.pages.length} signature page{made.pages.length === 1 ? "" : "s"} (.zip)
              </Button>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
