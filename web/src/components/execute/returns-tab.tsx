import { useEffect, useMemo, useState } from "react";
import type { Flag } from "@/lib/execute/checks";
import { cellFor } from "@/lib/execute/checks";
import { signingPartiesOf } from "@/lib/execute/classify";
import type { ReturnFile, ReturnRole, SigningDocument } from "@/lib/execute/model";
import {
  confirmAllAutoPlaced, confirmReturn, pagesOf, partyName, placeReturn, rotateReturn, setCopyType, toggleSignedBy,
  unplaced,
} from "@/lib/execute/signing";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useExecute } from "./execute-app";
import { DropZone } from "./drop-zone";
import { Mark, STATE_LABEL, StateText } from "./marks";
import { useThumbnail } from "./thumbs";
import { useViewPages, type ViewedPage } from "./page-viewer";

const ACCEPT = "application/pdf,.pdf,image/*";

export function FileThumb({
  file,
  width = 120,
  className,
  compare,
}: {
  file: ReturnFile;
  width?: number;
  className?: string;
  /** Pages of the final document to show beside it when enlarged. */
  compare?: ViewedPage[];
}) {
  const { getBytes } = useExecute();
  const view = useViewPages();
  const url = useThumbnail(file.id, file.kind, 1, width * 2, getBytes);
  const pages: ViewedPage[] = [
    ...Array.from({ length: Math.min(file.pageCount, 3) }, (_, i) => ({
      fileId: file.id,
      kind: file.kind,
      page: i + 1,
      label: file.pageCount > 1 ? `${file.fileName}, page ${i + 1}` : file.fileName,
      rotation: file.rotation,
    })),
    ...(compare ?? []),
  ];
  return (
    <button
      type="button"
      onClick={() => view({ pages, title: compare?.length ? "Returned page beside the final" : file.fileName })}
      aria-label={`View ${file.fileName} large`}
      className={cn("block cursor-zoom-in overflow-hidden border border-rule bg-white p-0 hover:border-ink", className)}
      style={{ width }}
    >
      {url ? (
        <img src={url} alt="" className="block w-full" style={{ transform: `rotate(${file.rotation}deg)` }} />
      ) : (
        <span className="block aspect-[1/1.414] w-full" />
      )}
    </button>
  );
}

function sourceNote(file: ReturnFile): string {
  if (file.textSource === "pending") return "Reading the scan…";
  if (file.textSource === "none") return "No readable text";
  return file.textSource === "ocr" ? "Read from the scan" : "Text in the PDF";
}

