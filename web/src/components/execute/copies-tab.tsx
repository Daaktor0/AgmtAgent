import { useState } from "react";
import { copyStatus, type Flag } from "@/lib/execute/checks";
import type { CopyType, SigningDocument } from "@/lib/execute/model";
import { copyFileName, copyParties, pageSource, partyName, planFor, setCopyType, setCopyName, stampsFor } from "@/lib/execute/signing";
import { signingPartiesOf } from "@/lib/execute/classify";
import { ExecuteMark } from "@/components/agmt/brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useExecute } from "./execute-app";
import { FileThumb } from "./returns-tab";
import { Mark } from "./marks";
import { useThumbnail } from "./thumbs";

function AgreementPage({ doc, index, unsigned }: { doc: SigningDocument; index: number; unsigned: boolean }) {
  const { getBytes } = useExecute();
  const source = pageSource(doc, index);
  const url = useThumbnail(source.fileId, "pdf", source.page, 120, getBytes);
  return (
    <span className={cn("relative block w-[60px] shrink-0 border bg-white", unsigned ? "border-2 border-dashed border-oxblood" : "border-rule")}>
      {url ? <img src={url} alt="" className="block w-full" /> : <span className="thumb-loading block aspect-[1/1.414]" />}
      <span className="absolute bottom-0.5 right-0.5 bg-paper/95 px-0.5 text-[9px] tabular-nums">{index + 1}</span>
    </span>
  );
}

