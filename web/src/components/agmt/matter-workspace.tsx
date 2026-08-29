import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { deleteMatter, getMatter } from "@/lib/fn/agmt";
import { cleanupIncompleteUploads, uploadDocumentSafe } from "@/lib/fn/document-upload";
import { Shell } from "@/components/agmt/shell";
import type { Instrument } from "@/lib/agmt/types";

type MatterData = NonNullable<Awaited<ReturnType<typeof getMatter>>>;
type MatterDocument = MatterData["documents"][number];

const INSTRUMENT_OPTIONS: Array<{ value: Instrument; label: string }> = [
  { value: "sha", label: "Shareholders' agreement (SHA)" },
  { value: "ssa", label: "Share subscription agreement (SSA)" },
  { value: "spa", label: "Share purchase agreement (SPA)" },
  { value: "disclosure_letter", label: "Disclosure letter" },
  { value: "unknown", label: "Let Agmt identify it" },
];

function labelInstrument(value: string | null | undefined): string {
  switch (value) {
    case "sha": return "SHA";
    case "ssa": return "SSA";
    case "spa": return "SPA";
    case "disclosure_letter": return "Disclosure letter";
    case "unknown":
    case null:
    case undefined: return "Not identified";
    default: return value.replaceAll("_", " ");
  }
}

function titleCase(value: string | null | undefined): string {
  if (!value) return "Not set";
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}

function documentStatus(doc: MatterDocument): { label: string; detail: string } {
  if (!doc.currentVersionId) {
    return { label: "Upload incomplete", detail: "This incomplete test upload will be removed automatically." };
  }
  if (doc.ingestStatus === "refused") {
    return { label: "Needs attention", detail: "Agmt could not safely inspect this version. Open it for the reason." };
  }
  if (doc.proofStatus === "completed" || doc.proofStatus === "clear") {
    return { label: "Proof complete", detail: "Open the document to review the result." };
  }
  if (doc.mapStatus === "confirmed") {
    return { label: "Proof ready", detail: "The preparation step is complete. Open to continue with Proof." };
  }
  if (doc.mapStatus === "proposed" || doc.ingestStatus === "map_pending") {
    return { label: "Prepare for Proof", detail: "Open the document to confirm names and identifiers before Proof runs." };
  }
  return { label: "Processing", detail: "Agmt is preparing this document." };
}