/** Place one unsorted file: what it is, which document, whose. */
function TrayItem({ file }: { file: ReturnFile }) {
  const { signing, update, removeReturn } = useExecute();
  const s = file.suggestion;
  const [role, setRole] = useState<ReturnRole | "">(s?.role ?? "");
  const [docId, setDocId] = useState(s?.docId ?? (signing.documents.length === 1 ? signing.documents[0].id : ""));
  const [partyId, setPartyId] = useState(s?.partyIds[0] ?? "");
  const doc = signing.documents.find((d) => d.id === docId);
  const parties = doc ? signingPartiesOf(doc) : signing.parties.map((p) => p.id);
  const can = role && doc && partyId && parties.includes(partyId);

  return (
    <li className="grid gap-4 py-5 sm:grid-cols-[96px_minmax(0,1fr)]" data-testid="tray-item">
      <FileThumb file={file} width={96} />
      <div className="min-w-0 space-y-3">
        <div>
          <p className="truncate font-medium">{file.fileName}</p>
          <p className="text-[13px] text-stone">
            {file.pageCount} page{file.pageCount === 1 ? "" : "s"} · {sourceNote(file)}
            {s?.reason ? ` · ${s.reason}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="What is this file?" value={role} onChange={(e) => setRole(e.target.value as ReturnRole)} className="h-9 border border-rule bg-paper px-2 text-sm">
            <option value="">This is…</option>
            <option value="signed">A countersigned page</option>
            <option value="stamp">A stamp paper</option>
          </select>
          {signing.documents.length > 1 ? (
            <select aria-label="For which document?" value={docId} onChange={(e) => setDocId(e.target.value)} className="h-9 max-w-[220px] border border-rule bg-paper px-2 text-sm">
              <option value="">For…</option>
              {signing.documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          ) : null}
          <select aria-label="From which party?" value={partyId} onChange={(e) => setPartyId(e.target.value)} className="h-9 max-w-[240px] border border-rule bg-paper px-2 text-sm">
            <option value="">From…</option>
            {parties.map((id) => (
              <option key={id} value={id}>
                {partyName(signing, id)}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={!can}
            onClick={() =>
              doc &&
              update((x) =>
                placeReturn(
                  x,
                  file.id,
                  role === "stamp"
                    ? { status: "placed", role: "stamp", docId: doc.id, partyId }
                    : { status: "placed", role: "signed", docId: doc.id, partyIds: [partyId] },
                ),
              )
            }
          >
            Place
          </Button>
          <button type="button" className="px-2 text-[13px] text-stone hover:text-oxblood" onClick={() => removeReturn(file.id)}>
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}

function CellButton({ doc, partyId, flags, onOpen }: { doc: SigningDocument; partyId: string; flags: Flag[]; onOpen: () => void }) {
  const { signing } = useExecute();
  const cell = cellFor(signing, doc, partyId, flags);
  if (cell.signed === "not-needed") {
    return <span className="block px-4 py-3 text-[13px] text-stone/60">Does not sign</span>;
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="cell"
      data-signed={cell.signed}
      data-stamp={cell.stamp}
      className="group block w-full space-y-1.5 px-4 py-3 text-left hover:bg-paper-sunk focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-oxblood"
      aria-label={`${partyName(signing, partyId)}, ${doc.title}: page ${STATE_LABEL[cell.signed]}, stamp paper ${STATE_LABEL[cell.stamp]}`}
    >
      <span className="flex items-center gap-2 text-[13px]">
        <Mark state={cell.signed} />
        <span className={cn(cell.signed === "awaited" ? "text-stone" : cell.signed === "done" ? "text-ink" : "text-oxblood")}>
          Page {cell.signed === "done" ? "" : `· ${STATE_LABEL[cell.signed].toLowerCase()}`}
        </span>
      </span>
      <span className="flex items-center gap-2 text-[13px]">
        <Mark state={cell.stamp} />
        <span className={cn(cell.stamp === "awaited" || cell.stamp === "not-needed" ? "text-stone" : cell.stamp === "done" ? "text-ink" : "text-oxblood")}>
          Stamp {cell.stamp === "done" ? "" : `· ${STATE_LABEL[cell.stamp].toLowerCase()}`}
        </span>
      </span>
    </button>
  );
}

function PlacedFile({ file, doc, partyId, shared }: { file: ReturnFile; doc: SigningDocument; partyId: string; shared: string[] }) {
  const { signing, update, removeReturn } = useExecute();
  const e = file.estamp;
  const signed = file.placement.status === "placed" && file.placement.role === "signed";
  const compare: ViewedPage[] = signed
    ? pagesOf(doc, partyId).map((p) => ({ fileId: doc.fileId, kind: "pdf" as const, page: p + 1, label: `Final: ${doc.title} p. ${p + 1}` }))
    : [];
  return (
    <li className="grid gap-4 py-4 sm:grid-cols-[88px_minmax(0,1fr)]">
      <FileThumb file={file} width={88} compare={compare} />
      <div className="min-w-0 space-y-2 text-[13px]">
        <p className="truncate text-[14px] font-medium">{file.fileName}</p>
        <p className="text-stone">
          {file.pageCount} page{file.pageCount === 1 ? "" : "s"} · {sourceNote(file)}
          {file.rotation ? ` · turned ${file.rotation}°` : ""}
        </p>
        {e ? (
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-0.5">
            {e.certificateNo ? (
              <>
                <dt className="text-stone">Certificate</dt>
                <dd className="tabular-nums">{e.certificateNo}</dd>
              </>
            ) : null}
            {e.purchasedBy ? (
              <>
                <dt className="text-stone">Purchased by</dt>
                <dd>{e.purchasedBy}</dd>
              </>
            ) : null}
            {e.amount ? (
              <>
                <dt className="text-stone">Duty</dt>
                <dd className="tabular-nums">Rs. {e.amount}</dd>
              </>
            ) : null}
          </dl>
        ) : null}
        {shared.length && file.placement.status === "placed" && file.placement.role === "signed" ? (
          <fieldset className="space-y-1">
            <legend className="text-stone">This page also carries the signature of</legend>
            {shared.map((id) => {
              const p = file.placement;
              const checked = p.status === "placed" && p.role === "signed" && p.partyIds.includes(id);
              return (
                <label key={id} className="flex items-center gap-2">
                  <input type="checkbox" checked={checked} onChange={() => update((s) => toggleSignedBy(s, file.id, id))} className="accent-[var(--color-oxblood)]" />
                  {partyName(signing, id)}
                </label>
              );
            })}
          </fieldset>
        ) : null}
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
          {file.autoPlaced ? (
            <button type="button" className="font-medium text-oxblood underline underline-offset-4" onClick={() => update((s) => confirmReturn(s, file.id))}>
              Looks right
            </button>
          ) : null}
          <button type="button" className="underline underline-offset-4" onClick={() => update((s) => rotateReturn(s, file.id))}>
            Turn
          </button>
          <button type="button" className="underline underline-offset-4" onClick={() => update((s) => placeReturn(s, file.id, { status: "unplaced" }))}>
            Not this party's
          </button>
          <button type="button" className="text-stone hover:text-oxblood" onClick={() => removeReturn(file.id)}>
            Remove
          </button>
        </div>
      </div>
      <span className="sr-only">
        {doc.title}, {partyName(signing, partyId)}
      </span>
    </li>
  );
}

function CellPanel({ doc, partyId, flags, onClose }: { doc: SigningDocument; partyId: string; flags: Flag[]; onClose: () => void }) {
  const { signing, update, addReturns } = useExecute();
  const cell = cellFor(signing, doc, partyId, flags);
  const pages = pagesOf(doc, partyId);
  const shared = [...new Set(pages.flatMap((p) => doc.sigPages[p]))].filter((id) => id !== partyId);
  const copy = doc.copies[partyId] ?? "counterpart";

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      // The page viewer sits above this panel and closes first.
      if (e.key === "Escape" && !document.querySelector("[aria-modal='true'][class*='z-[60]']")) onClose();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/25" role="dialog" aria-modal="true" aria-labelledby="cell-title" onClick={onClose}>
      <div className="h-full w-full max-w-[560px] overflow-y-auto bg-paper px-6 py-7 shadow-[-12px_0_32px_rgba(28,25,23,0.15)] sm:px-9" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-stone">{doc.title}</p>
            <h2 id="cell-title" className="mt-1 font-display text-3xl">
              {partyName(signing, partyId)}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-stone hover:text-ink" aria-label="Close">
            ×
          </button>
        </div>

        {cell.flags.length ? (
          <ul className="mt-6 space-y-2">
            {cell.flags.map((f, i) => (
              <li key={i} className="border-l-2 border-oxblood pl-3 text-sm leading-6">
                {f.message}
              </li>
            ))}
          </ul>
        ) : null}

        <section className="mt-8 space-y-3">
          <div className="flex items-center justify-between gap-4 border-b border-ink pb-2">
            <h3 className="font-display text-xl">Countersigned page</h3>
            <StateText state={cell.signed} />
          </div>
          <p className="text-[13px] text-stone">
            Signs on p. {pages.map((p) => p + 1).join(", ")}
            {shared.length ? `, with ${shared.map((id) => partyName(signing, id)).join(", ")}` : ""}.
          </p>
          <ul className="divide-y divide-rule">
            {cell.signedFiles.map((f) => (
              <PlacedFile key={f.id} file={f} doc={doc} partyId={partyId} shared={shared} />
            ))}
          </ul>
          <DropZone
            onFiles={(files) => void addReturns(files, { status: "placed", role: "signed", docId: doc.id, partyIds: [partyId] })}
            accept={ACCEPT}
            label={`Add the countersigned page from ${partyName(signing, partyId)}`}
            className="min-h-[64px] text-sm"
          >
            <span>+ Add their countersigned page</span>
          </DropZone>
        </section>

        <section className="mt-10 space-y-3">
          <div className="flex items-center justify-between gap-4 border-b border-ink pb-2">
            <h3 className="font-display text-xl">Stamp paper</h3>
            <StateText state={cell.stamp} />
          </div>
          <label className="flex flex-wrap items-center gap-3 text-[13px]">
            <span className="text-stone">This party receives</span>
            <select
              value={copy}
              onChange={(e) => update((s) => setCopyType(s, doc.id, partyId, e.target.value as typeof copy))}
              className="h-9 border border-rule bg-paper px-2 text-sm"
            >
              <option value="original">the original</option>
              <option value="counterpart">a counterpart</option>
              <option value="none">no copy</option>
            </select>
          </label>
          {copy !== "none" ? (
            <>
              <ul className="divide-y divide-rule">
                {cell.stampFiles.map((f) => (
                  <PlacedFile key={f.id} file={f} doc={doc} partyId={partyId} shared={[]} />
                ))}
              </ul>
              <DropZone
                onFiles={(files) => void addReturns(files, { status: "placed", role: "stamp", docId: doc.id, partyId })}
                accept={ACCEPT}
                label={`Add the stamp paper for ${partyName(signing, partyId)}'s copy`}
                className="min-h-[64px] text-sm"
              >
                <span>+ Add stamp paper for this copy</span>
              </DropZone>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}

export function ReturnsTab({ flags, onCopies }: { flags: Flag[]; onCopies: () => void }) {
  const { signing, update, addReturns, batch, clearBatch, busy, ocrQueue } = useExecute();
  const [open, setOpen] = useState<{ docId: string; partyId: string } | null>(null);
  const waiting = unplaced(signing);
  const glance = signing.returns.filter((r) => r.autoPlaced && r.placement.status === "placed");
  const parties = signing.parties;
  const openDoc = open ? signing.documents.find((d) => d.id === open.docId) : null;
  const problems = useMemo(() => flags.filter((f) => f.severity === "problem").length, [flags]);

  if (!signing.documents.some((d) => Object.keys(d.sigPages).length)) {
    return <p className="text-stone">Mark the signature pages in Documents first, so returns can be matched to them.</p>;
  }

  return (
    <div className="space-y-10">
      <DropZone onFiles={(files) => void addReturns(files)} accept={ACCEPT} label="Add countersigned pages and stamp papers" className="min-h-[132px]" testId="returns-drop">
        <span className="font-display text-2xl">Drop everything that has come back</span>
        <span className="max-w-lg text-sm text-stone">
          Countersigned pages and stamp papers, as PDFs or photos, all at once. Each is read on this computer and placed with
          its party.
        </span>
        {busy ? <span className="text-sm text-ink">{busy}</span> : null}
      </DropZone>

      {batch ? (
        <div className="flex flex-wrap items-center justify-between gap-4 border-l-2 border-ink bg-paper-sunk px-5 py-4" role="status" data-testid="batch">
          <p className="text-sm">
            <span className="font-medium">
              Sorted {batch.added} file{batch.added === 1 ? "" : "s"}: {batch.placed} placed
            </span>
            {waiting.length ? `, ${waiting.length} need${waiting.length === 1 ? "s" : ""} you` : ""}
            {ocrQueue ? `, ${ocrQueue} scan${ocrQueue === 1 ? "" : "s"} still being read` : ""}.
          </p>
          <button type="button" className="text-[13px] text-stone hover:text-ink" onClick={clearBatch}>
            Dismiss
          </button>
        </div>
      ) : null}

      {waiting.length ? (
        <section aria-labelledby="needs-you" className="space-y-2" data-testid="tray">
          <div className="flex items-baseline justify-between gap-4 border-b border-ink pb-2">
            <h3 id="needs-you" className="font-display text-xl">
              Needs you <span className="text-stone">({waiting.length})</span>
            </h3>
            <p className="text-[13px] text-stone">Couldn't be matched with confidence. Tell Agmt what each one is.</p>
          </div>
          <ul className="divide-y divide-rule">
            {waiting.map((f) => (
              <TrayItem key={f.id} file={f} />
            ))}
          </ul>
        </section>
      ) : null}

      {glance.length ? (
        <div className="flex flex-wrap items-center justify-between gap-4 border border-oxblood/40 px-5 py-3 text-sm">
          <span>
            <Mark state="check" className="mr-2 align-[-1px]" />
            {glance.length} file{glance.length === 1 ? " was" : "s were"} placed by file name only. Open the marked cells to have a
            look.
          </span>
          <button type="button" className="text-[13px] underline underline-offset-4" onClick={() => update(confirmAllAutoPlaced)}>
            They all look right
          </button>
        </div>
      ) : null}

      <section aria-labelledby="grid-heading" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h3 id="grid-heading" className="font-display text-xl">
            Signing checklist
          </h3>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-stone">
            {(["done", "check", "problem", "awaited"] as const).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <Mark state={s} /> {STATE_LABEL[s]}
              </span>
            ))}
          </p>
        </div>
        <div className="overflow-x-auto border border-rule bg-paper">
          <table className="w-full min-w-[520px] border-collapse text-left">
            <thead>
              <tr className="border-b border-ink">
                <th scope="col" className="sticky left-0 z-10 bg-paper px-4 py-3 text-[11px] font-normal uppercase tracking-[0.14em] text-stone">
                  Party
                </th>
                {signing.documents.map((d) => (
                  <th key={d.id} scope="col" className="min-w-[170px] border-l border-rule px-4 py-3 font-display text-base font-normal">
                    {d.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parties.map((p) => (
                <tr key={p.id} className="border-b border-rule last:border-0">
                  <th scope="row" className="sticky left-0 z-10 max-w-[260px] bg-paper px-4 py-3 align-top text-[14px] font-medium">
                    {p.name}
                  </th>
                  {signing.documents.map((d) => (
                    <td key={d.id} className="border-l border-rule p-0 align-top">
                      <CellButton doc={d} partyId={p.id} flags={flags} onOpen={() => setOpen({ docId: d.id, partyId: p.id })} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {problems ? (
          <p className="text-sm text-oxblood">
            {problems} problem{problems === 1 ? "" : "s"} to fix before those copies can be assembled.
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onCopies}>
            Go to executed copies
          </Button>
        </div>
      </section>

      {open && openDoc ? <CellPanel doc={openDoc} partyId={open.partyId} flags={flags} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
