import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { deleteMatter, getMatter, loadSampleSha, uploadDocument } from "@/lib/fn/agmt";
import { Shell } from "@/components/agmt/shell";
import { Button } from "@/components/ui/button";
import type { Instrument } from "@/lib/agmt/types";

export const Route = createFileRoute("/matters/$matterId/")({ component: MatterPage });

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
    case "sha":
      return "SHA";
    case "ssa":
      return "SSA";
    case "spa":
      return "SPA";
    case "disclosure_letter":
      return "Disclosure letter";
    case "unknown":
    case null:
    case undefined:
      return "Not identified";
    default:
      return value.replaceAll("_", " ");
  }
}

function labelParty(value: string | null | undefined): string {
  if (!value) return "Not set";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function labelStage(value: string | null | undefined): string {
  if (!value) return "Not set";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function documentStatus(doc: MatterDocument): { label: string; detail: string } {
  if (doc.ingestStatus === "refused") {
    return { label: "Needs attention", detail: "Agmt could not safely inspect this version." };
  }
  if (doc.proofStatus === "completed" || doc.proofStatus === "clear") {
    return { label: "Proof complete", detail: "Open to review the result." };
  }
  if (doc.mapStatus === "confirmed" || doc.ingestStatus === "indexed") {
    return { label: "Ready for Proof", detail: "The document has been indexed and is ready to inspect." };
  }
  return { label: "Uploaded", detail: "Open the document to continue preparation for Proof." };
}

function MatterPage() {
  const { matterId } = Route.useParams();
  const { user, isPending } = useCurrentUserState();
  const [data, setData] = useState<Awaited<ReturnType<typeof getMatter>> | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reload() {
    void getMatter({ data: { matterId } })
      .then(setData)
      .catch((e: Error) => setErr(e.message));
  }

  useEffect(() => {
    if (!user) return;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, matterId]);

  if (isPending || !user) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper px-5">
        <div className="text-center">
          <p className="inline-block border-b-2 border-oxblood pb-1 font-display text-4xl font-semibold tracking-[-0.04em]">
            Agmt
          </p>
          <p className="mt-4 text-sm text-stone">Opening the Matter.</p>
        </div>
        {!isPending && !user ? <RedirectToSignIn /> : null}
      </main>
    );
  }

  if (data === null) {
    return (
      <Shell>
        <div className="max-w-xl py-20">
          <p className="text-xs uppercase tracking-[0.14em] text-stone">Matter unavailable</p>
          <h1 className="mt-3 text-3xl">We could not find this Matter.</h1>
          <Link to="/" className="mt-6 inline-block text-sm font-medium text-oxblood underline underline-offset-4">
            Return to Matters
          </Link>
        </div>
      </Shell>
    );
  }

  if (!data) {
    return (
      <Shell>
        <div className="h-44 animate-pulse border-y border-rule bg-paper-sunk/45" />
      </Shell>
    );
  }

  const instruments = ((data.instruments as Instrument[] | null) ?? []).filter(Boolean);

  return (
    <Shell>
      <div className="mx-auto max-w-[1260px]">
        <div className="border-b border-rule pb-7">
          <Link
            to="/"
            className="text-[11px] uppercase tracking-[0.14em] text-stone no-underline hover:text-ink"
          >
            Matters
          </Link>

          <div className="mt-4 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.14em] text-oxblood">Proof workspace</p>
              <h1 className="mt-2 break-words font-display text-[42px] leading-[1.05] tracking-[-0.025em] sm:text-[48px]">
                {data.name}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-stone">
                <span>{labelParty(data.representedParty)} counsel</span>
                <span aria-hidden="true">/</span>
                <span>{labelStage(data.stage)}</span>
                {instruments.length ? (
                  <>
                    <span aria-hidden="true">/</span>
                    <span>{instruments.map((instrument) => labelInstrument(instrument)).join(" · ")}</span>
                  </>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3 text-xs text-stone">
              <span className="border border-rule px-2.5 py-1.5 uppercase tracking-[0.1em]">Active Matter</span>
              <span className="tabular-nums">
                {data.documents.length} document{data.documents.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        </div>

        <div className="grid gap-10 pt-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14">
          <section className="min-w-0">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-stone">Documents</p>
                <h2 className="mt-2 font-display text-[30px] leading-tight">Bring the deal pack into Proof.</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-stone">
                  Add the native Word file. Agmt preserves the original, prepares a structured view, and keeps every Proof result tied to this version.
                </p>
              </div>
            </div>

            <Upload
              matterId={matterId}
              busy={busy}
              setBusy={setBusy}
              onDone={reload}
              setErr={setErr}
              expectedInstruments={instruments}
            />

            {err ? (
              <div className="mt-4 border-l-2 border-oxblood bg-paper-sunk/40 px-4 py-3">
                <p className="text-sm font-medium text-oxblood">We could not complete that action.</p>
                <p className="mt-1 text-xs leading-5 text-stone">{err}</p>
              </div>
            ) : null}

            <div className="mt-9">
              <div className="flex items-center justify-between border-b border-rule pb-3">
                <h3 className="font-display text-xl">Deal documents</h3>
                <span className="text-xs text-stone tabular-nums">{data.documents.length}</span>
              </div>

              {data.documents.length === 0 ? (
                <div className="border-b border-rule py-12">
                  <p className="font-display text-2xl">No documents yet.</p>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-stone">
                    Add the first native .docx above. The document will appear here as soon as Agmt has a version to work from.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-rule border-b border-rule">
                  {data.documents.map((doc) => {
                    const state = documentStatus(doc);
                    return (
                      <li key={doc.documentId}>
                        <Link
                          to="/matters/$matterId/d/$documentId"
                          params={{ matterId, documentId: doc.documentId }}
                          className="group grid gap-4 py-5 text-ink no-underline transition-colors hover:bg-paper-sunk/35 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-3"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-medium group-hover:text-oxblood">{doc.logicalName}</p>
                              <span className="border border-rule px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-stone">
                                {labelInstrument(doc.detectedInstrument ?? doc.userInstrument)}
                              </span>
                            </div>
                            <p className="mt-1.5 text-xs leading-5 text-stone">{state.detail}</p>
                          </div>

                          <div className="flex items-center gap-4 sm:justify-end">
                            {doc.pageCount ? (
                              <span className="hidden text-xs text-stone tabular-nums sm:inline">
                                {doc.pageCount} page{doc.pageCount === 1 ? "" : "s"}
                              </span>
                            ) : null}
                            <span className="text-xs font-medium text-ink">{state.label}</span>
                            <span className="text-lg leading-none text-stone transition-transform group-hover:translate-x-0.5" aria-hidden="true">
                              →
                            </span>
                          </div>
                        </Link>
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
                <div className="grid grid-cols-[110px_1fr] gap-4 py-3.5">
                  <dt className="text-stone">Representing</dt>
                  <dd className="font-medium">{labelParty(data.representedParty)}</dd>
                </div>
                <div className="grid grid-cols-[110px_1fr] gap-4 py-3.5">
                  <dt className="text-stone">Stage</dt>
                  <dd className="font-medium">{labelStage(data.stage)}</dd>
                </div>
                <div className="grid grid-cols-[110px_1fr] gap-4 py-3.5">
                  <dt className="text-stone">Instruments</dt>
                  <dd className="font-medium">
                    {instruments.length ? instruments.map((instrument) => labelInstrument(instrument)).join(", ") : "Not set"}
                  </dd>
                </div>
              </dl>

              <div className="mt-5">
                <p className="text-xs font-medium">Must-protect position</p>
                <p className="mt-2 text-sm leading-6 text-stone">
                  {data.mustProtectNotes || "No matter-specific position has been recorded."}
                </p>
              </div>
            </section>

            <section className="border-t border-rule pt-7">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-stone">Review</p>
                <span className="border border-rule px-2 py-1 text-[9px] uppercase tracking-[0.12em] text-stone">Coming later</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-stone">
                Proof is the active mode for this release. Review will use the confirmed Matter and document set when it becomes available.
              </p>
            </section>

            <section className="border-t border-rule pt-7">
              <p className="text-[11px] uppercase tracking-[0.14em] text-stone">Matter controls</p>
              <button
                type="button"
                className="mt-3 text-sm text-oxblood underline decoration-oxblood/30 underline-offset-4 hover:decoration-oxblood"
                onClick={() => {
                  if (!confirm("Delete this Matter? Access is revoked now and physical purge follows the retention window.")) return;
                  void deleteMatter({ data: { matterId } }).then(() => {
                    window.location.href = "/";
                  });
                }}
              >
                Delete Matter
              </button>
            </section>
          </aside>
        </div>
      </div>
    </Shell>
  );
}

function Upload({
  matterId,
  busy,
  setBusy,
  onDone,
  setErr,
  expectedInstruments,
}: {
  matterId: string;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onDone: () => void;
  setErr: (v: string | null) => void;
  expectedInstruments: Instrument[];
}) {
  const initialInstrument = expectedInstruments.find((value) => value !== "unknown") ?? "unknown";
  const [instrument, setInstrument] = useState<Instrument>(initialInstrument);

  async function handleFile(file: File) {
    setBusy(true);
    setErr(null);
    try {
      if (/\.pdf$/i.test(file.name)) {
        setErr("Please use the native Word (.docx) file rather than a PDF.");
        return;
      }
      const bytesBase64 = await fileToBase64(file);
      const result = await uploadDocument({
        data: {
          matterId,
          logicalName: file.name.replace(/\.docx$/i, ""),
          role: "primary",
          userInstrument: instrument,
          fileName: file.name,
          bytesBase64,
        },
      });
      if ("message" in result && result.ok === false) setErr(result.message);
      else if ("refusal" in result && result.refused) setErr(result.refusal.message);
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 border border-rule bg-paper-elevated">
      <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_270px] md:items-end">
        <div>
          <p className="text-sm font-medium">Add a Word document</p>
          <p className="mt-1.5 max-w-xl text-xs leading-5 text-stone">
            Native .docx only · up to 80 pages · up to 25 MiB. Your original file is retained as the source version.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label
              className={`inline-flex min-h-10 items-center justify-center border border-oxblood bg-oxblood px-5 text-sm font-medium text-paper transition-colors ${
                busy ? "pointer-events-none opacity-50" : "cursor-pointer hover:bg-oxblood-pressed"
              }`}
            >
              <input
                type="file"
                className="sr-only"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                  e.currentTarget.value = "";
                }}
              />
              {busy ? "Adding document…" : "Choose .docx"}
            </label>

            <button
              type="button"
              disabled={busy}
              className="text-xs text-stone underline decoration-rule-strong/40 underline-offset-4 hover:text-ink disabled:opacity-40"
              onClick={() => {
                setBusy(true);
                setErr(null);
                void loadSampleSha({ data: { matterId } })
                  .then(() => onDone())
                  .catch((e: Error) => setErr(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              Use sample SHA for testing
            </button>
          </div>
        </div>

        <label className="block">
          <span className="text-[11px] uppercase tracking-[0.12em] text-stone">Document type</span>
          <select
            className="mt-2 h-11 w-full border border-rule bg-paper px-3 text-sm outline-none focus:border-rule-strong"
            value={instrument}
            onChange={(e) => setInstrument(e.target.value as Instrument)}
          >
            {INSTRUMENT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
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
