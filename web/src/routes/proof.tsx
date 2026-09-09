import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Shell } from "@/components/agmt/shell";
import { ProofAccessGate } from "@/components/agmt/proof-access-gate";
import { ProofActiveRuns } from "@/components/agmt/proof-active-runs";
import { ProofDeleteDialog } from "@/components/agmt/proof-delete-dialog";
import { ProofFeedback } from "@/components/agmt/proof-feedback";
import { ProofFilePicker } from "@/components/agmt/proof-file-picker";
import { ProofIntro } from "@/components/agmt/proof-intro";
import { ProofOptions } from "@/components/agmt/proof-options";
import { ProofResultSummary } from "@/components/agmt/proof-result-summary";
import { ProofRunView } from "@/components/agmt/proof-run";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { parseProofCapabilities, PROOF_CAPABILITIES_FALLBACK, proofAvailabilityCopy, type ProofCapabilitiesV2, type ProofLanguage, type ProofProfile } from "@/lib/products/capabilities";
import { parseRunSummaryV2, type RunSummaryV2 } from "@/lib/products/api-contracts";
import { presentProofRun, type ProofAuthKind, type ProofLocalContext } from "@/lib/products/proof-state";
import {
  clearProofRunPointer,
  errorFromResponse,
  idempotencyKeyFor,
  loadProofRunPointer,
  mergePolledSummary,
  putSourceWithProgress,
  saveProofRunPointer,
  sanitizeDownloadBasename,
  sha256Hex,
  type ProofClientError,
} from "@/lib/products/use-proof-run";

const RUN_ID = /^[A-Za-z0-9_-]{16,64}$/;

export const Route = createFileRoute("/proof")({
  validateSearch: (search: Record<string, unknown>): { run?: string } => ({
    run: typeof search.run === "string" && RUN_ID.test(search.run) ? search.run : undefined,
  }),
  component: Proof,
});

async function loadProofCapabilities(): Promise<ProofCapabilitiesV2> {
  try {
    const response = await fetch("/api/proof/capabilities", { cache: "no-store" });
    if (!response.ok) return PROOF_CAPABILITIES_FALLBACK;
    return parseProofCapabilities(await response.json());
  } catch {
    return PROOF_CAPABILITIES_FALLBACK;
  }
}

function authKind(user: ReturnType<typeof useCurrentUserState>["user"], pending: boolean, loadingMs: number): ProofAuthKind {
  if (pending && loadingMs < 15_000) return "loading";
  if (pending) return "unavailable";
  if (!user || user.isDevFallback) return "signed_out";
  if (!user.emailVerified) return "unverified";
  return "verified";
}

