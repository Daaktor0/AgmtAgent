import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { deleteMatter, getMatter, loadSampleSha, uploadDocument } from "@/lib/fn/agmt";
import { Shell } from "@/components/agmt/shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { Instrument } from "@/lib/agmt/types";

export const Route = createFileRoute("/matters/$matterId/")({ component: MatterPage });

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
      <main className="grid min-h-screen place-items-center bg-paper px-4">
        <div className="text-center">
          <p className="font-display text-3xl">Agmt</p>
          <p className="mt-2 text-sm text-ink-muted">Opening the Matter.</p>
        </div>
        {!isPending && !user ? <RedirectToSignIn /> : null}
      </main>
    );
  }
  if (data === null) {
    return (
      <Shell>
        <p className="text-sm text-ink-muted">Matter not found.</p>
        <Link to="/" className="mt-4 inline-block text-sm text-forest underline">
          Back to Matters
        </Link>
      </Shell>
    );
  }
  if (!data) {
    return (
      <Shell>
        <div className="h-40 animate-pulse rounded-[24px] bg-rule/40" />
      </Shell>
    );
  }

  return (
    <Shell>
      <Link to="/" className="text-sm text-ink-muted hover:text-ink">
        All Matters
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium">{data.name}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {data.representedParty} · {data.stage} · {(data.instruments as string[] | null)?.join(", ")}
          </p>
        </div>
        <Button
          variant="ghost"
          onClick={() => {
            if (!confirm("Revoke access now. Physical purge follows the 30-day retention window.")) return;
            void deleteMatter({ data: { matterId } }).then(() => {
              window.location.href = "/";
            });
          }}
        >
          Delete Matter
        </Button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <p className="text-xs uppercase tracking-wider text-ink-subtle">Mandate</p>
          <p className="mt-2 text-sm">
            Represented party <strong>{data.representedParty}</strong> at <strong>{data.stage}</strong>.
          </p>
          {data.mustProtectNotes ? (
            <p className="mt-2 text-sm text-ink-muted">{data.mustProtectNotes}</p>
          ) : (
            <p className="mt-2 text-sm text-ink-muted">No must-protect notes.</p>
          )}
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wider text-ink-subtle">Review</p>
          <p className="mt-2 text-sm text-ink-muted">{data.reviewGate}</p>
          <Button className="mt-4" disabled title={data.reviewGate ?? undefined}>
            Run Review — Slice 3
          </Button>
        </Card>
      </div>

      <section className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-2xl">Documents</h2>
          <p className="text-xs text-ink-muted">A Matter may hold more than one file.</p>
        </div>
        <Upload
          matterId={matterId}
          busy={busy}
          setBusy={setBusy}
          onDone={reload}
          setErr={setErr}
        />
        {err ? <p className="mt-3 text-sm text-danger">{err}</p> : null}
        <ul className="mt-4 space-y-3">
          {data.documents.length === 0 ? (
            <li className="text-sm text-ink-muted">No documents yet. Upload a native .docx or load the sample SHA.</li>
          ) : (
            data.documents.map((doc) => (
              <li key={doc.documentId}>
                <Link
                  to="/matters/$matterId/d/$documentId"
                  params={{ matterId, documentId: doc.documentId }}
                  className="block rounded-[16px] border border-rule bg-paper-elevated p-4 hover:border-rule-strong"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{doc.logicalName}</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge>{doc.role}</Badge>
                      <Badge tone={doc.detectedInstrument === "spa" ? "warn" : "neutral"}>
                        {doc.detectedInstrument}
                      </Badge>
                      <Badge
                        tone={
                          doc.ingestStatus === "indexed"
                            ? "ok"
                            : doc.ingestStatus === "refused"
                              ? "danger"
                              : "warn"
                        }
                      >
                        {doc.ingestStatus ?? "uploaded"}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    {doc.pageCount ?? "—"} pages · quality {doc.sourceQuality ?? "—"} · map{" "}
                    {doc.mapStatus ?? "—"} · Proof {doc.proofStatus ?? "not run"}
                  </p>
                </Link>
              </li>
            ))
          )}
        </ul>
      </section>
    </Shell>
  );
}

function Upload({
  matterId,
  busy,
  setBusy,
  onDone,
  setErr,
}: {
  matterId: string;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onDone: () => void;
  setErr: (v: string | null) => void;
}) {
  const [instrument, setInstrument] = useState<Instrument>("sha");

  async function handleFile(file: File) {
    setBusy(true);
    setErr(null);
    try {
      if (/\.pdf$/i.test(file.name)) {
        setErr("Upload the native Word (.docx) file.");
        return;
      }
      const bytesBase64 = await fileToBase64(file);
      const r = await uploadDocument({
        data: {
          matterId,
          logicalName: file.name.replace(/\.docx$/i, ""),
          role: "primary",
          userInstrument: instrument,
          fileName: file.name,
          bytesBase64,
        },
      });
      if ("message" in r && r.ok === false) setErr(r.message);
      else if ("refusal" in r && r.refused) setErr(r.refusal.message);
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-4 space-y-3">
      <p className="text-sm font-medium">Upload pack</p>
      <p className="text-sm text-ink-muted">Native .docx only. 80-page and 25 MiB caps. Same bytes on the same document are idempotent.</p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm">
          Instrument
          <select
            className="ml-2 h-11 rounded-[10px] border border-rule bg-paper-elevated px-3 text-sm"
            value={instrument}
            onChange={(e) => setInstrument(e.target.value as Instrument)}
          >
            <option value="sha">SHA</option>
            <option value="ssa">SSA</option>
            <option value="spa">SPA</option>
            <option value="disclosure_letter">Disclosure letter</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
        <Input
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setErr(null);
            void loadSampleSha({ data: { matterId } })
              .then(() => onDone())
              .catch((e: Error) => setErr(e.message))
              .finally(() => setBusy(false));
          }}
        >
          Load sample SHA
        </Button>
      </div>
    </Card>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}
