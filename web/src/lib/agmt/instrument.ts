import type { Instrument, Provision } from "./types.ts";

export function detectInstrument(provisions: Provision[]): Instrument {
  const text = provisions
    .filter((p) => p.ownsText)
    .slice(0, 40)
    .map((p) => p.canonicalText)
    .join("\n")
    .toLowerCase();
  const head = text.slice(0, 4000);
  if (/\bdisclosure\s+letter\b/.test(head)) return "disclosure_letter";
  if (/\bshareholders[’']?\s+agreement\b|\bsha\b/.test(head) && !/\bshare\s+purchase\b/.test(head.slice(0, 400))) {
    return "sha";
  }
  if (/\bshare\s+subscription\s+agreement\b|\bssa\b/.test(head)) return "ssa";
  if (/\bshare\s+purchase\s+agreement\b|\bspa\b/.test(head)) return "spa";
  if (/\bshareholders/.test(head)) return "sha";
  return "unknown";
}

/** Null when the v1 Review route is supported. Slice 3 ships the run. */
export function reviewUnsupportedReason(
  instrument: Instrument,
  representedParty: string,
  stage: string,
): string | null {
  if (instrument === "spa") {
    return "SPA detected. Review is unsupported in v1. Proof remains available.";
  }
  if (instrument !== "sha") {
    return `Instrument ${instrument} is stored. v1 Review is SHA / Company / signing only.`;
  }
  if (representedParty !== "company" || stage !== "signing") {
    return "v1 Review is SHA / Company / signing only. Proof remains available.";
  }
  return null;
}
