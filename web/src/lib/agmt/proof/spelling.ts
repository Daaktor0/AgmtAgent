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
const TOKEN = /\b([a-z][a-z']{2,})\b/g;
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
      if (!ordinaryProse(paragraph, start, end, ctx)) continue;
      if (word in TYPO_ALLOWLIST) continue;
      if (LEGAL_ALLOWLIST.has(word)) continue;
      if (names.has(word)) continue;
      if ((counts.get(word) ?? 0) >= 3) continue;
      if (spell.correct(word)) continue;
      const suggestions = [...new Set(spell.suggest(word).filter((item) => item && item.toLowerCase() !== word))].slice(0, 3);
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