function Proof() {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [file, setFile] = useState<File | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProofProfile>("agreement");
  const [language, setLanguage] = useState<ProofLanguage>("en-GB");
  const [capabilities, setCapabilities] = useState<ProofCapabilitiesV2>(PROOF_CAPABILITIES_FALLBACK);
  const [summary, setSummary] = useState<RunSummaryV2 | null>(null);
  const [activeRuns, setActiveRuns] = useState<RunSummaryV2[]>([]);
  const [busy, setBusy] = useState(false);
  const [clientError, setClientError] = useState<ProofClientError | null>(null);
  const [authLoadingMs, setAuthLoadingMs] = useState(0);
  const [verificationSent, setVerificationSent] = useState(false);
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [connectionLost, setConnectionLost] = useState(false);
  const [unknownRun, setUnknownRun] = useState(false);
  const [uploading, setUploading] = useState<{ sent: number; total: number } | null>(null);
  const [processingUnavailable, setProcessingUnavailable] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const paused = proofAvailabilityCopy(capabilities.acceptingUploads);
  const auth = authKind(user, isPending, authLoadingMs);
  const returnTo = search.run ? `/proof?run=${search.run}` : "/proof";

  useEffect(() => { void loadProofCapabilities().then(setCapabilities); }, []);
  useEffect(() => {
    if (!isPending) return;
    const started = Date.now();
    const timer = window.setInterval(() => setAuthLoadingMs(Date.now() - started), 1000);
    return () => window.clearInterval(timer);
  }, [isPending]);
  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  const applySummary = useCallback((incoming: RunSummaryV2) => {
    setSummary((previous) => mergePolledSummary(previous, incoming));
    setUnknownRun(false);
    setConnectionLost(false);
  }, []);

  const fetchStatus = useCallback(async (runId: string) => {
    try {
      const response = await fetch(`/api/proof/runs/${runId}`, { cache: "no-store" });
      if (response.status === 404) {
        setUnknownRun(true);
        setSummary(null);
        return;
      }
      if (!response.ok) {
        setConnectionLost(true);
        return;
      }
      applySummary(parseRunSummaryV2(await response.json()));
    } catch {
      setConnectionLost(true);
    }
  }, [applySummary]);

  useEffect(() => {
    if (!search.run) {
      const pointer = loadProofRunPointer(typeof sessionStorage === "undefined" ? null : sessionStorage);
      if (pointer) void navigate({ to: "/proof", search: { run: pointer.runId }, replace: true });
      return;
    }
    void fetchStatus(search.run);
  }, [search.run, fetchStatus, navigate]);

  useEffect(() => {
    if (auth !== "verified") return;
    void fetch("/api/proof/runs", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const body = await response.json();
        if (!Array.isArray(body)) return;
        setActiveRuns(body.flatMap((item) => {
          try { return [parseRunSummaryV2(item)]; } catch { return []; }
        }));
      })
      .catch(() => undefined);
  }, [auth, summary?.status]);

  useEffect(() => {
    if (!summary || ["ready", "rejected", "failed", "deleted", "deleting"].includes(summary.status)) return;
    let delay = 2000;
    let timer: number;
    const tick = () => {
      void fetchStatus(summary.runId);
      delay = Math.min(delay + 2000, 10_000);
      timer = window.setTimeout(tick, delay);
    };
    timer = window.setTimeout(tick, delay);
    const onFocus = () => void fetchStatus(summary.runId);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [summary, fetchStatus]);

  const local: ProofLocalContext = useMemo(() => ({
    auth,
    authLoadingMs,
    verificationSent,
    selected: file ? { name: file.name, size: file.size } : null,
    uploadsPaused: !capabilities.acceptingUploads,
    connectionLost,
    downloadStarted,
    deleteConfirming,
    unknownRun,
    uploading,
    processingUnavailable,
  }), [auth, authLoadingMs, verificationSent, file, capabilities.acceptingUploads, connectionLost, downloadStarted, deleteConfirming, unknownRun, uploading, processingUnavailable]);

  const view = presentProofRun(summary, local);

  async function submit() {
    if (!file || auth !== "verified" || !capabilities.acceptingUploads) return;
    setBusy(true);
    setClientError(null);
    setProcessingUnavailable(false);
    try {
      const latest = await loadProofCapabilities();
      setCapabilities(latest);
      if (!latest.acceptingUploads) {
        setClientError({ code: "uploads_paused", status: 503, retryable: true, message: "uploads_paused" });
        return;
      }
      const bytes = await file.arrayBuffer();
      const sha256 = await sha256Hex(bytes);
      const key = idempotencyKeyFor(sha256, profile, language);
      const created = await fetch("/api/proof/runs", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": key },
        body: JSON.stringify({ sizeBytes: file.size, sha256, profile, language }),
      });
      const createdBody = await created.json();
      if (!created.ok) {
        setClientError(errorFromResponse(created.status, createdBody));
        return;
      }
      const createdSummary = parseRunSummaryV2(createdBody);
      applySummary(createdSummary);
      saveProofRunPointer(sessionStorage, {
        runId: createdSummary.runId,
        profile,
        language,
        idempotencyKey: key,
        sourceSha256: sha256,
      });
      await navigate({ to: "/proof", search: { run: createdSummary.runId }, replace: true });
      abortRef.current = new AbortController();
      setUploading({ sent: 0, total: bytes.byteLength });
      const put = await putSourceWithProgress({
        url: `/api/proof/runs/${createdSummary.runId}/source`,
        bytes,
        signal: abortRef.current.signal,
        onProgress: setUploading,
      });
      const putBody = await put.json();
      if (!put.ok) {
        const error = errorFromResponse(put.status, putBody);
        setClientError(error);
        if (error.code === "processing_unavailable") setProcessingUnavailable(true);
        setUploading(null);
        return;
      }
      applySummary(parseRunSummaryV2(putBody));
      setUploading(null);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setClientError({ code: "upload_cancelled", status: 499, retryable: true, message: "upload_cancelled" });
      } else {
        setConnectionLost(true);
      }
      setUploading(null);
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    if (!summary?.download.available) return;
    setBusy(true);
    try {
      const ticket = await fetch(`/api/proof/runs/${summary.runId}/download-ticket`, { method: "POST" });
      const ticketBody = await ticket.json() as { token?: string };
      if (!ticket.ok || !ticketBody.token) {
        setClientError(errorFromResponse(ticket.status, ticketBody));
        return;
      }
      const response = await fetch(`/api/proof/runs/${summary.runId}/download`, {
        method: "POST",
        headers: { "x-proof-download-ticket": ticketBody.token },
      });
      if (!response.ok) {
        setClientError(errorFromResponse(response.status, await response.json().catch(() => ({}))));
        return;
      }
      const blob = await response.blob();
      if (blob.size > 35 * 1024 * 1024) {
        setClientError({ code: "output_too_large", status: 500, retryable: false, message: "output_too_large" });
        return;
      }
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      const link = document.createElement("a");
      link.href = url;
      link.download = sanitizeDownloadBasename(file?.name);
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setDownloadStarted(true);
    } catch {
      setConnectionLost(true);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!summary) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/proof/runs/${summary.runId}`, { method: "DELETE" });
      if (!response.ok) {
        setClientError(errorFromResponse(response.status, await response.json().catch(() => ({}))));
        return;
      }
      applySummary(parseRunSummaryV2(await response.json()));
      setDeleteConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  function startAnother() {
    clearProofRunPointer(typeof sessionStorage === "undefined" ? null : sessionStorage);
    setSummary(null);
    setFile(null);
    setDownloadStarted(false);
    setDeleteConfirming(false);
    setUnknownRun(false);
    setProcessingUnavailable(false);
    setClientError(null);
    void navigate({ to: "/proof", search: {}, replace: true });
  }

  const showSelect = !summary && !unknownRun;
  const columnClass = summary && ["ready_findings", "ready_zero", "limited", "download_started"].includes(view.state)
    ? "mx-auto w-full max-w-[960px] space-y-7"
    : "mx-auto w-full max-w-[720px] space-y-7";

  return (
    <Shell>
      <div className={columnClass}>
        {showSelect ? <ProofIntro /> : null}
        {paused ? (
          <div className="space-y-1 text-sm" role="status">
            <p>{paused.heading}</p>
            <p className="text-stone">{paused.detail}</p>
          </div>
        ) : null}
        <ProofAccessGate auth={auth} verificationSent={verificationSent} returnTo={returnTo} />
        {showSelect ? (
          <div className="space-y-6 border-y border-rule py-7">
            <ProofFilePicker
              selected={file ? { name: file.name, size: file.size } : null}
              error={selectionError}
              disabled={false}
              onSelect={setFile}
              onError={setSelectionError}
            />
            <ProofOptions profile={profile} language={language} disabled={busy} onProfile={setProfile} onLanguage={setLanguage} />
            <ProofRunView
              run={null}
              local={local}
              busy={busy}
              handlers={{
                onProofread: () => void submit(),
                onChooseFile: () => document.querySelector<HTMLInputElement>("input[type=file][accept*='docx']")?.click(),
                onSignIn: () => { window.location.href = `/login?returnTo=${encodeURIComponent(returnTo)}`; },
                onVerify: () => window.location.reload(),
                onResend: () => setVerificationSent(true),
              }}
            />
            <details className="text-sm leading-6 text-stone">
              <summary className="min-h-11 cursor-pointer text-ink">Supported files</summary>
              <p className="mt-2">Native unencrypted transitional .docx. Macros, encryption, IRM, Strict OOXML, .doc, .docm, .dotx and PDF are refused. Headers, footnotes and fields are preserved but not fully checked in this beta.</p>
            </details>
          </div>
        ) : (
          <ProofRunView
            run={summary}
            local={local}
            busy={busy}
            handlers={{
              onDownload: () => void download(),
              onDelete: () => setDeleteConfirming(true),
              onRetry: () => void submit(),
              onCheckStatus: () => summary && void fetchStatus(summary.runId),
              onCancelUpload: () => abortRef.current?.abort(),
              onKeepFiles: () => setDeleteConfirming(false),
              onStartAnother: startAnother,
              onChooseFile: startAnother,
            }}
          />
        )}
        {view.counts ? <ProofResultSummary view={view} /> : null}
        {clientError ? (
          <p role="alert" className="text-sm text-oxblood">
            {clientError.code === "uploads_paused"
              ? "Proof is temporarily unavailable for new uploads."
              : clientError.code === "processing_unavailable"
                ? "Processing is not connected in this environment. This is not a completed Proof run."
                : clientError.code === "upload_cancelled"
                  ? "Upload cancelled. You can choose the file again."
                  : "This request could not be completed."}
          </p>
        ) : null}
        {summary && ["ready_findings", "ready_zero", "limited"].includes(view.state) ? (
          <ProofFeedback
            disabled={busy}
            onSubmit={async (input) => {
              const response = await fetch(`/api/proof/runs/${summary.runId}/feedback`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(input),
              });
              if (!response.ok) throw new Error("feedback_failed");
            }}
          />
        ) : null}
        <ProofActiveRuns runs={activeRuns} />
        <p className="text-sm leading-6 text-stone">
          Proof checks a small list of common typos, repeated function words, unfinished placeholders, missing internal references, duplicate clause numbers and duplicate definitions.
          It doesn’t provide a comprehensive legal review. You accept or reject proposed corrections in Word.{" "}
          <Link to="/proof/help" className="underline underline-offset-4">Help</Link>
          {import.meta.env.DEV ? <> · <Link to="/proof/dev" className="underline underline-offset-4">Development fixtures</Link></> : null}
        </p>
      </div>
      <ProofDeleteDialog
        open={deleteConfirming}
        busy={busy}
        onKeep={() => setDeleteConfirming(false)}
        onConfirm={() => void confirmDelete()}
      />
    </Shell>
  );
}