export function MatterWorkspace({ matterId }: { matterId: string }) {
  const { user, isPending } = useCurrentUserState();
  const [data, setData] = useState<Awaited<ReturnType<typeof getMatter>> | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function reload() {
    try {
      await cleanupIncompleteUploads({ data: { matterId } });
    } catch {
      // Cleanup is maintenance, not a reason to hide the Matter.
    }
    try {
      setData(await getMatter({ data: { matterId } }));
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  useEffect(() => {
    if (!user) return;
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, matterId]);

  if (isPending || !user) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper px-5">
        <div className="text-center">
          <p className="inline-block border-b-2 border-oxblood pb-1 font-display text-4xl font-semibold tracking-[-0.04em]">Agmt</p>
          <p className="mt-4 text-sm text-stone">Opening the Matter.</p>
        </div>
        {!isPending && !user ? <RedirectToSignIn /> : null}
      </main>
    );
  }

  if (data === null) {
    return (
      <Shell>
        <div className="mx-auto max-w-xl py-20">
          <p className="text-[11px] uppercase tracking-[0.14em] text-stone">Matter unavailable</p>
          <h1 className="mt-3 font-display text-3xl">We could not find this Matter.</h1>
          <Link to="/" className="mt-6 inline-block text-sm font-medium text-oxblood underline underline-offset-4">Return to Matters</Link>
        </div>
      </Shell>
    );
  }

  if (!data) {
    return (
      <Shell>
        <div className="mx-auto max-w-[1260px]">
          <div className="h-44 animate-pulse border-y border-rule bg-paper-sunk/45" />
        </div>
      </Shell>
    );
  }

  const instruments = ((data.instruments as Instrument[] | null) ?? []).filter(Boolean);

  return (
    <Shell>
      <div className="mx-auto max-w-[1260px]">
        <header className="border-b border-rule pb-7">
          <Link to="/" className="text-[11px] uppercase tracking-[0.14em] text-stone no-underline hover:text-ink">Matters</Link>
          <div className="mt-4 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.14em] text-oxblood">Proof workspace</p>
              <h1 className="mt-2 break-words font-display text-[42px] leading-[1.05] tracking-[-0.025em] sm:text-[48px]">{data.name}</h1>
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-stone">
                <span>{titleCase(data.representedParty)} counsel</span><span>/</span><span>{titleCase(data.stage)}</span>
                {instruments.length ? <><span>/</span><span>{instruments.map(labelInstrument).join(" · ")}</span></> : null}
              </div>
            </div>
            <span className="text-xs text-stone tabular-nums">{data.documents.length} document{data.documents.length === 1 ? "" : "s"}</span>
          </div>
        </header>

        <div className="grid gap-10 pt-8 lg:grid-cols-[minmax(0,1fr)_330px] lg:gap-14">
          <section className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.14em] text-stone">Documents</p>
            <h2 className="mt-2 font-display text-[30px] leading-tight">Bring the agreement into Proof.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone">Upload the native Word file. Agmt first prepares a version-safe document map, then runs Proof against that confirmed version.</p>

            <DocumentUpload
              matterId={matterId}
              expectedInstruments={instruments}
              uploading={uploading}
              setUploading={setUploading}
              setError={setError}
            />

            {error ? (
              <div className="mt-4 border-l-2 border-oxblood bg-paper-sunk/45 px-4 py-3" role="alert">
                <p className="text-sm font-medium text-oxblood">We could not complete that action.</p>
                <p className="mt-1 text-xs leading-5 text-stone">{error}</p>
              </div>
            ) : null}

            <div className="mt-10">
              <div className="flex items-center justify-between border-b border-rule pb-3">
                <h3 className="font-display text-xl">Deal documents</h3>
                <span className="text-xs text-stone tabular-nums">{data.documents.length}</span>
              </div>
              {data.documents.length === 0 ? (
                <div className="border-b border-rule py-12">
                  <p className="font-display text-2xl">No documents yet.</p>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-stone">Choose a native .docx above. A document appears here only after Agmt has created a usable version for it.</p>
                </div>
              ) : (
                <ul className="divide-y divide-rule border-b border-rule">
                  {data.documents.map((doc) => {
                    const state = documentStatus(doc);
                    const body = (
                      <>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-medium">{doc.logicalName}</p>
                            <span className="border border-rule px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-stone">{labelInstrument(doc.detectedInstrument ?? doc.userInstrument)}</span>
                          </div>
                          <p className="mt-1.5 text-xs leading-5 text-stone">{state.detail}</p>
                        </div>
                        <div className="flex items-center gap-4 sm:justify-end">
                          {doc.pageCount ? <span className="hidden text-xs text-stone tabular-nums sm:inline">{doc.pageCount} page{doc.pageCount === 1 ? "" : "s"}</span> : null}
                          <span className={`text-xs font-medium ${doc.currentVersionId ? "text-ink" : "text-oxblood"}`}>{state.label}</span>
                          {doc.currentVersionId ? <span className="text-lg leading-none text-stone">→</span> : null}
                        </div>
                      </>
                    );
                    return (
                      <li key={doc.documentId}>
                        {doc.currentVersionId ? (
                          <Link to="/matters/$matterId/d/$documentId" params={{ matterId, documentId: doc.documentId }} className="group grid gap-4 py-5 text-ink no-underline transition-colors hover:bg-paper-sunk/35 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-3">{body}</Link>
                        ) : (
                          <div className="grid gap-4 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-3">{body}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          <aside className="space-y-8 lg:border-l lg:border-rule lg:pl-8">
            <section>
              <p className="text-[11px] uppercase tracking-[0.14em] text-stone">Matter brief</p>
              <dl className="mt-4 divide-y divide-rule border-y border-rule text-sm">
                <div className="grid grid-cols-[105px_1fr] gap-4 py-3.5"><dt className="text-stone">Representing</dt><dd className="font-medium">{titleCase(data.representedParty)}</dd></div>
                <div className="grid grid-cols-[105px_1fr] gap-4 py-3.5"><dt className="text-stone">Stage</dt><dd className="font-medium">{titleCase(data.stage)}</dd></div>
                <div className="grid grid-cols-[105px_1fr] gap-4 py-3.5"><dt className="text-stone">Instruments</dt><dd className="font-medium">{instruments.length ? instruments.map(labelInstrument).join(", ") : "Not set"}</dd></div>
              </dl>
              <div className="mt-5">
                <p className="text-xs font-medium">Must-protect position</p>
                <p className="mt-2 text-sm leading-6 text-stone">{data.mustProtectNotes || "No matter-specific position has been recorded."}</p>
              </div>
            </section>

            <section className="border-t border-rule pt-7">
              <div className="flex items-center justify-between gap-3"><p className="text-[11px] uppercase tracking-[0.14em] text-stone">Review</p><span className="border border-rule px-2 py-1 text-[9px] uppercase tracking-[0.12em] text-stone">Coming later</span></div>
              <p className="mt-3 text-sm leading-6 text-stone">Proof is the active mode for this release. Review will work from the same confirmed Matter and document set.</p>
            </section>

            <section className="border-t border-rule pt-7">
              <p className="text-[11px] uppercase tracking-[0.14em] text-stone">Matter controls</p>
              <button type="button" className="mt-3 text-sm text-oxblood underline decoration-oxblood/30 underline-offset-4 hover:decoration-oxblood" onClick={() => {
                if (!confirm("Delete this Matter? Access is revoked now and physical purge follows the retention window.")) return;
                void deleteMatter({ data: { matterId } }).then(() => { window.location.href = "/"; });
              }}>Delete Matter</button>
            </section>
          </aside>
        </div>
      </div>
    </Shell>
  );
}

function DocumentUpload({
  matterId,
  expectedInstruments,
  uploading,
  setUploading,
  setError,
}: {
  matterId: string;
  expectedInstruments: Instrument[];
  uploading: boolean;
  setUploading: (value: boolean) => void;
  setError: (value: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const initialInstrument = expectedInstruments.find((value) => value !== "unknown") ?? "unknown";
  const [instrument, setInstrument] = useState<Instrument>(initialInstrument);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    setSelectedName(file.name);
    try {
      const bytesBase64 = await fileToBase64(file);
      const result = await uploadDocumentSafe({
        data: {
          matterId,
          logicalName: file.name.replace(/\.docx$/i, ""),
          userInstrument: instrument,
          fileName: file.name,
          bytesBase64,
        },
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (result.refused) {
        // A refused version is intentionally persisted so the user can see why.
        window.location.assign(`/matters/${matterId}/d/${result.documentId}`);
        return;
      }
      window.location.assign(`/matters/${matterId}/d/${result.documentId}`);
    } catch (cause) {
      setError((cause as Error).message || "The document could not be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mt-6 border border-rule bg-paper-elevated">
      <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_260px] md:items-end">
        <div>
          <p className="text-sm font-medium">Add a Word document</p>
          <p className="mt-1.5 max-w-xl text-xs leading-5 text-stone">Native .docx only · up to 80 pages · up to 25 MiB. A failed preparation attempt will not leave a document behind.</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" disabled={uploading} className="min-h-10 border border-ink bg-transparent px-5 text-sm font-medium text-ink hover:bg-paper-sunk disabled:cursor-wait disabled:opacity-45" onClick={() => inputRef.current?.click()}>{uploading ? "Preparing document…" : "Choose .docx"}</button>
            <span className="max-w-[360px] truncate text-xs text-stone">{selectedName ?? "No file selected"}</span>
            <input ref={inputRef} className="sr-only" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={uploading} onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
              event.currentTarget.value = "";
            }} />
          </div>
        </div>
        <label className="block text-xs font-medium text-stone">
          Document type
          <select className="mt-2 h-10 w-full border border-rule bg-paper px-3 text-sm text-ink" value={instrument} disabled={uploading} onChange={(event) => setInstrument(event.target.value as Instrument)}>
            {INSTRUMENT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>
      <div className="border-t border-rule px-5 py-3 text-[11px] leading-5 text-stone sm:px-6">Your original file remains the source version. Proof does not silently replace it.</div>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(file);
  });
}
