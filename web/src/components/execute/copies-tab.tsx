import { useState } from "react";
import { copyStatus, type Flag } from "@/lib/execute/checks";
import type { CopyType, SigningDocument } from "@/lib/execute/model";
import { copyFileName, copyParties, partyName, planFor, setCopyName, setCopyType } from "@/lib/execute/signing";
import { signingPartiesOf } from "@/lib/execute/classify";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useExecute } from "./execute-app";
import { FileThumb } from "./returns-tab";
import { Mark } from "./marks";
import { useThumbnail } from "./thumbs";

function AgreementPage({ doc, index, unsigned }: { doc: SigningDocument; index: number; unsigned: boolean }) {
  const { getBytes } = useExecute();
  const url = useThumbnail(doc.fileId, "pdf", index + 1, 120, getBytes);
  return (
    <span className={cn("relative block w-[60px] shrink-0 border bg-white", unsigned ? "border-oxblood" : "border-rule")}>
      {url ? <img src={url} alt="" className="block w-full" /> : <span className="block aspect-[1/1.414]" />}
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
            <span className="block">
              {seg.kind === "stamp" ? "Stamp" : seg.kind === "signed" ? "Signed" : seg.unsigned ? "Unsigned" : ""}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function CopyRow({ doc, partyId, flags }: { doc: SigningDocument; partyId: string; flags: Flag[] }) {
  const { signing, update, downloadCopy } = useExecute();
  const [preview, setPreview] = useState(false);
  const status = copyStatus(signing, doc, partyId, flags);
  const awaiting = [
    ...status.awaitingSigned.map((id) => `page from ${partyName(signing, id)}`),
    ...(status.awaitingStamp ? ["stamp paper"] : []),
  ];

  return (
    <li className="py-5" data-testid="copy-row" data-ready={status.ready}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)_auto] lg:items-start">
        <div className="space-y-1">
          <p className="font-medium">{partyName(signing, partyId)}</p>
          <select
            aria-label={`Copy for ${partyName(signing, partyId)}`}
            value={doc.copies[partyId] ?? "counterpart"}
            onChange={(e) => update((s) => setCopyType(s, doc.id, partyId, e.target.value as CopyType))}
            className="h-8 border border-rule bg-paper px-1.5 text-[13px]"
          >
            <option value="original">Original</option>
            <option value="counterpart">Counterpart</option>
            <option value="none">No copy</option>
          </select>
        </div>
        <div className="min-w-0 space-y-2">
          <input
            aria-label={`File name for ${partyName(signing, partyId)}'s copy`}
            value={copyFileName(signing, doc, partyId)}
            onChange={(e) => update((s) => setCopyName(s, doc.id, partyId, e.target.value))}
            className="h-9 w-full border border-rule bg-paper px-2 text-[13px] outline-none focus:border-ink"
          />
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
            {status.ready ? (
              <span className="inline-flex items-center gap-2">
                <Mark state={status.checks.length ? "check" : "done"} />
                {status.checks.length ? `Complete, ${status.checks.length} to look at` : "Complete"}
              </span>
            ) : status.problems.length ? (
              <span className="inline-flex items-center gap-2 text-oxblood">
                <Mark state="problem" />
                {status.problems[0].message}
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 text-stone">
                <Mark state="awaited" />
                Awaiting {awaiting.join(", ")}
              </span>
            )}
            <button type="button" className="underline underline-offset-4" onClick={() => setPreview((v) => !v)}>
              {preview ? "Hide pages" : "See pages"}
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
        <Button
          variant={status.ready ? "secondary" : "ghost"}
          size="sm"
          className="justify-self-start"
          onClick={() => void downloadCopy(doc.id, partyId)}
        >
          {status.ready ? "Download" : "Download draft"}
        </Button>
      </div>
    </li>
  );
}

export function CopiesTab({ flags }: { flags: Flag[] }) {
  const { signing, downloadCopies, busy } = useExecute();
  const readyCount = signing.documents.reduce(
    (n, d) => n + copyParties(d).filter((p) => copyStatus(signing, d, p, flags).ready).length,
    0,
  );

  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-center justify-between gap-5 bg-ink px-6 py-5 text-paper">
        <div>
          <p className="font-display text-2xl">
            {readyCount} executed cop{readyCount === 1 ? "y is" : "ies are"} ready
          </p>
          <p className="text-[13px] text-paper/70">
            Each copy: its stamp paper, then the document with every signature page replaced by its countersigned page. The
            zip includes a closing index.
          </p>
        </div>
        <Button
          onClick={() => void downloadCopies()}
          disabled={!readyCount || Boolean(busy)}
          className="border-paper bg-paper text-ink hover:border-paper hover:bg-paper-sunk"
          data-testid="download-all"
        >
          {busy && busy.startsWith("Assembling") ? busy : `Download ${readyCount} ready (.zip)`}
        </Button>
      </div>

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
              {copies.map((p) => (
                <CopyRow key={p} doc={doc} partyId={p} flags={flags} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
