/**
 * Navigation. Fuzzy candidate discovery is allowed; mutation is not.
 *
 * Occurrence navigation / select-in-document adapted from Vaquill AI
 * ms-word-addin (Apache-2.0). Modified: no mutation path, table-aware search.
 */
import { apiSet, runWord } from "./host";

const forWordSearch = (s: string) => s.replace(/\^/g, "^^");

export async function locateExact(text: string, index = 0): Promise<{ count: number; index: number }> {
  const q = text.trim();
  if (!q) return { count: 0, index: -1 };
  return runWord(async (context) => {
    const ranges = context.document.body.search(forWordSearch(q), {
      matchCase: true,
      matchWildcards: false,
    });
    ranges.load("items");
    await context.sync();
    if (!ranges.items.length) return { count: 0, index: -1 };
    const i = ((index % ranges.items.length) + ranges.items.length) % ranges.items.length;
    ranges.items[i].select();
    await context.sync();
    return { count: ranges.items.length, index: i };
  });
}

export async function locateParagraphIndex(index: number): Promise<boolean> {
  return runWord(async (context) => {
    const ps = context.document.body.paragraphs;
    ps.load("items");
    await context.sync();
    if (index < 0 || index >= ps.items.length) return false;
    ps.items[index].getRange().select();
    await context.sync();
    return true;
  });
}

export async function insertBookmark(name: string, text: string): Promise<boolean> {
  if (!apiSet("1.4")) return false;
  return runWord(async (context) => {
    const ranges = context.document.body.search(forWordSearch(text), {
      matchCase: true,
      matchWildcards: false,
    });
    ranges.load("items");
    await context.sync();
    if (ranges.items.length !== 1) return false;
    ranges.items[0].insertBookmark(name);
    await context.sync();
    return true;
  });
}
