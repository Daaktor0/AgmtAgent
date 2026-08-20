/**
 * Version-safe apply. Exact text only. Never nearest-similar mutation.
 *
 * Tracking-mode save/restore and protection checks adapted from Vaquill AI
 * ms-word-addin (Apache-2.0). Modified: no office-word-diff, no bulk apply,
 * refuse on duplicate/stale/ambiguous, post-write re-read required.
 */
import type { ActionTicket, ApplyResultStatus } from "../contracts/action";
import { AgmtWordError, documentLooksProtected, runWord, serializeTrackChanges } from "./host";
import { sha256Hex } from "./selection";

const forWordSearch = (s: string) => s.replace(/\^/g, "^^");

async function findExactUnique(
  context: Word.RequestContext,
  needle: string,
): Promise<Word.Range | "missing" | "ambiguous"> {
  const escaped = forWordSearch(needle);
  const all = context.document.body.search(escaped, {
    matchCase: true,
    matchWildcards: false,
  });
  all.load("items");
  await context.sync();
  if (all.items.length === 1) return all.items[0];
  if (all.items.length > 1) return "ambiguous";
  return "missing";
}

export async function applyTicket(ticket: ActionTicket): Promise<{
  status: ApplyResultStatus;
  reason?: string;
  trackingRestored: boolean;
  liveText?: string;
}> {
  if (ticket.consumed) {
    return { status: "refused", reason: "replay", trackingRestored: true };
  }
  if (Date.parse(ticket.expiresAt) <= Date.now()) {
    return { status: "refused", reason: "expired", trackingRestored: true };
  }
  if (await documentLooksProtected()) {
    return { status: "refused", reason: "protected", trackingRestored: true };
  }

  return serializeTrackChanges(async () =>
    runWord(async (context) => {
      const doc = context.document;
      doc.load("changeTrackingMode");
      await context.sync();
      const prior = doc.changeTrackingMode;
      let restored = false;
      try {
        doc.changeTrackingMode = Word.ChangeTrackingMode.trackAll;
        await context.sync();
        doc.load("changeTrackingMode");
        await context.sync();
        if (doc.changeTrackingMode === Word.ChangeTrackingMode.off) {
          return { status: "refused" as const, reason: "capability_unavailable", trackingRestored: true };
        }

        const found = await findExactUnique(context, ticket.expectedOldText);
        if (found === "missing") {
          return { status: "refused" as const, reason: "stale", trackingRestored: true };
        }
        if (found === "ambiguous") {
          return { status: "refused" as const, reason: "ambiguous_target", trackingRestored: true };
        }

        if (ticket.operation === "replace") {
          found.insertText(ticket.proposedText, Word.InsertLocation.replace);
        } else if (ticket.operation === "delete") {
          found.delete();
        } else if (ticket.operation === "insert_before") {
          found.insertText(ticket.proposedText, Word.InsertLocation.before);
        } else if (ticket.operation === "insert_after") {
          found.insertText(ticket.proposedText, Word.InsertLocation.after);
        } else if (ticket.operation === "comment") {
          found.insertComment(ticket.proposedText || "");
        }
        await context.sync();

        const reviewed = found.getReviewedText
          ? found.getReviewedText(Word.ChangeTrackingVersion.current)
          : null;
        if (reviewed) await context.sync();
        const live = reviewed ? reviewed.value || "" : "";

        if (ticket.operation === "replace" && ticket.proposedText) {
          if (live && live.indexOf(ticket.proposedText) < 0 && live !== ticket.proposedText) {
            return { status: "failed_unknown" as const, reason: "failed_unknown", trackingRestored: restored, liveText: live };
          }
        }
        return { status: "confirmed" as const, trackingRestored: restored, liveText: live };
      } finally {
        try {
          doc.changeTrackingMode = prior;
          await context.sync();
          restored = true;
        } catch {
          /* original error propagates */
        }
      }
    }),
  );
}

export async function hashParagraphs(paragraphs: string[]): Promise<string> {
  return "sha256:" + (await sha256Hex(paragraphs.join("\n")));
}

export function assertExactHash(text: string, expected: string): boolean {
  return expected === text;
}
