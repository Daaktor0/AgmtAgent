/**
 * Dictionary spelling (PEE-20 / PWC-40). Comment-only. No autocorrect.
 * Dictionaries are bundled Hunspell lists, not a personal or document store.
 *
 * Repeat policy (`SPELLING_REPEAT_POLICY`): frequency is not evidence of a
 * correct spelling or an intentional name. Every eligible occurrence is
 * detected. Comments for the same token are published once, anchored on the
 * first exact span that is not inside an existing revision, with relatedSpans
 * for the remaining hits and a comment that states how many more times it
 * appears. Repeated errors are never treated as clean.
 */
import nspell from "nspell";
import { hunspellFiles } from "./dictionaries/load.ts";
import { LEGAL_ALLOWLIST } from "./legal-allowlist.ts";
import { candidateFinding, knownTermTokens, lexicalParagraphs, ordinaryProse, type LaunchContext } from "./launch-context.ts";
import { resolveSpellingDictionary, type EnglishSpellingDictionary } from "./language.ts";
import { TYPO_ALLOWLIST } from "./typo-allowlist.ts";
import { ProofFindingSchema, type ProofFinding } from "./contracts.ts";

export const SPELLING_DICTIONARY_VERSION = "proof-spelling-dictionary-v2";
export const SPELLING_REPEAT_POLICY = "detect-all-dedupe-comments-v1";
const TOKEN = /\b([A-Za-z][A-Za-z']{2,})\b/g;
const LEGAL_PREFIXES = new Set([
  "sub", "non", "pre", "post", "co", "re", "inter", "intra", "multi", "anti",
  "extra", "over", "under", "mid", "cross", "self", "quasi", "ex", "counter",
  "pro", "semi", "ultra", "trans", "supra", "infra", "vice", "neo",
]);
const checkers = new Map<EnglishSpellingDictionary, ReturnType<typeof nspell>>();

function checker(language: EnglishSpellingDictionary): ReturnType<typeof nspell> {
  const cached = checkers.get(language);
  if (cached) return cached;
  const files = hunspellFiles(language);
  if (!files.aff || !files.dic) throw new Error("incomplete_spelling_dictionary");
  const created = nspell(files.aff, files.dic);
  checkers.set(language, created);
  return created;
}

function tokenShape(word: string): "lower" | "title" | "acronym" | "identifier" {
  if (/^[a-z][a-z']+$/.test(word)) return "lower";
  if (/^[A-Z][a-z']+$/.test(word)) return "title";
  if (/^[A-Z]{2,}$/.test(word)) return "acronym";
  return "identifier";
}

function editDistanceAtMost(left: string, right: string, max: number): boolean {
  if (Math.abs(left.length - right.length) > max) return false;
  const rows = left.length + 1;
  const cols = right.length + 1;
  const prev = new Array<number>(cols);
  const next = new Array<number>(cols);
  for (let j = 0; j < cols; j++) prev[j] = j;
  for (let i = 1; i < rows; i++) {
    next[0] = i;
    let rowMin = next[0]!;
    const a = left.charCodeAt(i - 1);
    for (let j = 1; j < cols; j++) {
      const cost = a === right.charCodeAt(j - 1) ? 0 : 1;
      next[j] = Math.min(prev[j]! + 1, next[j - 1]! + 1, prev[j - 1]! + cost);
      if (next[j]! < rowMin) rowMin = next[j]!;
    }
    if (rowMin > max) return false;
    for (let j = 0; j < cols; j++) prev[j] = next[j]!;
  }
  return prev[right.length]! <= max;
}

function dictionaryKnown(spell: ReturnType<typeof nspell>, word: string): boolean {
  return spell.correct(word) || spell.correct(word.toLowerCase());
}

function closeSuggestion(spell: ReturnType<typeof nspell>, word: string): boolean {
  const lower = word.toLowerCase();
  return spell.suggest(lower).some((item) => item && editDistanceAtMost(lower, item.toLowerCase(), 2));
}

function matchTokenShape(source: string, suggestion: string): string {
  if (/^[A-Z][a-z']+$/.test(source)) return suggestion.charAt(0).toUpperCase() + suggestion.slice(1).toLowerCase();
  if (/^[A-Z]+$/.test(source)) return suggestion.toUpperCase();
  return suggestion;
}

function hyphenNeighbours(text: string, start: number, end: number): { left: string | null; right: string | null } {
  let left: string | null = null;
  let right: string | null = null;
  if (start >= 2 && text[start - 1] === "-") {
    left = text.slice(0, start - 1).match(/([A-Za-z][A-Za-z']*)$/)?.[1] ?? null;
  }
  if (end + 1 < text.length && text[end] === "-") {
    right = text.slice(end + 1).match(/^([A-Za-z][A-Za-z']*)/)?.[1] ?? null;
  }
  return { left, right };
}

function partKnown(spell: ReturnType<typeof nspell>, part: string): boolean {
  const lower = part.toLowerCase();
  return LEGAL_PREFIXES.has(lower) || LEGAL_ALLOWLIST.has(lower) || dictionaryKnown(spell, part);
}

function hyphenatedKnown(spell: ReturnType<typeof nspell>, word: string, text: string, start: number, end: number): boolean {
  const { left, right } = hyphenNeighbours(text, start, end);
  if (!left && !right) return false;
  const parts = [left, word, right].filter((part): part is string => Boolean(part));
  if (parts.every((part) => partKnown(spell, part))) return true;
  if (LEGAL_PREFIXES.has(word.toLowerCase()) && right && partKnown(spell, right)) return true;
  if (left && LEGAL_PREFIXES.has(left.toLowerCase()) && partKnown(spell, word)) return true;
  return false;
}

function adjacentTokens(left: RegExpMatchArray, right: RegExpMatchArray, text: string): boolean {
  return /^\s+$/.test(text.slice(left.index! + left[0].length, right.index));
}

function unknownTitleRun(text: string, start: number, spell: ReturnType<typeof nspell>): boolean {
  const tokens = [...text.matchAll(/\b([A-Z][A-Za-z']{2,})\b/g)];
  const index = tokens.findIndex((match) => match.index === start);
  if (index < 0) return false;
  const current = tokens[index]!;
  if (dictionaryKnown(spell, current[1]!)) return false;
  const prev = tokens[index - 1];
  const next = tokens[index + 1];
  return Boolean(
    (prev && adjacentTokens(prev, current, text) && !dictionaryKnown(spell, prev[1]!))
    || (next && adjacentTokens(current, next, text) && !dictionaryKnown(spell, next[1]!)),
  );
}

function spanInRevision(ctx: LaunchContext, finding: ProofFinding): boolean {
  const paragraph = lexicalParagraphs(ctx).find((item) =>
    item.partUri === finding.primarySpan.partUri
    && JSON.stringify(item.paragraphPath) === JSON.stringify(finding.primarySpan.paragraphPath)
  );
  if (!paragraph) return false;
  return paragraph.nodes.some((node) =>
    node.revision
    && node.start < finding.primarySpan.textEnd
    && node.end > finding.primarySpan.textStart
  );
}

function publishRepeats(ctx: LaunchContext, findings: ProofFinding[]): ProofFinding[] {
  const groups = new Map<string, ProofFinding[]>();
  for (const finding of findings) {
    const key = finding.exactQuote.toLowerCase();
    const list = groups.get(key) ?? [];
    list.push(finding);
    groups.set(key, list);
  }
  const published: ProofFinding[] = [];
  for (const group of groups.values()) {
    const primary = group.find((finding) => !spanInRevision(ctx, finding)) ?? group[0]!;
    const related = group.filter((finding) => finding.id !== primary.id).map((finding) => finding.primarySpan);
    if (!related.length) {
      published.push(primary);
      continue;
    }
    published.push(ProofFindingSchema.parse({
      ...primary,
      relatedSpans: related,
      comment: `${primary.comment} The same spelling also appears ${related.length} more time${related.length === 1 ? "" : "s"} in this document.`,
    }));
  }
  return published;
}

export function spellingRuleFindings(ctx: LaunchContext): ProofFinding[] {
  const uiLanguage = ctx.language === "en-US" ? "en-US" : "en-GB";
  const names = knownTermTokens(ctx);
  const detected: ProofFinding[] = [];
  for (const paragraph of lexicalParagraphs(ctx)) {
    const resolved = resolveSpellingDictionary(paragraph.language, uiLanguage);
    if (!resolved.english) continue;
    const spell = checker(resolved.dictionary);
    for (const match of paragraph.text.matchAll(new RegExp(TOKEN.source, "g"))) {
      const word = match[1]!;
      const start = match.index;
      const end = start + word.length;
      const lower = word.toLowerCase();
      const shape = tokenShape(word);
      if (shape === "acronym" || shape === "identifier") continue;
      if (!ordinaryProse(paragraph, start, end, ctx)) continue;
      if (lower in TYPO_ALLOWLIST) continue;
      if (LEGAL_ALLOWLIST.has(lower)) continue;
      if (hyphenatedKnown(spell, word, paragraph.text, start, end)) continue;
      if (shape !== "lower" && names.has(lower)) continue;
      if (dictionaryKnown(spell, word)) continue;
      if (shape === "title" && unknownTitleRun(paragraph.text, start, spell)) continue;
      if (shape === "title" && !closeSuggestion(spell, word)) continue;
      const suggestions = [...new Set(spell.suggest(lower).filter((item) => item && item.toLowerCase() !== lower))]
        .map((item) => matchTokenShape(word, item))
        .slice(0, 3);
      const nearby = suggestions.length
        ? ` Suggested spelling: ${suggestions[0]}.${suggestions.length > 1 ? ` Nearby dictionary forms include: ${suggestions.join(", ")}.` : ""}`
        : "";
      detected.push(candidateFinding("spelling.dictionary", {
        p: paragraph,
        start,
        end,
        comment: `Proof does not recognise “${word}”.${nearby} This is a review comment, not an automatic correction.`,
      }));
    }
  }
  return publishRepeats(ctx, detected);
}
