import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ProofFilePicker } from "@/components/agmt/proof-file-picker";
import { ProofIntro } from "@/components/agmt/proof-intro";
import { ProofOptions } from "@/components/agmt/proof-options";
import type { ProofLanguage, ProofProfile } from "@/lib/products/capabilities";
import { processProofInWorker, type LocalProofJob } from "@/lib/proof-local/client";
import { createProofRunSession } from "@/lib/proof-local/run-session";
import {
  PROOF_LOCAL_CANCELLED,
  PROOF_LOCAL_CHOOSE,
  PROOF_LOCAL_DEVICE,
  PROOF_LOCAL_NO_ACCOUNT,
  PROOF_LOCAL_SESSION_LOST,
} from "@/lib/proof-local/copy";
import { localProofError } from "@/lib/proof-local/errors";
import { publishedProofCapacityPolicy } from "@/lib/proof-local/policy";
import { persistentStorageSnapshot } from "@/lib/proof-local/isolation";
import type { LocalProofResult, LocalProofStage } from "@/lib/proof-local/pipeline";
import { sanitizeDownloadBasename } from "@/lib/products/use-proof-run";

const STAGE_COPY: Record<LocalProofStage, string> = {
  admitting: "Checking the file…",
  analyzing: "Checking your document…",
  exporting: "Preparing your Word document…",
  validating: "Checking the finished document…",
};

