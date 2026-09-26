import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { readEStamp } from "@/lib/execute/estamp";
import { newId, type MakeSetup, type MakeTemplate, type Placement, type Signing, type SigningDocument } from "@/lib/execute/model";
import { safeFileName, uniqueNames } from "@/lib/execute/names";
import type { RenderAttachment } from "@/lib/execute/render";
import {
  addDocument, addReturn, applyMadePages, copyFileName, copyParties, createSigning, packFileName, pagesOf, placeReturn,
  planFor, removeReturn as dropReturn, saveMakeSetup, setupKey, updateReturnText,
} from "@/lib/execute/signing";
import type { FoundParties, ReadTemplate } from "@/lib/execute/browser/make";
import { signingPartiesOf } from "@/lib/execute/classify";
import { copyStatus, signingFlags } from "@/lib/execute/checks";
import { forgetThumbnails } from "./thumbs";
import { loadIntake, loadMake, loadSave, loadStore } from "./runtime";
import { StartScreen } from "./start-screen";
import { SigningView } from "./signing-view";
import { PageViewerProvider } from "./page-viewer";

export type SaveState = "saved" | "saving" | "unsaved" | "off";
export type Batch = { added: number; placed: number; waiting: number; skipped: number; at: number };

type ExecuteApi = {
  signing: Signing;
  update: (fn: (s: Signing) => Signing) => void;
  getBytes: (fileId: string) => Promise<Uint8Array | null>;
  addDocuments: (files: File[]) => Promise<string | null>;
  addReturns: (files: File[], target?: Placement) => Promise<void>;
  removeReturn: (id: string) => void;
  downloadCopy: (docId: string, partyId: string) => Promise<void>;
  downloadCopies: (docIds?: string[]) => Promise<void>;
  downloadPacks: (docId: string) => Promise<void>;
  downloadPack: (docId: string, partyId: string) => Promise<void>;
  /** Who signs, read from the agreement's parties clause and schedules. */
  readParties: (docId: string) => Promise<FoundParties | null>;
  /** Add the lawyer's signature page template (a PDF) to a document's setup. */
  addTemplate: (docId: string, file: File) => Promise<void>;
  /** The party name as printed on a template, to be replaced on each page. */
  setTemplateSample: (docId: string, templateId: string, sample: string) => Promise<void>;
  removeTemplate: (docId: string, templateId: string) => void;
  /** Make one signature page per party from the setup, and use them. */
  makePages: (docId: string) => Promise<void>;
  notify: (text: string) => void;
  busy: string | null;
  ocrQueue: number;
  saveState: SaveState;
  batch: Batch | null;
  clearBatch: () => void;
  close: () => void;
};

const Ctx = createContext<ExecuteApi | null>(null);

export function useExecute(): ExecuteApi {
  const api = useContext(Ctx);
  if (!api) throw new Error("useExecute outside ExecuteApp");
  return api;
}

const message = (err: unknown) => (err instanceof Error && err.message ? err.message : "Something went wrong with that file.");

