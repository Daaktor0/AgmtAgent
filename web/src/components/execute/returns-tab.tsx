import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { CellState, Flag } from "@/lib/execute/checks";
import { cellFor } from "@/lib/execute/checks";
import { signingPartiesOf } from "@/lib/execute/classify";
import type { ReturnFile, ReturnRole, Signing, SigningDocument } from "@/lib/execute/model";
import {
  confirmAllAutoPlaced, confirmReturn, pagesOf, partyName, placeReturn, rotateReturn, setCopyType, toggleSignedBy,
  unplaced, pageLabel, pageSource,
} from "@/lib/execute/signing";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useExecute } from "./execute-app";
import { DropZone } from "./drop-zone";
import { Mark, STATE_LABEL, StateText, stateTone } from "./marks";
import { useThumbnail } from "./thumbs";
import { useViewPages, type ViewedPage } from "./page-viewer";
import { useModalFocus } from "./dialog";

const ACCEPT = "application/pdf,.pdf,image/*";
const SELECT = "h-9 max-w-full border border-rule-strong bg-paper px-2 text-sm";

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
      label: file.pageCount > 1 ? `Returned: ${file.fileName}, p. ${i + 1}` : `Returned: ${file.fileName}`,
      rotation: file.rotation,
    })),
    ...(compare ?? []),
  ];
  return (
    <button
      type="button"
      onClick={() => view({ pages, title: compare?.length ? "Returned page and the final" : file.fileName })}
      aria-label={compare?.length ? `Compare ${file.fileName} with the final` : `View ${file.fileName} large`}
      className={cn("block shrink-0 cursor-zoom-in overflow-hidden border border-rule bg-white p-0 hover:border-ink", className)}
      style={{ width }}
    >
      {url ? (
        <img src={url} alt="" className="block w-full" style={{ transform: `rotate(${file.rotation}deg)` }} />
      ) : (
        <span className="thumb-loading block aspect-[1/1.414] w-full" />
      )}
    </button>
  );
}

function sourceNote(file: ReturnFile): string {
  if (file.textSource === "pending") return "Reading the scan…";
  if (file.textSource === "none") return "No readable text found. Handwriting isn't read.";
  return file.textSource === "ocr" ? "Text read from the image" : "Text in the PDF";
}

/** Where a placed file went, in words: "Banyan Capital Fund I, SHA p. 7". */
function placedWhere(s: Signing, file: ReturnFile): string | null {
  const p = file.placement;
  if (p.status !== "placed") return null;
  const doc = s.documents.find((d) => d.id === p.docId);
  if (!doc) return null;
  if (p.role === "stamp") return `stamp paper for ${partyName(s, p.partyId)}'s copy of the ${doc.title}`;
  const pages = [...new Set(p.partyIds.flatMap((id) => pagesOf(doc, id)))].map((n) => n + 1);
  return `${p.partyIds.map((id) => partyName(s, id)).join(" and ")}, ${doc.title} p. ${pages.join(", ")}`;
}

