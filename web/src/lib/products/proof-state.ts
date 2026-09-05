import type { RunSummary } from "./contracts.ts";

export function proofView(run: RunSummary, now: number) {
  if (run.status === "deleted" || now >= run.deadlines.accessDeadline) return { message: "This file is no longer available. Upload it again to run Proof.", download: false, delete: false };
  const messages = {
    uploading: "Uploading your document…", scanning: "Checking the uploaded file…", queued: "Your document is waiting to be checked.", processing: "Checking your agreement…", exporting: "Preparing your marked-up Word document…",
    ready: run.coverage === "limited" ? "Your document is ready with some checks incomplete." : run.correctionCount + run.commentCount ? "Your proofread document is ready." : "No issues found by the completed checks.",
    rejected: "This document could not be safely processed. Please choose another Word document.", failed: "We couldn’t complete Proof for this file.", deleting: "Deleting your files…",
  };
  return { message: messages[run.status], download: run.status === "ready", delete: run.status !== "deleting" };
}

export function selectedFileError(file: { name: string; size: number }): string | null {
  if (!/\.docx$/i.test(file.name)) return "Please upload the original Word (.docx) document.";
  if (file.size <= 0 || file.size > 25 * 1024 * 1024) return "Choose one Word document up to 25 MiB.";
  return null;
}
