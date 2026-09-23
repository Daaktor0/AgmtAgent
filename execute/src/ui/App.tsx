import { useEffect, useRef, useState } from "react";
import { analysePages } from "../lib/extract.ts";
import { ingestFile, openPdf, renderThumb, saveBytes, zip } from "../lib/browser.ts";
import { safeFileName, uniqueNames, type AttachmentRole } from "../lib/names.ts";
import { countPages, createCompiler, type RenderAttachment, type Source } from "../lib/render.ts";
import {
  addAttachment, copyFileName, copyParties, emptyState, newId, packFileName, partyOrder, partyPages,
  planFor, removeAttachment, toggleSignedParty, withAgreement, type AppState,
} from "../lib/state.ts";
import { AgreementSection } from "./AgreementSection.tsx";
import { ReturnsSection } from "./ReturnsSection.tsx";
import { CopiesSection } from "./CopiesSection.tsx";
import { DropZone } from "./DropZone.tsx";

export type Actions = {
  update: (fn: (s: AppState) => AppState) => void;
  addFiles: (files: File[], target?: { role: AttachmentRole; partyId: string }) => Promise<void>;
  remove: (attId: string) => void;
  downloadCopy: (partyId: string) => Promise<void>;
  downloadAllCopies: () => Promise<void>;
  downloadPack: (partyId: string) => Promise<void>;
  downloadAllPacks: () => Promise<void>;
};

const message = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong reading that file.");