export function ProofLocalExperience() {
  const [file, setFile] = useState<File | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProofProfile>("agreement");
  const [language, setLanguage] = useState<ProofLanguage>("en-GB");
  const [stage, setStage] = useState<LocalProofStage | null>(null);
  const [result, setResult] = useState<LocalProofResult | null>(null);
  const [error, setError] = useState<{ heading: string; main: string } | null>(null);
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  const jobRef = useRef<LocalProofJob | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const runSessionRef = useRef(createProofRunSession());

  useEffect(() => () => {
    runSessionRef.current.invalidate();
    jobRef.current?.cancel();
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  function reset(keepFile = false) {
    runSessionRef.current.invalidate();
    jobRef.current?.cancel();
    jobRef.current = null;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    setResult(null);
    setStage(null);
    setError(null);
    setDownloadStarted(false);
    setBusy(false);
    if (!keepFile) {
      setFile(null);
      setSelectionError(null);
    }
  }

  async function proofread() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setDownloadStarted(false);
    setStage("admitting");
    const token = runSessionRef.current.begin();
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const job = processProofInWorker({
        bytes,
        profile,
        language,
        onStage: setStage,
      });
      jobRef.current = job;
      const next = await job.done;
      if (!runSessionRef.current.isActive(token)) return;
      const snapshot = persistentStorageSnapshot();
      if (snapshot.localStorage.length || snapshot.sessionStorage.length) {
        const leaked = [...snapshot.localStorage, ...snapshot.sessionStorage].some((key) => /proof|docx|document/i.test(key));
        if (leaked) throw new Error("document_storage_forbidden");
      }
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const blobBytes = new Uint8Array(next.output.byteLength);
      blobBytes.set(next.output);
      objectUrlRef.current = URL.createObjectURL(new Blob([blobBytes.buffer], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }));
      setResult(next);
      setStage(null);
    } catch (caught) {
      const mapped = localProofError(caught);
      setError({ heading: mapped.heading, main: mapped.code === "cancelled" ? PROOF_LOCAL_CANCELLED : mapped.main });
      setStage(null);
    } finally {
      jobRef.current = null;
      setBusy(false);
    }
  }

  function download() {
    if (!objectUrlRef.current || !result) return;
    const link = document.createElement("a");
    link.href = objectUrlRef.current;
    link.download = sanitizeDownloadBasename(file?.name);
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setDownloadStarted(true);
  }

  const running = busy && stage != null;
  const ready = result != null;
  const showSelect = !running && !ready;

  return (
    <div className="mx-auto w-full max-w-[720px] space-y-7">
      {showSelect ? <ProofIntro /> : null}
      {showSelect ? (
        <div className="space-y-6 border-y border-rule py-7">
          <ProofFilePicker
            selected={file ? { name: file.name, size: file.size } : null}
            error={selectionError}
            disabled={running}
            onSelect={setFile}
            onError={setSelectionError}
          />
          <ProofOptions profile={profile} language={language} disabled={busy} onProfile={setProfile} onLanguage={setLanguage} />
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button className="min-h-11 w-full sm:w-auto" disabled={!file || busy} onClick={() => void proofread()}>
              Proofread document
            </Button>
            {file ? (
              <Button className="min-h-11 w-full sm:w-auto" variant="secondary" disabled={busy} onClick={() => reset()}>
                Choose a different file
              </Button>
            ) : null}
          </div>
          {!file ? <p className="text-sm text-stone">{PROOF_LOCAL_NO_ACCOUNT}</p> : null}
          <details className="text-sm leading-6 text-stone">
            <summary className="min-h-11 cursor-pointer text-ink">Supported files</summary>
            <p className="mt-2">Native unencrypted transitional .docx up to {publishedProofCapacityPolicy().label} on this device. Macros, encryption, IRM, Strict OOXML, .doc, .docm, .dotx and PDF are refused. Headers, footnotes and fields are preserved but not fully checked in this beta. Proof also refuses packages that exceed its ZIP expansion, XML complexity or processing-time limits; text-heavy documents may stop earlier than the source-size ceiling. Open XML SDK and Microsoft Word checks are release tests, not a per-document production scan.</p>
          </details>
        </div>
      ) : null}
      {running ? (
        <section className="space-y-4" aria-live="polite" aria-atomic="true">
          <p className="text-sm" role="status">{STAGE_COPY[stage]}</p>
          <h1 className="font-display text-[32px] leading-tight sm:text-5xl">{STAGE_COPY[stage]}</h1>
          <p className="text-sm leading-6 text-stone">Keep this page open. Closing or refreshing it loses the current run.</p>
          <Button className="min-h-11 w-full sm:w-auto" variant="secondary" onClick={() => { jobRef.current?.cancel(); reset(true); setError({ heading: "Checking was cancelled.", main: PROOF_LOCAL_CANCELLED }); }}>
            Cancel
          </Button>
        </section>
      ) : null}
      {ready && result ? (
        <section className="space-y-6" aria-live="polite">
          <h1 className="font-display text-[32px] leading-tight sm:text-5xl">
            {result.coverage === "limited"
              ? "Your document is ready with limited coverage."
              : result.corrections + result.comments > 0
                ? "Your proofread document is ready."
                : "No issues found by the completed checks."}
          </h1>
          {result.coverage === "limited" ? (
            <p className="border-l-2 border-oxblood pl-4 text-sm leading-6">Proof skipped some parts. Review these parts yourself. Do not treat this as a clean result.</p>
          ) : null}
          {result.corrections + result.comments > 0 ? (
            <p className="text-base leading-7">{result.corrections} tracked corrections · {result.comments} comments to review</p>
          ) : (
            <p className="text-sm leading-6">This does not confirm that the document is error-free.</p>
          )}
          {result.coverageLines.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm leading-6">
              {result.coverageLines.map((line) => (
                <li key={`${line.kind}:${line.text}`}>{line.kind.replaceAll("_", " ")}: {line.text}</li>
              ))}
            </ul>
          ) : null}
          <p className="text-sm leading-6 text-stone">Review Agmt’s changes and comments in Word. {PROOF_LOCAL_DEVICE}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button className="min-h-11 w-full sm:w-auto" onClick={download}>Download Word document</Button>
            <Button className="min-h-11 w-full sm:w-auto" variant="secondary" onClick={() => reset()}>Check another document</Button>
          </div>
          {downloadStarted ? <p className="text-sm text-stone">Your download has started. Check your browser’s downloads.</p> : null}
        </section>
      ) : null}
      {error && !running ? (
        <div className="space-y-3" role="alert">
          <p className="text-sm">{error.heading}</p>
          <p className="text-sm leading-6 text-stone">{error.main}</p>
          <Button className="min-h-11 w-full sm:w-auto" variant="secondary" onClick={() => reset()}>{PROOF_LOCAL_CHOOSE}</Button>
        </div>
      ) : null}
      <p className="text-sm leading-6 text-stone">
        Proof checks a small list of common typos, repeated function words, unfinished placeholders, missing, ambiguous and cross-scope internal references, duplicate clause numbers, duplicate or inconsistent definitions, defined-term capitalisation, and title-case phrases that look defined but are not.
        It doesn’t provide a comprehensive legal review. You accept or reject proposed corrections in Word. Refreshing this page discards the current run. {PROOF_LOCAL_SESSION_LOST}{" "}
        <Link to="/proof/help" className="underline underline-offset-4">Help</Link>
        {import.meta.env.DEV ? <> · <Link to="/proof/dev" className="underline underline-offset-4">Development fixtures</Link></> : null}
      </p>
    </div>
  );
}