/** One file Execute couldn't place, as a sentence: "This is [a signed page] for [SHA] from [party]". */
function TrayItem({ file, onDone }: { file: ReturnFile; onDone: (el: HTMLElement | null) => void }) {
  const { signing, update, removeReturn } = useExecute();
  const self = useRef<HTMLLIElement>(null);
  const s = file.suggestion;
  const [role, setRole] = useState<ReturnRole | "">(s?.role ?? "signed");
  const [docId, setDocId] = useState(s?.docId ?? (signing.documents.length === 1 ? signing.documents[0].id : ""));
  const [partyId, setPartyId] = useState(s?.partyIds[0] ?? "");
  const doc = signing.documents.find((d) => d.id === docId);
  const parties = doc ? signingPartiesOf(doc) : signing.parties.map((p) => p.id);
  const can = Boolean(role && doc && partyId && parties.includes(partyId));

  const place = () => {
    if (!can || !doc) return;
    onDone(self.current);
    update((x) =>
      placeReturn(
        x,
        file.id,
        role === "stamp"
          ? { status: "placed", role: "stamp", docId: doc.id, partyId }
          : { status: "placed", role: "signed", docId: doc.id, partyIds: [partyId] },
      ),
    );
  };
  const remove = () => {
    onDone(self.current);
    removeReturn(file.id);
  };
  const onKey = (e: KeyboardEvent<HTMLLIElement>) => {
    if (e.target !== self.current) return;
    if (e.key === "Enter") {
      e.preventDefault();
      place();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      remove();
    }
  };

  return (
    <li
      ref={self}
      tabIndex={0}
      onKeyDown={onKey}
      aria-label={`${file.fileName}. ${s?.reason ?? ""} ${can ? "Press Enter to place it." : "Choose where it goes."}`}
      data-tray-item
      data-testid="tray-item"
      className="grid gap-4 px-4 py-4 outline-none focus-visible:bg-white focus-visible:shadow-[inset_3px_0_0_var(--color-oxblood)] sm:grid-cols-[64px_minmax(0,1fr)_auto] sm:items-center"
    >
      <FileThumb file={file} width={64} />
      <div className="min-w-0 space-y-2">
        <div>
          <p className="font-medium [overflow-wrap:anywhere]">{file.fileName}</p>
          <p className="text-[13px] text-stone">
            {file.pageCount} page{file.pageCount === 1 ? "" : "s"} · {sourceNote(file)}
            {s?.reason ? ` ${s.reason}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-[13px]">
          <span>This is</span>
          <select aria-label="What is this file?" value={role} onChange={(e) => setRole(e.target.value as ReturnRole)} className={SELECT}>
            <option value="signed">a signed page</option>
            <option value="stamp">a stamp paper</option>
          </select>
          {signing.documents.length > 1 ? (
            <>
              <span>for</span>
              <select aria-label="For which document?" value={docId} onChange={(e) => setDocId(e.target.value)} className={cn(SELECT, "sm:max-w-[220px]")}>
                <option value="">choose a document</option>
                {signing.documents.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          <span>{role === "stamp" ? "for the copy of" : "from"}</span>
          <select aria-label={role === "stamp" ? "For whose copy?" : "From which party?"} value={partyId} onChange={(e) => setPartyId(e.target.value)} className={cn(SELECT, "sm:max-w-[260px]", !partyId && "border-dashed text-stone")}>
            <option value="">choose a party</option>
            {parties.map((id) => (
              <option key={id} value={id}>
                {partyName(signing, id)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!can} onClick={place}>
          Place file
        </Button>
        <button type="button" className="px-2 py-2 text-[13px] text-stone underline-offset-4 hover:text-oxblood hover:underline" onClick={remove}>
          Remove file
        </button>
      </div>
    </li>
  );
}

function NeedsYou({ waiting, glance, onOpen }: { waiting: ReturnFile[]; glance: ReturnFile[]; onOpen: (docId: string, partyId: string) => void }) {
  const { signing, update } = useExecute();
  const list = useRef<HTMLUListElement>(null);
  const next = useRef<number | null>(null);

  // After a file is placed or removed, keep the keyboard on the list: focus the item now in its place.
  useEffect(() => {
    if (next.current === null) return;
    const items = list.current?.querySelectorAll<HTMLElement>("[data-tray-item]") ?? [];
    items[Math.min(next.current, items.length - 1)]?.focus();
    next.current = null;
  }, [waiting.length]);

  const onDone = (el: HTMLElement | null) => {
    if (!el || !el.contains(document.activeElement)) return;
    const items = [...(list.current?.querySelectorAll<HTMLElement>("[data-tray-item]") ?? [])];
    next.current = items.indexOf(el);
  };
  const move = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = [...(list.current?.querySelectorAll<HTMLElement>("[data-tray-item]") ?? [])];
    const i = items.indexOf(e.target as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    items[Math.max(0, Math.min(items.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
  };

  if (!waiting.length && !glance.length) return null;
  return (
    <section aria-labelledby="needs-you" className="border border-ink bg-vellum" data-testid={waiting.length ? "tray" : "glance-only"}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule px-4 py-3">
        <h3 id="needs-you" className="font-display text-xl">
          Needs you <span className="tabular-nums text-stone">({waiting.length + glance.length})</span>
        </h3>
        {waiting.length ? (
          <p className="text-[12px] text-stone">
            Execute couldn't place these with confidence. Select a file, then <kbd className="kbd">Enter</kbd> places it,{" "}
            <kbd className="kbd">Delete</kbd> removes it, <kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> move.
          </p>
        ) : null}
      </div>
      {waiting.length ? (
        <ul ref={list} className="divide-y divide-rule" onKeyDown={move} aria-label="Files to place">
          {waiting.map((f) => (
            <TrayItem key={f.id} file={f} onDone={onDone} />
          ))}
        </ul>
      ) : null}
      {glance.length ? (
        <div className={cn("space-y-2 px-4 py-3 text-[13px]", waiting.length && "border-t border-rule")} data-testid="glance">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="inline-flex items-center gap-2">
              <Mark state="check" />
              {glance.length} file{glance.length === 1 ? " was" : "s were"} placed by file name only. Open each to check, or confirm{" "}
              {glance.length === 1 ? "it" : "them together"}.
            </p>
            <Button size="sm" variant="secondary" onClick={() => update(confirmAllAutoPlaced)}>
              Confirm {glance.length === 1 ? "it" : `all ${glance.length}`}
            </Button>
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {glance.map((f) => {
              const p = f.placement;
              if (p.status !== "placed") return null;
              const partyId = p.role === "stamp" ? p.partyId : p.partyIds[0];
              return (
                <li key={f.id}>
                  <button type="button" className="underline underline-offset-4 hover:text-oxblood" onClick={() => onOpen(p.docId, partyId)}>
                    {f.fileName}
                  </button>
                  <span className="text-stone"> → {placedWhere(signing, f)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

type Filter = "all" | "outstanding" | "check" | "problem";

const cellLabel = (what: "Page" | "Stamp", state: CellState, count: number) =>
  state === "done" ? `${what}${what === "Stamp" && count > 1 ? ` ×${count}` : ""}` : `${what} ${STATE_LABEL[state].toLowerCase()}`;

function CellButton({ doc, partyId, flags, settled, onOpen }: { doc: SigningDocument; partyId: string; flags: Flag[]; settled: boolean; onOpen: () => void }) {
  const { signing } = useExecute();
  const cell = cellFor(signing, doc, partyId, flags);
  if (cell.signed === "not-needed") {
    return (
      <span className="flex items-center gap-2 px-3 py-3 text-[13px] text-stone">
        <Mark state="not-needed" />
        Not signing
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="cell"
      data-signed={cell.signed}
      data-stamp={cell.stamp}
      className={cn(
        "flex w-full flex-wrap gap-x-4 gap-y-1.5 px-3 py-3 text-left text-[13px] hover:bg-paper-sunk focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-oxblood",
        settled && "cell-settled",
      )}
      aria-label={`${partyName(signing, partyId)}, ${doc.title}: signed page ${STATE_LABEL[cell.signed].toLowerCase()}; stamp paper ${STATE_LABEL[cell.stamp].toLowerCase()}.`}
    >
      <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", stateTone(cell.signed))}>
        <Mark state={cell.signed} />
        {cellLabel("Page", cell.signed, cell.signedFiles.length)}
      </span>
      <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", stateTone(cell.stamp))}>
        <Mark state={cell.stamp} />
        {cellLabel("Stamp", cell.stamp, cell.stampFiles.length)}
      </span>
    </button>
  );
}

function PlacedFile({ file, doc, partyId, shared }: { file: ReturnFile; doc: SigningDocument; partyId: string; shared: string[] }) {
  const { signing, update, removeReturn } = useExecute();
  const e = file.estamp;
  const signed = file.placement.status === "placed" && file.placement.role === "signed";
  const compare: ViewedPage[] = signed
    ? pagesOf(doc, partyId).map((p) => ({ ...pageSource(doc, p), kind: "pdf" as const, label: p < doc.pageCount ? `Final: ${doc.title}, p. ${p + 1}` : `Sent: ${doc.title}, ${pageLabel(doc, p)}` }))
    : [];
  return (
    <li className="grid gap-4 py-4 sm:grid-cols-[88px_minmax(0,1fr)]">
      <FileThumb file={file} width={88} compare={compare} />
      <div className="min-w-0 space-y-2 text-[13px]">
        <p className="text-[14px] font-medium [overflow-wrap:anywhere]">{file.fileName}</p>
        <p className="text-stone">
          {file.pageCount} page{file.pageCount === 1 ? "" : "s"} · {sourceNote(file)}
          {file.rotation ? ` · rotated ${file.rotation}°` : ""}
        </p>
        {e ? (
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-0.5">
            {e.certificateNo ? (
              <>
                <dt className="text-stone">Certificate no.</dt>
                <dd className="tabular-nums tracking-[0.02em]">{e.certificateNo}</dd>
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
                <dt className="text-stone">Stamp duty</dt>
                <dd className="tabular-nums">Rs. {e.amount}</dd>
              </>
            ) : null}
          </dl>
        ) : null}
        {shared.length && file.placement.status === "placed" && file.placement.role === "signed" ? (
          <fieldset className="space-y-1">
            <legend className="text-stone">Also signed on this page by</legend>
            {shared.map((id) => {
              const p = file.placement;
              const checked = p.status === "placed" && p.role === "signed" && p.partyIds.includes(id);
              return (
                <label key={id} className="flex items-center gap-2">
                  <input type="checkbox" checked={checked} onChange={() => update((s) => toggleSignedBy(s, file.id, id))} className="size-4 accent-[var(--color-oxblood)]" />
                  {partyName(signing, id)}
                </label>
              );
            })}
          </fieldset>
        ) : null}
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
          {file.autoPlaced ? (
            <button type="button" className="font-medium text-oxblood underline underline-offset-4" onClick={() => update((s) => confirmReturn(s, file.id))}>
              Confirm
            </button>
          ) : null}
          <button type="button" className="underline underline-offset-4" onClick={() => update((s) => rotateReturn(s, file.id))}>
            Rotate
          </button>
          <button type="button" className="underline underline-offset-4" onClick={() => update((s) => placeReturn(s, file.id, { status: "unplaced" }))}>
            Move to Needs you
          </button>
          <button type="button" className="text-stone hover:text-oxblood" onClick={() => removeReturn(file.id)}>
            Remove file
          </button>
        </div>
      </div>
    </li>
  );
}

function CellPanel({ doc, partyId, flags, onClose }: { doc: SigningDocument; partyId: string; flags: Flag[]; onClose: () => void }) {
  const { signing, update, addReturns } = useExecute();
  const ref = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const cell = cellFor(signing, doc, partyId, flags);
  const pages = pagesOf(doc, partyId);
  const shared = [...new Set(pages.flatMap((p) => doc.sigPages[p]))].filter((id) => id !== partyId);
  const copy = doc.copies[partyId] ?? "counterpart";
  const name = partyName(signing, partyId);
  useModalFocus(ref, heading);

  useEffect(() => {
    const esc = (e: globalThis.KeyboardEvent) => {
      // The page viewer sits above this panel and closes first.
      if (e.key === "Escape" && !document.querySelector("[aria-modal='true'][class*='z-[60]']")) onClose();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/25" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cell-title"
        className="h-full w-full max-w-[560px] overflow-y-auto border-l border-ink bg-paper px-5 py-6 shadow-[-12px_0_32px_rgba(28,25,23,0.15)] motion-safe:animate-[panel-in_220ms_ease-out] sm:px-9 sm:py-7"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.14em] text-stone">{doc.title}</p>
            <h2 id="cell-title" ref={heading} tabIndex={-1} className="mt-1 font-display text-3xl outline-none [overflow-wrap:anywhere]">
              {name}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="px-1 text-2xl leading-none text-stone hover:text-ink" aria-label="Close panel">
            ×
          </button>
        </div>

        {cell.flags.length ? (
          <ul className="mt-6 space-y-2">
            {cell.flags.map((f, i) => (
              <li key={i} className={cn("border-l-2 pl-3 text-sm leading-6", f.severity === "problem" ? "border-oxblood bg-oxblood-wash py-1.5 pr-2" : "border-oxblood")}>
                <span className="mr-2 inline-flex translate-y-[1px]">
                  <Mark state={f.severity === "problem" ? "problem" : "check"} />
                </span>
                {f.message}
              </li>
            ))}
          </ul>
        ) : null}

        <section className="mt-8 space-y-3">
          <div className="flex items-center justify-between gap-4 border-b border-ink pb-2">
            <h3 className="font-display text-xl">Signed page</h3>
            <StateText state={cell.signed} />
          </div>
          <p className="text-[13px] text-stone">
            Signs p. {pages.map((p) => p + 1).join(", ")} of the {doc.title}
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
            label={`Add ${name}'s signed page`}
            className="min-h-[64px] text-sm"
          >
            <span>+ Add {name}'s signed page</span>
          </DropZone>
        </section>

        <section className="mt-10 space-y-3">
          <div className="flex items-center justify-between gap-4 border-b border-ink pb-2">
            <h3 className="font-display text-xl">Stamp paper</h3>
            <StateText state={cell.stamp} />
          </div>
          <label className="flex flex-wrap items-center gap-3 text-[13px]">
            <span className="text-stone">This party receives</span>
            <select value={copy} onChange={(e) => update((s) => setCopyType(s, doc.id, partyId, e.target.value as typeof copy))} className={SELECT}>
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
                label={`Add a stamp paper for ${name}'s copy`}
                className="min-h-[64px] text-sm"
              >
                <span>+ Add a stamp paper for {name}'s copy</span>
              </DropZone>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}

/** Per party, across every document: is anything outstanding, to check or to fix? */
function partyStates(s: Signing, flags: Flag[]) {
  const out = new Map<string, Set<CellState>>();
  for (const p of s.parties) {
    const states = new Set<CellState>();
    for (const d of s.documents) {
      const c = cellFor(s, d, p.id, flags);
      states.add(c.signed);
      states.add(c.stamp);
    }
    out.set(p.id, states);
  }
  return out;
}

const matches = (states: Set<CellState> | undefined, f: Filter) =>
  f === "all" ||
  (f === "outstanding" && Boolean(states && (states.has("awaited") || states.has("check") || states.has("problem")))) ||
  (f === "check" && Boolean(states?.has("check"))) ||
  (f === "problem" && Boolean(states?.has("problem")));

function docCounts(s: Signing, d: SigningDocument, flags: Flag[]) {
  let pages = 0, stamps = 0, pagesTotal = 0, stampsTotal = 0;
  for (const p of s.parties) {
    const c = cellFor(s, d, p.id, flags);
    if (c.signed !== "not-needed") {
      pagesTotal += 1;
      if (c.signedFiles.length) pages += 1;
    }
    if (c.stamp !== "not-needed") {
      stampsTotal += 1;
      if (c.stampFiles.length) stamps += 1;
    }
  }
  return `${pages} / ${pagesTotal} pages · ${stamps} / ${stampsTotal} stamps`;
}

export function ReturnsTab({ flags, onCopies }: { flags: Flag[]; onCopies: () => void }) {
  const { signing, addReturns, batch, clearBatch, busy, ocrQueue } = useExecute();
  const [open, setOpen] = useState<{ docId: string; partyId: string } | null>(null);
  const waiting = unplaced(signing);
  const glance = signing.returns.filter((r) => r.autoPlaced && r.placement.status === "placed");
  const parties = signing.parties;
  const openDoc = open ? signing.documents.find((d) => d.id === open.docId) : null;
  const problems = useMemo(() => flags.filter((f) => f.severity === "problem"), [flags]);
  const states = useMemo(() => partyStates(signing, flags), [signing, flags]);
  const [filter, setFilter] = useState<Filter>(parties.length >= 15 ? "outstanding" : "all");
  const [mobileDoc, setMobileDoc] = useState(signing.documents[0]?.id ?? "");
  const settledIds = useMemo(() => new Set(batch?.ids ?? []), [batch]);

  if (!signing.documents.some((d) => Object.keys(d.sigPages).length)) {
    return <p className="text-stone">Mark the signature pages in Documents first. Returns are matched against them.</p>;
  }

  const counts: Record<Filter, number> = {
    all: parties.length,
    outstanding: parties.filter((p) => matches(states.get(p.id), "outstanding")).length,
    check: parties.filter((p) => matches(states.get(p.id), "check")).length,
    problem: parties.filter((p) => matches(states.get(p.id), "problem")).length,
  };
  const shown = parties.map((p, i) => ({ p, n: i + 1 })).filter(({ p }) => matches(states.get(p.id), filter));
  const settled = (d: SigningDocument, partyId: string) => {
    if (!settledIds.size) return false;
    const c = cellFor(signing, d, partyId, flags);
    return [...c.signedFiles, ...c.stampFiles].some((f) => settledIds.has(f.id));
  };
  const blocked = [...new Set(problems.map((f) => `${f.partyId ? partyName(signing, f.partyId) : "a party"} (${signing.documents.find((d) => d.id === f.docId)?.title ?? "document"})`))];
  const placedNow = batch ? signing.returns.filter((r) => settledIds.has(r.id) && r.placement.status === "placed") : [];
  const mDoc = signing.documents.find((d) => d.id === mobileDoc) ?? signing.documents[0];

  return (
    <div className="space-y-8">
      <DropZone onFiles={(files) => void addReturns(files)} accept={ACCEPT} label="Add signed pages and stamp papers" className="min-h-[128px]" testId="returns-drop">
        <span className="font-display text-[22px] leading-tight sm:text-2xl">Drop in everything that has come back</span>
        <span className="max-w-xl text-sm text-stone">
          Signed pages and stamp papers, as PDFs, scans or JPG photos, all at once. Each is read on this computer and placed with its party.
          iPhone HEIC photos don't open here; ask for JPG.
        </span>
        {busy ? <span className="text-sm text-ink">{busy}</span> : null}
      </DropZone>

      {batch ? (
        <div className="border-l-2 border-ink bg-paper-sunk px-5 py-4" role="status" data-testid="batch">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm">
              <span className="font-medium">
                {batch.added} file{batch.added === 1 ? "" : "s"} read.
              </span>{" "}
              {batch.placed === batch.added ? (batch.added > 1 ? `All ${batch.added} placed.` : "Placed.") : `${batch.placed} placed`}
              {waiting.length ? `${batch.placed === batch.added ? " " : ", "}${waiting.length} need${waiting.length === 1 ? "s" : ""} you.` : batch.placed === batch.added ? "" : "."}
              {ocrQueue ? ` Still reading ${ocrQueue} scan${ocrQueue === 1 ? "" : "s"}.` : ""}
            </p>
            <button type="button" className="text-[13px] text-stone hover:text-ink" onClick={clearBatch}>
              Dismiss
            </button>
          </div>
          {placedNow.length ? (
            <details className="mt-2 text-[13px]">
              <summary className="cursor-pointer text-stone hover:text-ink">Where each file went</summary>
              <ul className="mt-2 space-y-1">
                {placedNow.map((r) => (
                  <li key={r.id} className="[overflow-wrap:anywhere]">
                    {r.fileName} <span className="text-stone">→ {placedWhere(signing, r)}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      <NeedsYou waiting={waiting} glance={glance} onOpen={(docId, partyId) => setOpen({ docId, partyId })} />

      <section aria-labelledby="grid-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <h3 id="grid-heading" className="font-display text-xl">
            Checklist
          </h3>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show parties">
            {(
              [
                ["outstanding", "Outstanding"],
                ["check", "To check"],
                ["problem", "To fix"],
                ["all", "All"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-[2px] border px-2.5 text-[12.5px]",
                  filter === id ? "border-ink bg-ink text-paper" : "border-rule-strong hover:border-ink",
                )}
              >
                {label} <b className="font-semibold tabular-nums">{counts[id]}</b>
              </button>
            ))}
          </div>
        </div>

        {/* Wide screens: the grid, with its header row and party column pinned. */}
        <div className="hidden max-h-[min(74vh,1100px)] overflow-auto border border-rule bg-vellum sm:block">
          <table className="w-full min-w-[560px] border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 top-0 z-20 w-10 border-b border-ink bg-paper px-3 py-3 text-[11px] font-normal text-stone">
                  <span className="sr-only">Number</span>#
                </th>
                <th scope="col" className="sticky left-10 top-0 z-20 border-b border-ink bg-paper px-3 py-3 text-[11px] font-normal uppercase tracking-[0.14em] text-stone">
                  Party
                </th>
                {signing.documents.map((d) => (
                  <th key={d.id} scope="col" className="sticky top-0 z-10 min-w-[190px] border-b border-l border-ink border-l-rule bg-paper px-3 py-2.5 font-normal">
                    <span className="block font-display text-[15px] leading-snug">{d.title}</span>
                    <span className="block text-[11px] tabular-nums text-stone">{docCounts(signing, d, flags)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map(({ p, n }) => (
                <tr key={p.id} className="group">
                  <td className="sticky left-0 z-10 w-10 border-b border-rule bg-vellum px-3 py-3 align-top text-[11px] tabular-nums text-rule-strong group-hover:bg-paper">
                    {String(n).padStart(2, "0")}
                  </td>
                  <th scope="row" className="sticky left-10 z-10 max-w-[280px] border-b border-rule bg-vellum px-3 py-3 align-top text-[14px] font-medium leading-snug group-hover:bg-paper">
                    {p.name}
                  </th>
                  {signing.documents.map((d) => (
                    <td key={d.id} className="border-b border-l border-rule p-0 align-top">
                      <CellButton doc={d} partyId={p.id} flags={flags} settled={settled(d, p.id)} onOpen={() => setOpen({ docId: d.id, partyId: p.id })} />
                    </td>
                  ))}
                </tr>
              ))}
              {shown.length < parties.length ? (
                <tr>
                  <td colSpan={signing.documents.length + 2} className="bg-paper px-3 py-2.5 text-center text-[12.5px] text-stone">
                    {shown.length === 0 ? "No parties match. " : `${parties.length - shown.length} other part${parties.length - shown.length === 1 ? "y" : "ies"} hidden. `}
                    <button type="button" className="underline underline-offset-4 hover:text-ink" onClick={() => setFilter("all")}>
                      Show all {parties.length} parties
                    </button>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* Phones: one document at a time, one row per party. */}
        <div className="space-y-3 sm:hidden">
          {signing.documents.length > 1 ? (
            <div className="grid auto-cols-fr grid-flow-col border border-ink" role="group" aria-label="Document">
              {signing.documents.map((d, i) => (
                <button
                  key={d.id}
                  type="button"
                  aria-pressed={mDoc?.id === d.id}
                  onClick={() => setMobileDoc(d.id)}
                  className={cn("min-w-0 px-1.5 py-2 text-center text-[12px] leading-tight", i && "border-l border-ink", mDoc?.id === d.id ? "bg-ink text-paper" : "")}
                >
                  <span className="block truncate">{d.title}</span>
                  <span className="block text-[10.5px] tabular-nums opacity-80">{docCounts(signing, d, flags).replace(" pages", "").replace(" stamps", "")}</span>
                </button>
              ))}
            </div>
          ) : null}
          {mDoc ? (
            <ul className="border-t border-rule">
              {shown.map(({ p, n }) => {
                const c = cellFor(signing, mDoc, p.id, flags);
                return (
                  <li key={p.id} className="border-b border-rule">
                    {c.signed === "not-needed" ? (
                      <div className="grid grid-cols-[26px_minmax(0,1fr)] gap-2 py-3 text-[13px] text-stone">
                        <span className="pt-0.5 text-[11px] tabular-nums text-rule-strong">{String(n).padStart(2, "0")}</span>
                        <span>
                          <span className="block text-ink">{p.name}</span>
                          <span className="mt-1 inline-flex items-center gap-1.5">
                            <Mark state="not-needed" /> Not signing
                          </span>
                        </span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        data-testid="cell-m"
                        onClick={() => setOpen({ docId: mDoc.id, partyId: p.id })}
                        className={cn("grid w-full grid-cols-[26px_minmax(0,1fr)_10px] items-start gap-2 py-3 text-left text-[13px]", settled(mDoc, p.id) && "cell-settled")}
                        aria-label={`${p.name}, ${mDoc.title}: signed page ${STATE_LABEL[c.signed].toLowerCase()}; stamp paper ${STATE_LABEL[c.stamp].toLowerCase()}.`}
                      >
                        <span className="pt-0.5 text-[11px] tabular-nums text-rule-strong">{String(n).padStart(2, "0")}</span>
                        <span className="min-w-0">
                          <span className="block font-medium [overflow-wrap:anywhere]">{p.name}</span>
                          <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                            <span className={cn("inline-flex items-center gap-1.5", stateTone(c.signed))}>
                              <Mark state={c.signed} /> {cellLabel("Page", c.signed, c.signedFiles.length)}
                            </span>
                            <span className={cn("inline-flex items-center gap-1.5", stateTone(c.stamp))}>
                              <Mark state={c.stamp} /> {cellLabel("Stamp", c.stamp, c.stampFiles.length)}
                            </span>
                          </span>
                        </span>
                        <span className="mt-1.5 size-[7px] rotate-45 border-r-[1.5px] border-t-[1.5px] border-stone" aria-hidden="true" />
                      </button>
                    )}
                  </li>
                );
              })}
              {shown.length < parties.length ? (
                <li className="py-2.5 text-center text-[12.5px] text-stone">
                  <button type="button" className="underline underline-offset-4" onClick={() => setFilter("all")}>
                    Show all {parties.length} parties
                  </button>
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>

        <p className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-stone">
          {(["done", "check", "problem", "awaited", "not-needed"] as const).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <Mark state={s} /> {STATE_LABEL[s]}
            </span>
          ))}
        </p>
        {problems.length ? (
          <p className="border-l-2 border-oxblood bg-oxblood-wash px-3 py-2 text-sm">
            {problems.length} to fix before {problems.length === 1 ? "that copy" : "those copies"} can be assembled: {blocked.join(", ")}.
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onCopies}>
            Continue to executed copies
          </Button>
        </div>
      </section>

      {open && openDoc ? <CellPanel doc={openDoc} partyId={open.partyId} flags={flags} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