export function App() {
  const [state, setState] = useState<AppState>(emptyState);
  const [thumbs, setThumbs] = useState<(string | null)[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const agreementBytes = useRef<Uint8Array | null>(null);
  const sources = useRef(new Map<string, Source>());
  const hashes = useRef(new Map<string, string>());
  const loadToken = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const thumbsRef = useRef(thumbs);
  thumbsRef.current = thumbs;

  // Closing the tab loses the work (nothing is stored), so ask first.
  useEffect(() => {
    if (!state.agreement) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state.agreement]);

  const notify = (text: string) => setNotices((n) => [...n, text]);

  function resetAll() {
    for (const url of thumbsRef.current) if (url) URL.revokeObjectURL(url);
    for (const id of stateRef.current.attachments) URL.revokeObjectURL(stateRef.current.meta[id].thumb);
    sources.current.clear();
    hashes.current.clear();
    agreementBytes.current = null;
    setThumbs([]);
    setNotices([]);
    setState(emptyState);
  }

  async function loadAgreement(file: File) {
    const token = ++loadToken.current;
    setBusy("Reading the agreement…");
    try {
      if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
        throw new Error("The final agreement must be a PDF. Save it from Word as PDF and add it again.");
      }
      const raw = new Uint8Array(await file.arrayBuffer());
      await countPages({ type: "pdf", bytes: raw }, file.name);
      const pdf = await openPdf(raw);
      const pages = await analysePages(pdf);
      resetAll();
      agreementBytes.current = raw;
      setState(withAgreement(file.name, pages));
      setThumbs(pages.map(() => null));
      setBusy(null);
      for (let i = 0; i < pages.length; i += 1) {
        if (token !== loadToken.current) break;
        const url = await renderThumb(pdf, i + 1, 150);
        setThumbs((t) => {
          const next = [...t];
          next[i] = url;
          return next;
        });
      }
      void pdf.destroy();
    } catch (err) {
      notify(message(err));
    } finally {
      setBusy(null);
    }
  }

  const actions: Actions = {
    update: (fn) => setState((s) => fn(s)),

    async addFiles(files, target) {
      setBusy(`Reading ${files.length} file${files.length === 1 ? "" : "s"}…`);
      for (const file of files) {
        try {
          const ing = await ingestFile(file);
          const existing = hashes.current.get(ing.hash);
          if (existing) {
            URL.revokeObjectURL(ing.thumb);
            const place = stateRef.current.placement[existing];
            // The same scan dropped for a second party on a shared page: one
            // file, signed by both.
            if (target?.role === "signed" && place?.role === "signed" && !place.partyIds.includes(target.partyId)) {
              setState((s) => toggleSignedParty(s, existing, target.partyId));
            } else {
              notify(`"${file.name}" was already added.`);
            }
            continue;
          }
          const id = newId("f");
          sources.current.set(id, ing.source);
          hashes.current.set(ing.hash, id);
          setState((s) =>
            addAttachment(s, { id, fileName: ing.fileName, pageCount: ing.pageCount, thumb: ing.thumb, rotation: 0 }, target),
          );
        } catch (err) {
          notify(message(err));
        }
      }
      setBusy(null);
    },

    remove(attId) {
      const meta = stateRef.current.meta[attId];
      if (meta) URL.revokeObjectURL(meta.thumb);
      sources.current.delete(attId);
      for (const [hash, id] of hashes.current) if (id === attId) hashes.current.delete(hash);
      setState((s) => removeAttachment(s, attId));
    },

    async downloadCopy(partyId) {
      await run("Assembling the executed copy…", async () => {
        const s = stateRef.current;
        const c = await compiler(s);
        const bytes = await c.build(planFor(s, partyId), copyFileName(s, partyId).replace(/\.pdf$/i, ""));
        saveBytes(bytes, safeFileName(copyFileName(s, partyId)));
      });
    },

    async downloadAllCopies() {
      await run("Assembling every executed copy…", async () => {
        const s = stateRef.current;
        const c = await compiler(s);
        const ids = copyParties(s);
        const names = uniqueNames(ids.map((id) => safeFileName(copyFileName(s, id))));
        const files = [];
        for (const [i, id] of ids.entries()) {
          files.push({ name: names[i], bytes: await c.build(planFor(s, id), names[i].replace(/\.pdf$/i, "")) });
        }
        saveBytes(zip(files), safeFileName(`${s.title || "Agreement"} - Executed copies`).replace(/\.pdf$/, ".zip"), "application/zip");
      });
    },

    async downloadPack(partyId) {
      await run("Preparing the signature page…", async () => {
        const s = stateRef.current;
        const c = await compiler(s);
        const name = packFileName(s, partyId);
        saveBytes(await c.extract(partyPages(s, partyId), name.replace(/\.pdf$/i, "")), name);
      });
    },

    async downloadAllPacks() {
      await run("Preparing signature pages…", async () => {
        const s = stateRef.current;
        const c = await compiler(s);
        const ids = partyOrder(s);
        const names = uniqueNames(ids.map((id) => packFileName(s, id)));
        const files = [];
        for (const [i, id] of ids.entries()) {
          files.push({ name: names[i], bytes: await c.extract(partyPages(s, id), names[i].replace(/\.pdf$/i, "")) });
        }
        saveBytes(zip(files), safeFileName(`${s.title || "Agreement"} - Signature pages`).replace(/\.pdf$/, ".zip"), "application/zip");
      });
    },
  };

  async function compiler(s: AppState) {
    if (!agreementBytes.current) throw new Error("Add the final agreement first.");
    const atts = new Map<string, RenderAttachment>();
    for (const id of s.attachments) {
      const source = sources.current.get(id);
      if (source) atts.set(id, { source, rotation: s.meta[id].rotation, label: s.meta[id].fileName });
    }
    return createCompiler(agreementBytes.current, atts);
  }

  async function run(label: string, task: () => Promise<void>) {
    setBusy(label);
    try {
      await task();
    } catch (err) {
      notify(message(err));
    } finally {
      setBusy(null);
    }
  }

  async function loadSample() {
    setBusy("Building a sample deal…");
    const { buildSampleDeal } = await import("../lib/sample.ts");
    const deal = await buildSampleDeal();
    await loadAgreement(new File([deal.agreement.bytes as BlobPart], deal.agreement.name, { type: "application/pdf" }));
    await actions.addFiles(deal.returns.map((r) => new File([r.bytes as BlobPart], r.name, { type: "application/pdf" })));
  }

  return (
    <div className="shell">
      <header className="masthead">
        <div className="brand">
          <span className="wordmark">agmt</span>
          <span className="product">Execute</span>
        </div>
        <p className="local-badge" title="This page is not permitted to send data anywhere. It keeps working with the internet switched off.">
          <span aria-hidden className="dot" /> Runs on this computer. Nothing is uploaded.
        </p>
        {state.agreement ? (
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              if (window.confirm("Start over? Everything on this page will be cleared.")) {
                loadToken.current += 1;
                resetAll();
              }
            }}
          >
            Start over
          </button>
        ) : null}
      </header>

      <div className="status" role="status" aria-live="polite">
        {busy ? <span className="busy">{busy}</span> : null}
      </div>

      {notices.length ? (
        <div className="notices" role="alert">
          {notices.map((n, i) => (
            <p key={i} className="notice">
              {n}
              <button type="button" aria-label="Dismiss" onClick={() => setNotices((all) => all.filter((_, j) => j !== i))}>
                ×
              </button>
            </p>
          ))}
        </div>
      ) : null}

      <main>
        {!state.agreement ? (
          <section className="intro">
            <h1>Executed copies, assembled in minutes.</h1>
            <p className="lead">
              Add the final agreement. Mark the signature pages. Drop in the countersigned pages and stamp papers as
              they arrive. Download a complete executed copy for every party, each with its own stamp paper in front.
            </p>
            <DropZone
              onFiles={(f) => void loadAgreement(f[0])}
              accept="application/pdf,.pdf"
              multiple={false}
              label="Add the final agreement (PDF)"
              testId="agreement-drop"
            >
              <strong>Drop the final agreement here</strong>
              <span>PDF of the agreed final version · or click to choose</span>
            </DropZone>
            <button type="button" className="btn btn-quiet" onClick={() => void loadSample()} data-testid="sample">
              Try a sample deal instead
            </button>
            <ol className="how">
              <li>
                <strong>Signature pages.</strong> Pages that look like signature pages are marked, with party names read
                from them. Correct anything, then download one signature page per party to send out.
              </li>
              <li>
                <strong>Returns.</strong> Drop in countersigned pages and stamp papers, PDFs or phone photos. Each file
                is matched to its party by name; you confirm.
              </li>
              <li>
                <strong>Executed copies.</strong> Stamp paper, then the agreement, with every signature page replaced by
                its countersigned page. One copy per party, named and ready to send.
              </li>
            </ol>
          </section>
        ) : (
          <>
            <AgreementSection state={state} thumbs={thumbs} actions={actions} />
            <ReturnsSection state={state} actions={actions} />
            <CopiesSection state={state} actions={actions} />
          </>
        )}
      </main>

      <footer className="foot">
        Agmt Execute · early preview. Files are read into this browser tab only and are gone when you close it.
      </footer>
    </div>
  );
}