export function ExecuteApp() {
  const [saved, setSaved] = useState<Signing[] | null>(null);
  const [signing, setSigning] = useState<Signing | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [busy, setBusy] = useState<string | null>(null);
  const [notices, setNotices] = useState<{ id: number; text: string }[]>([]);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [ocrQueue, setOcrQueue] = useState(0);
  const [sampleOpened, setSampleOpened] = useState(false);
  const signingRef = useRef<Signing | null>(null);
  signingRef.current = signing;
  const bytes = useRef(new Map<string, Uint8Array>());
  const storageOk = useRef(true);
  const ocrRunning = useRef(new Set<string>());

  const notify = useCallback((text: string) => setNotices((n) => [...n, { id: Date.now() + Math.random(), text }]), []);

  // Saved signings on this device.
  useEffect(() => {
    let live = true;
    void (async () => {
      const store = await loadStore();
      storageOk.current = await store.storageAvailable();
      const list = storageOk.current ? await store.listSignings() : [];
      if (live) setSaved(list);
    })().catch(() => live && setSaved([]));
    return () => {
      live = false;
    };
  }, []);

  // Save after every change, a moment after the user stops.
  useEffect(() => {
    if (!signing) return;
    if (!storageOk.current) {
      setSaveState("off");
      return;
    }
    setSaveState("unsaved");
    const handle = setTimeout(() => {
      setSaveState("saving");
      void loadStore()
        .then((store) => store.saveSigning(signing))
        .then(() => {
          setSaveState("saved");
          setSaved((list) => [signing, ...(list ?? []).filter((x) => x.id !== signing.id)]);
        })
        .catch(() => setSaveState("off"));
    }, 400);
    return () => clearTimeout(handle);
  }, [signing]);

  // Leaving with unsaved work asks first.
  useEffect(() => {
    if (!signing || saveState === "saved") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [signing, saveState]);

  const getBytes = useCallback(async (fileId: string) => {
    const cached = bytes.current.get(fileId);
    if (cached) return cached;
    const store = await loadStore();
    const loaded = storageOk.current ? await store.loadFile(fileId) : null;
    if (loaded) bytes.current.set(fileId, loaded);
    return loaded;
  }, []);

  const keep = useCallback(async (signingId: string, fileId: string, data: Uint8Array, type: string) => {
    bytes.current.set(fileId, data);
    if (!storageOk.current) return;
    try {
      const store = await loadStore();
      await store.saveFile(signingId, fileId, data, type);
      void store.requestPersistence();
    } catch {
      storageOk.current = false;
      setSaveState("off");
    }
  }, []);

  // Text recognition for scans and photos, one file at a time, in the background.
  useEffect(() => {
    if (!signing) return;
    const pending = signing.returns.filter((r) => r.textSource === "pending" && !ocrRunning.current.has(r.id));
    setOcrQueue(signing.returns.filter((r) => r.textSource === "pending").length);
    for (const r of pending) {
      ocrRunning.current.add(r.id);
      void (async () => {
        let text = "";
        try {
          const data = await getBytes(r.id);
          if (data) text = (await (await loadIntake()).ocrReturn(r.kind, data)).trim();
        } catch {
          text = "";
        } finally {
          ocrRunning.current.delete(r.id);
        }
        setSigning((s) => (s && s.returns.some((x) => x.id === r.id) ? updateReturnText(s, r.id, text || null, text ? "ocr" : "none", text ? readEStamp(text) : null) : s));
      })();
    }
  }, [signing, getBytes]);

  const startWith = useCallback(
    async (files: File[], name?: string): Promise<Signing | null> => {
      const s = createSigning(name ?? "Untitled signing");
      setSigning(s);
      signingRef.current = s;
      const docId = await addDocumentsTo(files);
      return docId ? signingRef.current : null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  async function addDocumentsTo(files: File[]): Promise<string | null> {
    const intake = await loadIntake();
    let first: string | null = null;
    for (const file of files) {
      setBusy(`Reading ${file.name}…`);
      try {
        const { bytes: data, pages } = await intake.readFinalDocument(file, (done, total) => setBusy(`Reading ${file.name}: page ${done} of ${total}`));
        const current = signingRef.current!;
        const fileId = newId("fil");
        await keep(current.id, fileId, data, "application/pdf");
        const next = addDocument(signingRef.current!, { fileId, fileName: file.name, pages });
        signingRef.current = next.signing;
        setSigning(next.signing);
        first ??= next.docId;
      } catch (err) {
        notify(message(err));
      }
    }
    setBusy(null);
    return first;
  }

  async function addReturnsTo(files: File[], target?: Placement) {
    const intake = await loadIntake();
    let added = 0;
    let skipped = 0;
    for (const [i, file] of files.entries()) {
      setBusy(`Reading ${i + 1} of ${files.length}: ${file.name}`);
      try {
        const id = newId("ret");
        const read = await intake.readReturn(file, id);
        const current = signingRef.current!;
        const same = current.returns.find((r) => r.hash === read.record.hash);
        if (same) {
          // The same scan dropped for a second party on a shared page: one file, both signatures.
          if (target?.status === "placed" && target.role === "signed" && same.placement.status === "placed" && same.placement.role === "signed") {
            const merged = [...new Set([...same.placement.partyIds, ...target.partyIds])];
            const next = placeReturn(current, same.id, { ...same.placement, partyIds: merged });
            signingRef.current = next;
            setSigning(next);
          } else {
            skipped += 1;
          }
          continue;
        }
        await keep(current.id, id, read.bytes, read.record.kind === "pdf" ? "application/pdf" : "image/jpeg");
        let next = addReturn(signingRef.current!, read.record);
        if (target && target.status === "placed") next = placeReturn(next, id, target);
        signingRef.current = next;
        setSigning(next);
        added += 1;
      } catch (err) {
        notify(message(err));
      }
    }
    setBusy(null);
    const now = signingRef.current!;
    const recent = now.returns.slice(-added);
    if (!target && added + skipped > 1) {
      setBatch({
        added,
        placed: recent.filter((r) => r.placement.status === "placed").length,
        waiting: recent.filter((r) => r.placement.status === "unplaced" && r.textSource !== "pending").length,
        skipped,
        at: Date.now(),
      });
    }
    if (skipped) notify(`${skipped} file${skipped === 1 ? " was" : "s were"} already in this signing and ${skipped === 1 ? "was" : "were"} skipped.`);
  }

  async function compilerFor(s: Signing, doc: SigningDocument) {
    const { createCompiler } = await import("@/lib/execute/render");
    const agreement = await getBytes(doc.fileId);
    if (!agreement) throw new Error(`The file for ${doc.title} is no longer on this device. Add it again.`);
    const made = doc.made ? await getBytes(doc.made.fileId) : null;
    if (doc.made && !made) throw new Error(`The signature pages made for ${doc.title} are no longer on this device. Make them again.`);
    const atts = new Map<string, RenderAttachment>();
    for (const r of s.returns) {
      if (r.placement.status !== "placed" || r.placement.docId !== doc.id) continue;
      const data = await getBytes(r.id);
      if (!data) throw new Error(`“${r.fileName}” is no longer on this device. Add it again.`);
      atts.set(r.id, {
        rotation: r.rotation,
        label: r.fileName,
        source:
          r.kind === "pdf" || !r.image
            ? { type: "pdf", bytes: data }
            : { type: "image", format: "jpg", bytes: data, width: r.image.width, height: r.image.height },
      });
    }
    return createCompiler(agreement, atts, made);
  }

  // Templates read this session: their positioned text, to find the name again when it is edited.
  const templates = useRef(new Map<string, ReadTemplate>());

  function withSetup(docId: string, fn: (setup: MakeSetup) => MakeSetup) {
    const s = signingRef.current!;
    const doc = s.documents.find((d) => d.id === docId);
    if (!doc?.setup) return;
    const next = saveMakeSetup(s, docId, fn(doc.setup));
    signingRef.current = next;
    setSigning(next);
  }

  async function templateRead(t: MakeTemplate): Promise<ReadTemplate | null> {
    const cached = templates.current.get(t.id);
    if (cached) return cached;
    const data = await getBytes(t.fileId);
    if (!data) return null;
    const read = await (await loadMake()).readTemplateBytes(data, t.fileName);
    templates.current.set(t.id, read);
    return read;
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

  const api: ExecuteApi | null = signing
    ? {
        signing,
        update: (fn) =>
          setSigning((s) => {
            const next = s ? fn(s) : s;
            signingRef.current = next;
            return next;
          }),
        getBytes,
        addDocuments: addDocumentsTo,
        addReturns: addReturnsTo,
        removeReturn: (id) => {
          forgetThumbnails(id);
          bytes.current.delete(id);
          setSigning((s) => (s ? dropReturn(s, id) : s));
          void loadStore().then((store) => store.deleteFile(id)).catch(() => undefined);
        },
        async downloadCopy(docId, partyId) {
          await run("Assembling the executed copy…", async () => {
            const s = signingRef.current!;
            const doc = s.documents.find((d) => d.id === docId)!;
            const c = await compilerFor(s, doc);
            const name = safeFileName(copyFileName(s, doc, partyId));
            const { saveBytes } = await loadSave();
            saveBytes(await c.build(planFor(s, doc, partyId), name.replace(/\.pdf$/i, "")), name);
          });
        },
        async downloadCopies(docIds) {
          await run("Assembling executed copies…", async () => {
            const s = signingRef.current!;
            const flags = signingFlags(s);
            const files: { name: string; bytes: Uint8Array }[] = [];
            const docs = s.documents.filter((d) => !docIds || docIds.includes(d.id));
            const folders = uniqueNames(docs.map((d) => safeFileName(d.title || "Agreement"))).map((n) => n.replace(/\.pdf$/i, ""));
            for (const [i, doc] of docs.entries()) {
              const ready = copyParties(doc).filter((p) => copyStatus(s, doc, p, flags).ready);
              if (!ready.length) continue;
              const c = await compilerFor(s, doc);
              const names = uniqueNames(ready.map((p) => safeFileName(copyFileName(s, doc, p))));
              for (const [k, partyId] of ready.entries()) {
                setBusy(`Assembling ${doc.title}: copy ${k + 1} of ${ready.length}`);
                files.push({ name: `${folders[i]}/${names[k]}`, bytes: await c.build(planFor(s, doc, partyId), names[k].replace(/\.pdf$/i, "")) });
              }
            }
            if (!files.length) throw new Error("No copy is complete yet. Each copy needs every countersigned page and its stamp paper.");
            const { buildClosingIndex } = await import("@/lib/execute/index-pdf");
            files.push({ name: "Closing index.pdf", bytes: await buildClosingIndex(s) });
            const { saveBytes, zip } = await loadSave();
            saveBytes(zip(files), safeFileName(`${s.name} - Executed copies`).replace(/\.pdf$/i, ".zip"), "application/zip");
          });
        },
        async downloadPacks(docId) {
          await run("Preparing signature pages…", async () => {
            const s = signingRef.current!;
            const doc = s.documents.find((d) => d.id === docId)!;
            const c = await compilerFor(s, doc);
            const parties = signingPartiesOf(doc);
            const names = uniqueNames(parties.map((p) => packFileName(s, doc, p)));
            const files = [];
            for (const [i, p] of parties.entries()) files.push({ name: names[i], bytes: await c.extract(pagesOf(doc, p), names[i].replace(/\.pdf$/i, "")) });
            const { saveBytes, zip } = await loadSave();
            saveBytes(zip(files), safeFileName(`${doc.title} - Signature pages`).replace(/\.pdf$/i, ".zip"), "application/zip");
          });
        },
        async downloadPack(docId, partyId) {
          await run("Preparing the signature page…", async () => {
            const s = signingRef.current!;
            const doc = s.documents.find((d) => d.id === docId)!;
            const c = await compilerFor(s, doc);
            const name = packFileName(s, doc, partyId);
            const { saveBytes } = await loadSave();
            saveBytes(await c.extract(pagesOf(doc, partyId), name.replace(/\.pdf$/i, "")), name);
          });
        },
        async readParties(docId) {
          const s = signingRef.current!;
          const doc = s.documents.find((d) => d.id === docId);
          if (!doc) return null;
          const data = await getBytes(doc.fileId);
          if (!data) {
            notify(`The file for ${doc.title} is no longer on this device. Add it again.`);
            return null;
          }
          setBusy(`Reading the parties in ${doc.title}…`);
          try {
            return await (await loadMake()).readAgreementParties(data, doc.title || "Agreement");
          } catch (err) {
            notify(message(err));
            return null;
          } finally {
            setBusy(null);
          }
        },
        async addTemplate(docId, file) {
          await run(`Reading ${file.name}…`, async () => {
            const make = await loadMake();
            const read = await make.readTemplate(file);
            const { findNameSlots } = await import("@/lib/execute/generate");
            const s = signingRef.current!;
            const id = newId("tpl");
            const fileId = newId("fil");
            await keep(s.id, fileId, read.bytes, "application/pdf");
            templates.current.set(id, read);
            const sample = read.guess ?? "";
            withSetup(docId, (setup) => ({
              ...setup,
              templates: [
                ...setup.templates,
                {
                  id,
                  label: file.name.replace(/\.pdf$/i, ""),
                  fileId,
                  fileName: file.name,
                  pageIndex: read.pageIndex,
                  sample,
                  slots: sample ? findNameSlots(read.items, sample, read.width) : [],
                  text: read.text,
                },
              ],
            }));
          });
        },
        async setTemplateSample(docId, templateId, sample) {
          const doc = signingRef.current!.documents.find((d) => d.id === docId);
          const t = doc?.setup?.templates.find((x) => x.id === templateId);
          if (!t) return;
          const read = await templateRead(t);
          const { findNameSlots } = await import("@/lib/execute/generate");
          const slots = read && sample.trim() ? findNameSlots(read.items, sample, read.width) : [];
          withSetup(docId, (setup) => ({
            ...setup,
            templates: setup.templates.map((x) => (x.id === templateId ? { ...x, sample, slots, residue: false } : x)),
          }));
        },
        removeTemplate(docId, templateId) {
          const doc = signingRef.current!.documents.find((d) => d.id === docId);
          const t = doc?.setup?.templates.find((x) => x.id === templateId);
          if (!t) return;
          templates.current.delete(templateId);
          withSetup(docId, (setup) => ({
            ...setup,
            templates: setup.templates.filter((x) => x.id !== templateId),
            parties: setup.parties.map((p) => (p.templateId === templateId ? { ...p, templateId: null } : p)),
          }));
          bytes.current.delete(t.fileId);
          void loadStore().then((store) => store.deleteFile(t.fileId)).catch(() => undefined);
        },
        async makePages(docId) {
          await run("Making the signature pages…", async () => {
            const s = signingRef.current!;
            const doc = s.documents.find((d) => d.id === docId)!;
            const setup = doc.setup;
            if (!setup) throw new Error("Choose who signs first.");
            const parties = setup.parties.filter((p) => p.name.trim());
            if (!parties.length) throw new Error("Add at least one party before making pages.");
            const gen = await import("@/lib/execute/generate");
            const sheets: import("@/lib/execute/generate").Sheet[] = [];
            const sheetTemplate: (string | null)[] = [];
            const specs = new Map<string, import("@/lib/execute/generate").TemplateSpec>();
            for (const p of parties) {
              if (setup.from === "template") {
                const t = setup.templates.find((x) => x.id === p.templateId) ?? setup.templates[0];
                if (!t) throw new Error("Add your signature page template (a PDF) first.");
                if (!t.slots.length) throw new Error(`Tell Agmt which name to replace on “${t.label}”: type it exactly as it is printed.`);
                let spec = specs.get(t.id);
                if (!spec) {
                  const data = await getBytes(t.fileId);
                  if (!data) throw new Error(`The template “${t.label}” is no longer on this device. Add it again.`);
                  spec = { bytes: data, pageIndex: t.pageIndex, sample: t.sample, slots: t.slots, text: t.text };
                  specs.set(t.id, spec);
                }
                sheets.push({ name: p.name.trim(), kind: "template", template: spec });
                sheetTemplate.push(t.id);
              } else {
                const format = setup.formats.find((f) => f.id === p.formatId) ?? setup.formats[0];
                sheets.push({ name: p.name.trim(), kind: "plain", body: format?.body ?? gen.PRESET_FORMATS.company.body });
                sheetTemplate.push(null);
              }
            }
            const { PDFDocument } = await import("pdf-lib");
            const agreement = await getBytes(doc.fileId);
            if (!agreement) throw new Error(`The file for ${doc.title} is no longer on this device. Add it again.`);
            const first = (await PDFDocument.load(agreement, { updateMetadata: false })).getPage(0).getSize();
            const built = await gen.buildSignaturePages({
              size: [first.width, first.height],
              sheets,
              footer: setup.from === "parties" && setup.useFooter && setup.footer.trim() ? setup.footer.trim() : null,
            });
            const fileId = newId("fil");
            await keep(s.id, fileId, built.bytes, "application/pdf");
            const old = doc.made?.fileId;
            const residueIds = new Set(built.residue.map((i) => sheetTemplate[i]));
            let next = applyMadePages(signingRef.current!, docId, {
              from: setup.from,
              fileId,
              key: setupKey(setup),
              sheets: sheets.map((sheet, i) => ({ name: sheet.name, text: built.texts[i] })),
            });
            next = saveMakeSetup(next, docId, { ...setup, templates: setup.templates.map((t) => ({ ...t, residue: residueIds.has(t.id) })) });
            signingRef.current = next;
            setSigning(next);
            if (old) {
              bytes.current.delete(old);
              void loadStore().then((store) => store.deleteFile(old)).catch(() => undefined);
            }
          });
        },
        notify,
        busy,
        ocrQueue,
        saveState,
        batch,
        clearBatch: () => setBatch(null),
        close: () => {
          setSigning(null);
          setBatch(null);
          setNotices([]);
        },
      }
    : null;

  const noticeList = notices.length ? (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-xl flex-col gap-2" role="alert">
      {notices.map((n) => (
        <div key={n.id} className="flex items-start justify-between gap-4 border border-oxblood bg-paper px-4 py-3 text-sm shadow-[0_8px_24px_rgba(28,25,23,0.12)]">
          <span>{n.text}</span>
          <button type="button" className="text-stone hover:text-ink" aria-label="Dismiss" onClick={() => setNotices((all) => all.filter((x) => x.id !== n.id))}>
            ×
          </button>
        </div>
      ))}
    </div>
  ) : null;

  if (!api) {
    return (
      <>
        <StartScreen
          saved={saved}
          busy={busy}
          storageOff={!storageOk.current}
          onStart={async (files, name) => {
            setSampleOpened(false);
            await startWith(files, name);
          }}
          onSample={async () => {
            setBusy("Preparing the sample signing…");
            setSampleOpened(true);
            try {
              const { buildSampleSigning } = await import("@/lib/execute/sample");
              const sample = await buildSampleSigning();
              const docs = sample.documents.map((d) => new File([d.bytes as BlobPart], d.name, { type: "application/pdf" }));
              const s = await startWith(docs, "Sample: Meridian Foods Series A");
              if (s) {
                await addReturnsTo(sample.returns.map((r) => new File([r.bytes as BlobPart], r.name, { type: "application/pdf" })));
              }
            } catch (err) {
              notify(message(err));
            } finally {
              setBusy(null);
            }
          }}
          onOpen={(s) => {
            setSampleOpened(false);
            setSigning(s);
          }}
          onDelete={async (s) => {
            const store = await loadStore();
            await store.deleteSigning(s.id);
            setSaved((list) => (list ?? []).filter((x) => x.id !== s.id));
          }}
        />
        {noticeList}
      </>
    );
  }

  return (
    <Ctx.Provider value={api}>
      <PageViewerProvider>
        <SigningView initialTab={sampleOpened ? "returns" : undefined} />
      </PageViewerProvider>
      {noticeList}
    </Ctx.Provider>
  );
}

/** Group a signing's parties per document for views that need both. */
export function useDocParties(doc: SigningDocument): string[] {
  return useMemo(() => signingPartiesOf(doc), [doc]);
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-6 text-stone">{children}</p>;
}