/** The copy, page by page, before anything is assembled. */
function Preview({ doc, partyId }: { doc: SigningDocument; partyId: string }) {
  const { signing } = useExecute();
  const plan = planFor(signing, doc, partyId);
  const byId = new Map(signing.returns.map((r) => [r.id, r]));
  return (
    <div className="mt-4 overflow-x-auto pb-2">
      <ol className="flex w-max items-start gap-2" aria-label="Pages of this copy in order">
        {plan.segments.map((seg, i) => (
          <li key={i} className="space-y-1 text-center text-[10px] text-stone">
            {seg.kind === "agreement" ? (
              <AgreementPage doc={doc} index={seg.pageIndex} unsigned={seg.unsigned} />
            ) : byId.get(seg.attachmentId) ? (
              <span className={cn("block border-2", seg.kind === "stamp" ? "border-ink" : "border-oxblood/70")}>
                <FileThumb file={byId.get(seg.attachmentId)!} width={56} className="border-0" />
              </span>
            ) : null}
            <span className={cn("block", seg.kind === "agreement" && seg.unsigned && "text-oxblood")}>
              {seg.kind === "stamp" ? "Stamp paper" : seg.kind === "signed" ? "Signed" : seg.unsigned ? "Unsigned" : ""}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function CopyRow({ doc, partyId, flags, first }: { doc: SigningDocument; partyId: string; flags: Flag[]; first: boolean }) {
  const { signing, update, downloadCopy } = useExecute();
  const [preview, setPreview] = useState(false);
  const status = copyStatus(signing, doc, partyId, flags);
  const name = partyName(signing, partyId);
  const owed = [
    ...(status.awaitingSigned.length ? [`${status.awaitingSigned.map((id) => partyName(signing, id)).join(", ")}'s signed page${status.awaitingSigned.length === 1 ? "" : "s"}`] : []),
    ...(status.awaitingStamp ? ["a stamp paper"] : []),
  ];

  return (
    <li className="py-5" data-testid="copy-row" data-ready={status.ready}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)_auto] lg:items-start">
        <div className="space-y-1.5">
          <p className="font-display text-[18px] leading-snug">{name}</p>
          <select
            aria-label={`Copy for ${name}`}
            value={doc.copies[partyId] ?? "counterpart"}
            onChange={(e) => update((s) => setCopyType(s, doc.id, partyId, e.target.value as CopyType))}
            className="h-8 border border-rule-strong bg-paper px-1.5 text-[13px]"
          >
            <option value="original">Original</option>
            <option value="counterpart">Counterpart</option>
            <option value="none">No copy</option>
          </select>
        </div>
        <div className="min-w-0 space-y-2">
          <input
            aria-label={`File name for ${name}'s copy`}
            value={copyFileName(signing, doc, partyId)}
            onChange={(e) => update((s) => setCopyName(s, doc.id, partyId, e.target.value))}
            className="h-9 w-full border border-rule-strong bg-paper px-2 text-[13px] outline-none focus:border-ink"
          />
          {first ? <p className="text-[12px] text-stone">Suggested from the party and document. Edit it to suit your firm's convention.</p> : null}
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
            {status.ready ? (
              <span className="inline-flex items-center gap-2">
                <Mark state={status.checks.length ? "check" : "done"} />
                {status.checks.length ? `Complete. ${status.checks.length} to check.` : "Complete"}
              </span>
            ) : status.problems.length ? (
              <span className="inline-flex items-center gap-2 text-oxblood">
                <Mark state="problem" />
                {status.problems[0].message}
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 text-stone">
                <Mark state="awaited" />
                Awaiting {owed.join(" and ")}
              </span>
            )}
            <button type="button" className="underline underline-offset-4" aria-expanded={preview} onClick={() => setPreview((v) => !v)}>
              {preview ? "Hide pages" : "Show pages"}
            </button>
          </p>
          {status.checks.length && status.ready ? (
            <ul className="space-y-1 text-[13px] text-oxblood">
              {status.checks.map((c, i) => (
                <li key={i}>{c.message}</li>
              ))}
            </ul>
          ) : null}
          {preview ? <Preview doc={doc} partyId={partyId} /> : null}
        </div>
        <div className="justify-self-start lg:justify-self-end lg:text-right">
          {status.ready ? (
            <Button variant="secondary" size="sm" onClick={() => void downloadCopy(doc.id, partyId)}>
              Download copy
            </Button>
          ) : (
            <>
              <button type="button" className="text-[13px] text-stone underline underline-offset-4 hover:text-ink" onClick={() => void downloadCopy(doc.id, partyId)}>
                Download incomplete copy
              </button>
              <p className="mt-1 max-w-[220px] text-[11.5px] leading-4 text-stone">Unsigned pages of the final stay in place.</p>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

/** When every copy is ready: a seal, the count, and one spine per copy, sized by its document's length. */
function Colophon({ copies, parties, docs, stamps, onDownload, busy }: { copies: { doc: SigningDocument; partyId: string }[]; parties: number; docs: number; stamps: number; onDownload: () => void; busy: string | null }) {
  const longest = Math.max(...copies.map((c) => c.doc.pageCount), 1);
  return (
    <div className="grid gap-6 bg-ink px-6 py-7 text-paper sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:px-8" role="status" data-testid="colophon">
      <span className="grid size-14 place-items-center bg-oxblood motion-safe:animate-[seal-in_320ms_cubic-bezier(.2,.9,.3,1.2)_both]">
        <ExecuteMark size={30} reversed />
      </span>
      <div className="min-w-0">
        <p className="font-display text-[28px] leading-tight">{copies.length === 1 ? "The executed copy is ready." : `All ${copies.length} executed copies are ready.`}</p>
        <p className="mt-1 text-[13px] text-paper/80">
          {parties} part{parties === 1 ? "y" : "ies"} · {docs} document{docs === 1 ? "" : "s"} · {stamps} stamp paper{stamps === 1 ? "" : "s"} in place
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-[3px]" aria-hidden="true">
          {copies.map((c, i) => (
            <i
              key={`${c.doc.id}:${c.partyId}`}
              className={cn("block w-3 border-t-2 border-oxblood-lift bg-[#3a3531] motion-safe:animate-[spine-in_360ms_ease-out_both]", i > 0 && copies[i - 1].doc.id !== c.doc.id && "ml-2")}
              style={{ height: `${20 + Math.round((c.doc.pageCount / longest) * 24)}px`, animationDelay: `${120 + i * 40}ms` }}
            />
          ))}
        </div>
      </div>
      <Button onClick={onDownload} disabled={Boolean(busy)} className="border-paper bg-paper text-ink hover:border-paper hover:bg-paper-sunk" data-testid="download-all">
        {busy && busy.startsWith("Assembling") ? busy : "Download all executed copies (.zip)"}
      </Button>
    </div>
  );
}

export function CopiesTab({ flags }: { flags: Flag[] }) {
  const { signing, downloadCopies, busy } = useExecute();
  const all = signing.documents.flatMap((d) => copyParties(d).map((partyId) => ({ doc: d, partyId })));
  const ready = all.filter((c) => copyStatus(signing, c.doc, c.partyId, flags).ready);
  const complete = all.length > 0 && ready.length === all.length;
  const stamps = all.reduce((n, c) => n + stampsFor(signing, c.doc.id, c.partyId).length, 0);
  let firstRow = true;

  return (
    <div className="space-y-12">
      {complete ? (
        <Colophon
          copies={all}
          parties={new Set(all.map((c) => c.partyId)).size}
          docs={signing.documents.length}
          stamps={stamps}
          busy={busy}
          onDownload={() => void downloadCopies()}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-5 border border-ink bg-vellum px-6 py-5">
          <div className="min-w-0">
            <p className="font-display text-2xl">
              {ready.length} of {all.length} executed cop{all.length === 1 ? "y" : "ies"} ready
            </p>
            <p className="max-w-[72ch] text-[13px] text-stone">
              Each copy has its stamp paper in front, then the final with each signature page replaced by the signed page. The zip includes a
              closing index.
            </p>
          </div>
          <Button onClick={() => void downloadCopies()} disabled={!ready.length || Boolean(busy)} data-testid="download-all">
            {busy && busy.startsWith("Assembling") ? busy : `Download ${ready.length} executed cop${ready.length === 1 ? "y" : "ies"} (.zip)`}
          </Button>
        </div>
      )}

      {signing.documents.map((doc) => {
        const copies = copyParties(doc);
        const none = signingPartiesOf(doc).filter((p) => !copies.includes(p));
        return (
          <section key={doc.id} aria-labelledby={`copies-${doc.id}`} className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-ink pb-2">
              <h3 id={`copies-${doc.id}`} className="font-display text-2xl">
                {doc.title}
              </h3>
              <span className="text-[13px] text-stone">
                {copies.length} cop{copies.length === 1 ? "y" : "ies"}
                {none.length ? ` · no copy for ${none.map((p) => partyName(signing, p)).join(", ")}` : ""}
              </span>
            </div>
            <ul className="divide-y divide-rule">
              {copies.map((p) => {
                const first = firstRow;
                firstRow = false;
                return <CopyRow key={p} doc={doc} partyId={p} flags={flags} first={first} />;
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
