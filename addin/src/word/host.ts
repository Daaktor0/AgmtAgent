/**
 * Agmt Word host helpers.
 *
 * Tracking-mode serialisation and protected-document detection are adapted
 * from Vaquill AI ms-word-addin (Apache-2.0). See THIRD_PARTY_NOTICES.md.
 * Modified for Agmt: no office-word-diff, no bulk apply, no fuzzy mutation.
 */

export class AgmtWordError extends Error {
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "AgmtWordError";
    this.code = code;
  }
}

export function isWordHost(): boolean {
  return typeof Office !== "undefined" && Office.context?.host === Office.HostType.Word;
}

export function apiSet(ver: string): boolean {
  try {
    return Office.context.requirements.isSetSupported("WordApi", ver);
  } catch {
    return false;
  }
}

let trackChain: Promise<unknown> = Promise.resolve();

/** Serialize ops that flip Word's global tracking state. */
export function serializeTrackChanges<T>(fn: () => Promise<T>): Promise<T> {
  const run = trackChain.then(fn, fn);
  trackChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

const PROTECTED_DOC_MESSAGE =
  "This document is protected or read-only, so changes cannot be applied.";

function looksProtected(code: string, message: string): boolean {
  if (code === "AccessDenied") return true;
  const haystack = `${code} ${message}`.toLowerCase();
  return (
    haystack.includes("accessdenied") ||
    haystack.includes("permission") ||
    haystack.includes("protect") ||
    haystack.includes("read-only") ||
    haystack.includes("readonly")
  );
}

export function isProtectionError(e: unknown): boolean {
  const err = e as { message?: string; code?: string } | null;
  return looksProtected(err?.code ?? "", err?.message ?? "");
}

const SECURITY_EDIT_BLOCKED = 2 | 4 | 8;

export async function documentLooksProtected(): Promise<boolean> {
  try {
    return await Word.run(async (context) => {
      const props = context.document.properties;
      props.load("security");
      await context.sync();
      return (props.security & SECURITY_EDIT_BLOCKED) !== 0;
    });
  } catch {
    return false;
  }
}

export async function runWord<T>(
  fn: (context: Word.RequestContext) => Promise<T>,
): Promise<T> {
  try {
    return await Word.run(fn);
  } catch (e) {
    if (e instanceof AgmtWordError) throw e;
    const err = e as { message?: string; code?: string };
    if (looksProtected(err.code ?? "", err.message ?? "") || (await documentLooksProtected())) {
      throw new AgmtWordError(PROTECTED_DOC_MESSAGE, err.code);
    }
    throw new AgmtWordError(err.message || "Word could not complete that action.", err.code);
  }
}
