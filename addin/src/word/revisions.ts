/**
 * Individual revision actions by index + identity. No bulk apply-all.
 *
 * Index+expected identity check adapted from Vaquill AI ms-word-addin
 * (Apache-2.0). Modified: Agmt approval still required; no accept-all path.
 */
import { runWord } from "./host";

export async function resolveTrackedChangeAt(
  index: number,
  action: "accept" | "reject",
  expected?: { text: string; author?: string },
): Promise<boolean> {
  return runWord(async (context) => {
    const changes = context.document.body.getTrackedChanges();
    changes.load("text,author");
    await context.sync();
    const match = changes.items[index];
    if (!match) return false;
    if (expected) {
      if (match.text !== expected.text) return false;
      if (expected.author !== undefined && match.author !== expected.author) return false;
    }
    if (action === "accept") match.accept();
    else match.reject();
    await context.sync();
    return true;
  });
}
