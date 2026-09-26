import { useState } from "react";
import type { SigningDocument } from "@/lib/execute/model";
import {
  addPartyToPage, partyName, removeDocument, removePartyFromPage, renameParty, setDocumentTitle, sigPageIndices,
  toggleSignaturePage,
} from "@/lib/execute/signing";
import { signingPartiesOf } from "@/lib/execute/classify";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useExecute } from "./execute-app";
import { DropZone } from "./drop-zone";
import { useThumbnail } from "./thumbs";

function PageThumb({ doc, index, width, className }: { doc: SigningDocument; index: number; width: number; className?: string }) {
  const { getBytes } = useExecute();
  const url = useThumbnail(doc.fileId, "pdf", index + 1, width, getBytes);
  return url ? (
    <img src={url} alt="" className={cn("block w-full bg-white", className)} />
  ) : (
    <span className={cn("thumb-loading block aspect-[1/1.414] w-full", className)} aria-hidden="true" />
  );
}

function AddParty({ doc, page }: { doc: SigningDocument; page: number }) {
  const { signing, update } = useExecute();
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const others = signing.parties.filter((p) => !(doc.sigPages[page] ?? []).includes(p.id));
  if (!open) {
    return (
      <button type="button" className="text-[13px] text-stone underline-offset-4 hover:text-ink hover:underline" onClick={() => setOpen(true)}>
        + Add a party to this page
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          update((s) => addPartyToPage(s, doc.id, page, name));
          setName("");
          setOpen(false);
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Party name"
          aria-label={`Add a party to page ${page + 1}`}
          autoFocus
          className="h-9 w-48 border border-rule-strong bg-paper px-2 text-sm outline-none focus:border-ink"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={!name.trim()}>
          Add party
        </Button>
      </form>
      {others.length ? (
        <select
          value=""
          aria-label={`Add a party from elsewhere in this signing to page ${page + 1}`}
          className="h-9 max-w-full border border-rule-strong bg-paper px-2 text-sm"
          onChange={(e) => {
            const party = signing.parties.find((p) => p.id === e.target.value);
            if (party) update((s) => addPartyToPage(s, doc.id, page, party.name));
            setOpen(false);
          }}
        >
          <option value="">Or choose a party in this signing</option>
          {others.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}

function DocumentSetup({ doc }: { doc: SigningDocument }) {
  const { signing, update, downloadPacks, downloadPack } = useExecute();
  const [removing, setRemoving] = useState(false);
  const pages = sigPageIndices(doc);
  const signers = signingPartiesOf(doc);
  const scanned = doc.pages.every((p) => p.text.trim().length < 20);

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <label className="min-w-0 flex-1 space-y-1">
          <span className="text-[11px] uppercase tracking-[0.14em] text-stone">Short name, used in file names</span>
          <input
            value={doc.title}
            onChange={(e) => update((s) => setDocumentTitle(s, doc.id, e.target.value))}
            className="block w-full max-w-xl border-0 border-b border-rule-strong bg-transparent py-1 font-display text-2xl outline-none focus:border-ink"
          />
          <span className="block text-[13px] text-stone">
            {doc.fileName} · {doc.pageCount} pages
          </span>
        </label>
        {removing ? (
          <span className="flex flex-wrap items-center gap-3 text-[13px]" role="group" aria-label="Confirm removal">
            Remove {doc.title} and its returns from this signing?
            <button type="button" autoFocus className="font-medium text-oxblood underline underline-offset-4" onClick={() => update((s) => removeDocument(s, doc.id))}>
              Remove document
            </button>
            <button type="button" className="text-stone" onClick={() => setRemoving(false)}>
              Keep
            </button>
          </span>
        ) : (
          <button type="button" className="text-[13px] text-stone hover:text-ink" onClick={() => setRemoving(true)}>
            Remove document
          </button>
        )}
      </div>

      <section className="space-y-3" aria-labelledby={`pages-${doc.id}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 id={`pages-${doc.id}`} className="font-display text-xl">
            Signature pages
          </h3>
          <p className="text-[13px] text-stone">
            {scanned
              ? "This PDF has no text layer, so signature pages can't be found. Select each signature page below."
              : pages.length
                ? `${pages.length} signature page${pages.length === 1 ? "" : "s"} found. Select a page to add or remove it.`
                : "No signature pages found. Select each signature page below."}
          </p>
        </div>
        <div
          className="grid max-h-[360px] grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-3 overflow-y-auto bg-paper-sunk p-3 sm:p-4"
          role="group"
          aria-label={`Pages of ${doc.title}`}
        >
          {Array.from({ length: doc.pageCount }, (_, i) => {
            const on = Boolean(doc.sigPages[i]);
            return (
              <button
                key={i}
                type="button"
                aria-pressed={on}
                aria-label={`Page ${i + 1}${on ? ", signature page" : ""}`}
                data-testid={`page-${doc.title}-${i + 1}`}
                onClick={() => update((s) => toggleSignaturePage(s, doc.id, i))}
                className={cn(
                  "relative border bg-white p-0 shadow-[0_1px_2px_rgba(28,25,23,0.12)] transition-transform hover:-translate-y-0.5",
                  on ? "border-oxblood outline outline-2 outline-oxblood" : "border-rule",
                )}
              >
                <PageThumb doc={doc} index={i} width={140} />
                <span className="absolute bottom-1 right-1 bg-paper/95 px-1 text-[10px] tabular-nums">{i + 1}</span>
                {on ? <span className="absolute left-1 top-1 bg-oxblood px-1 text-[9px] uppercase tracking-[0.08em] text-paper">Sig. page</span> : null}
              </button>
            );
          })}
        </div>
      </section>

      {pages.length ? (
        <section className="space-y-4" aria-label="Who signs each page">
          <ul className="divide-y divide-rule border-y border-rule">
            {pages.map((page) => (
              <li key={page} className="grid gap-5 py-5 sm:grid-cols-[120px_minmax(0,1fr)]" data-testid={`sig-${doc.title}-${page + 1}`}>
                <div className="w-[96px] border border-rule sm:w-[120px]">
                  <PageThumb doc={doc} index={page} width={240} />
                </div>
                <div className="space-y-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-stone">Page {page + 1} · signed by</p>
                  <ul className="space-y-2">
                    {doc.sigPages[page].map((id) => (
                      <li key={id} className="flex flex-wrap items-center gap-3">
                        <input
                          value={partyName(signing, id)}
                          onChange={(e) => update((s) => renameParty(s, id, e.target.value))}
                          aria-label={`Party name on page ${page + 1}`}
                          className="h-10 w-full max-w-md border border-rule-strong bg-paper px-3 text-[15px] outline-none focus:border-ink"
                        />
                        <button
                          type="button"
                          className="text-[13px] underline underline-offset-4 hover:text-oxblood"
                          aria-label={`Download ${partyName(signing, id)}'s signature pages for ${doc.title}`}
                          onClick={() => void downloadPack(doc.id, id)}
                        >
                          Download
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${partyName(signing, id)} from page ${page + 1}`}
                          className="text-[13px] text-stone hover:text-oxblood"
                          onClick={() => update((s) => removePartyFromPage(s, doc.id, page, id))}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                  <AddParty doc={doc} page={page} />
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-4 bg-paper-sunk px-5 py-4">
            <div>
              <p className="font-medium">Send out signature pages</p>
              <p className="text-[13px] text-stone">One PDF per party, taken from the final itself, so the pages match it exactly.</p>
            </div>
            <Button variant="secondary" onClick={() => void downloadPacks(doc.id)} data-testid="download-packs">
              Download signature pages for {signers.length} {signers.length === 1 ? "party" : "parties"} (.zip)
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function DocumentsTab({ onDone }: { onDone: () => void }) {
  const { signing, addDocuments, busy } = useExecute();
  const [selected, setSelected] = useState<string | null>(signing.documents[signing.documents.length - 1]?.id ?? null);
  const doc = signing.documents.find((d) => d.id === selected) ?? signing.documents[0];
  const ready = signing.documents.length > 0 && signing.documents.every((d) => Object.keys(d.sigPages).length > 0);

  return (
    <div className="grid gap-10 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <ul className="space-y-1" aria-label="Documents in this signing">
          {signing.documents.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => setSelected(d.id)}
                aria-current={doc?.id === d.id ? "true" : undefined}
                className={cn(
                  "w-full border-l-2 px-3 py-2 text-left text-sm",
                  doc?.id === d.id ? "border-oxblood bg-paper-sunk font-medium" : "border-transparent text-stone hover:text-ink",
                )}
              >
                <span className="block truncate">{d.title || "Untitled document"}</span>
                <span className="block text-[12px] font-normal text-stone">
                  {Object.keys(d.sigPages).length} signature page{Object.keys(d.sigPages).length === 1 ? "" : "s"} · {signingPartiesOf(d).length} parties
                </span>
              </button>
            </li>
          ))}
        </ul>
        <DropZone
          onFiles={(files) => void addDocuments(files).then((id) => id && setSelected(id))}
          accept="application/pdf,.pdf"
          label="Add another document to this signing"
          className="min-h-[96px] text-sm"
          testId="add-document"
        >
          <span className="font-medium">+ Add a document</span>
          <span className="text-[12px] text-stone">{busy ?? "Another agreement in this signing"}</span>
        </DropZone>
        {ready ? (
          <Button className="w-full" onClick={onDone} data-testid="to-returns">
            Continue to returns
          </Button>
        ) : null}
      </aside>
      {doc ? <DocumentSetup key={doc.id} doc={doc} /> : <p className="text-stone">Add a final as PDF to begin.</p>}
    </div>
  );
}
