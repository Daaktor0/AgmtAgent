/**
 * Dictionary spelling (PEE-20 / PWC-40). Comment-only. No autocorrect.
 * Dictionaries are bundled Hunspell lists, not a personal or document store.
 */
import nspell from "nspell";
import { hunspellFiles } from "./dictionaries/load.ts";
import { LEGAL_ALLOWLIST } from "./legal-allowlist.ts";
import { candidateFinding, ordinaryProse, type LaunchContext } from "./launch-context.ts";
import { TYPO_ALLOWLIST } from "./typo-allowlist.ts";
import type { ProofFinding } from "./contracts.ts";

export const SPELLING_DICTIONARY_VERSION = "proof-spelling-dictionary-v1";
const TOKEN = /\b([A-Za-z][A-Za-z']{2,})\b/g;
const checkers = new Map<"en-GB" | "en-US", ReturnType<typeof nspell>>();

function checker(language: "en-GB" | "en-US"): ReturnType<typeof nspell> {
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

function tokenCounts(ctx: LaunchContext): Map<string, number> {
  const counts = new Map<string, number>();
  for (const paragraph of ctx.source.paragraphs) {
    for (const match of paragraph.text.matchAll(/\b([A-Za-z][A-Za-z']{2,})\b/g)) {
      const key = match[1]!.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

function knownNames(ctx: LaunchContext): Set<string> {
  const names = new Set<string>();
  for (const entry of ctx.indexes?.definitions.entries ?? []) {
    for (const part of entry.normalisedTerm.split(/\s+/)) if (part) names.add(part);
  }
  for (const entry of ctx.indexes?.parties.entries ?? []) {
    for (const value of [entry.shortName, entry.legalName]) {
      if (!value) continue;
      for (const part of value.toLowerCase().split(/[^a-z']+/)) if (part.length >= 3) names.add(part);
    }
  }
  return names;
}

export function spellingRuleFindings(ctx: LaunchContext): ProofFinding[] {
  const language = ctx.language === "en-US" ? "en-US" : "en-GB";
  const spell = checker(language);
  const counts = tokenCounts(ctx);
  const names = knownNames(ctx);
  const out: ProofFinding[] = [];
  for (const paragraph of ctx.source.paragraphs) {
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
      if (names.has(lower)) continue;
      if ((counts.get(lower) ?? 0) >= 3) continue;
      if (dictionaryKnown(spell, word)) continue;
      if (shape === "title" && unknownTitleRun(paragraph.text, start, spell)) continue;
      if (shape === "title" && !closeSuggestion(spell, word)) continue;
      const suggestions = [...new Set(spell.suggest(lower).filter((item) => item && item.toLowerCase() !== lower))].slice(0, 3);
      const nearby = suggestions.length
        ? ` Nearby dictionary forms include: ${suggestions.join(", ")}.`
        : "";
      out.push(candidateFinding("spelling.dictionary", {
        p: paragraph,
        start,
        end,
        comment: `Proof does not recognise “${word}”.${nearby} This is a review comment, not an automatic correction.`,
      }));
    }
  }
  return out;
}
