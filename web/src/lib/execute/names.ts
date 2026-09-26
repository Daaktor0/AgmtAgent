/** File-name suggestions and filename-to-party matching. All editable by the user. */

export type CopyType = "original" | "counterpart" | "none";

/** "SHA_ABC Pvt Ltd_Execution Version_v7 (2).pdf" -> "SHA ABC Pvt Ltd" */
export function titleFromFileName(fileName: string): string {
  let s = fileName.replace(/\.[a-z0-9]+$/i, "");
  s = s.replace(/[_]+/g, " ");
  s = s.replace(/\((?:\d+|clean|final)\)/gi, " ");
  s = s.replace(/\b(?:final|clean|execution|exec|version|draft|agreed form|agreed|signing|v\d+(?:\.\d+)*)\b/gi, " ");
  s = s.replace(/\s*-\s*(?=-|$)/g, " ");
  s = s.replace(/\s+/g, " ").replace(/^[\s\-–,.]+|[\s\-–,.]+$/g, "");
  return s || "Agreement";
}

/** Characters Windows, macOS and email clients all accept in a file name. */
export function safeFileName(name: string): string {
  const printable = Array.from(name, (c) => (c.charCodeAt(0) < 32 ? " " : c)).join("");
  const base = printable
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  const stem = base.replace(/\.pdf$/i, "").trim() || "document";
  return `${stem.slice(0, 180)}.pdf`;
}

export function executedCopyName(title: string, party: string, copy: CopyType): string {
  const label = copy === "original" ? "Executed Original" : "Executed Counterpart";
  return safeFileName(`${title} - ${label} - ${party}`);
}

export function signaturePackName(title: string, party: string): string {
  return safeFileName(`${title} - Signature Page - ${party}`);
}

/** Make every name in a zip distinct: "x.pdf", "x (2).pdf", ... */
export function uniqueNames(names: string[]): string[] {
  const used = new Map<string, number>();
  return names.map((name) => {
    const key = name.toLowerCase();
    const n = (used.get(key) ?? 0) + 1;
    used.set(key, n);
    return n === 1 ? name : name.replace(/\.pdf$/i, ` (${n}).pdf`);
  });
}

const STOP = new Set([
  "private", "limited", "pvt", "ltd", "llp", "the", "and", "of", "mr", "mrs", "ms", "dr",
  "inc", "llc", "co", "company", "fund", "trust", "i", "ii", "iii", "iv", "a", "an",
  "signed", "signature", "page", "stamp", "paper", "estamp", "executed", "copy", "scan",
  "pdf", "final", "sha", "ssa", "spa", "agreement",
]);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/**
 * Which party does a returned file most likely belong to, judging only by its
 * name? Returns an id only when one party clearly wins; a tie is no guess.
 */
export function matchPartyByFileName(
  fileName: string,
  parties: { id: string; name: string }[],
): string | null {
  const fileTokens = new Set(tokens(fileName));
  let best: string | null = null;
  let bestScore = 0;
  let tie = false;
  for (const party of parties) {
    const score = tokens(party.name).filter((t) => fileTokens.has(t)).length;
    if (score > bestScore) {
      best = party.id;
      bestScore = score;
      tie = false;
    } else if (score === bestScore && score > 0) {
      tie = true;
    }
  }
  return bestScore > 0 && !tie ? best : null;
}

export type AttachmentRole = "signed" | "stamp";

export function guessRoleByFileName(fileName: string): AttachmentRole | null {
  const s = fileName.toLowerCase();
  if (/stamp|non[\s_-]?judicial|e[\s_-]?stamp/.test(s)) return "stamp";
  if (/sign|executed|counter|\bsig\b|\bcs\b/.test(s)) return "signed";
  return null;
}
