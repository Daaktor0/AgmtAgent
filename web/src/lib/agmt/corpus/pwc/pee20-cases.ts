/**
 * Independently labelled PEE-20 dictionary-spelling cases.
 * Comment-only. Allowlist typos are excluded; those belong to language.typo_allowlist.
 */
import type { LaunchRuleId } from "../../proof/contracts.ts";
import type { BetaRuleCase } from "./beta-rule-cases.ts";

export const PEE20_CASES_VERSION = "proof-pee20-cases-v2";
export const PEE20_COMMENT_PRECISION = 0.98;
export const PEE20_SUPPORTED_RECALL = 0.9;
export const PEE20_MIN_SAMPLES = 200;

const MISSPELLINGS = [
  "goverment", "mispelled", "enviroment", "publically", "wierd",
  "langauge", "docuement", "agreemnet", "commerical", "obilgation",
  "certifcate", "schedual", "apendix", "paymnet", "reciept",
  "tommorrow", "truely", "prefered", "transfered", "languge",
] as const;

const FRAMES = [
  (word: string) => `The Company shall send the ${word} notice in writing.`,
  (word: string) => `The Borrower will review the ${word} statement before completion.`,
  (word: string) => `Please deliver the ${word} certificate to the buyer.`,
  (word: string) => `Kindly return the ${word} schedule before Friday.`,
  (word: string) => `Each party must keep the ${word} record with the file.`,
  (word: string) => `The Licensor may issue the ${word} invoice after completion.`,
  (word: string) => `The Seller should file the ${word} report after closing.`,
  (word: string) => `This letter is to confirm the ${word} request from the buyer.`,
  (word: string) => `The agent has issued the ${word} notice for the file.`,
  (word: string) => `Any assignee is to collect the ${word} papers on completion.`,
] as const;

export function pee20Positives(): BetaRuleCase[] {
  return MISSPELLINGS.flatMap((word, wordIndex) => FRAMES.map((frame, frameIndex) => ({
    id: `pee20_pos_${word}_${frameIndex}`,
    ruleId: "spelling.dictionary" as LaunchRuleId,
    kind: "positive" as const,
    paragraphs: [frame(word)],
    quote: word,
    replacement: null,
    action: "comment" as const,
    rationale: `Lowercase misspelling ${word} in ordinary prose frame ${frameIndex} (${wordIndex}).`,
  })));
}

export function pee20Traps(): BetaRuleCase[] {
  const correct = [
    "government", "environment", "language", "document", "agreement",
    "commercial", "obligation", "certificate", "schedule", "appendix",
    "payment", "receipt", "tomorrow", "truly", "preferred",
    "transferred", "colour", "organise", "favour", "defence",
  ];
  const traps: BetaRuleCase[] = [];
  correct.forEach((word, index) => {
    traps.push({
      id: `pee20_ok_${word}_${index}`,
      ruleId: "spelling.dictionary",
      kind: "negative",
      paragraphs: [`The Company shall send the ${word} notice in writing.`],
      quote: null,
      replacement: null,
      action: "none",
      rationale: "Correct dictionary word in the selected language.",
    });
  });
  for (let i = 0; i < 20; i++) {
    traps.push({
      id: `pee20_quote_${i}`,
      ruleId: "spelling.dictionary",
      kind: "negative",
      paragraphs: [`The Company shall use "goverment" in quotation ${i}.`],
      quote: null,
      replacement: null,
      action: "none",
      rationale: "Short quoted example is literal quoted material, not ordinary quoted prose.",
    });
  }
  for (let i = 0; i < 20; i++) {
    traps.push({
      id: `pee20_name_${i}`,
      ruleId: "spelling.dictionary",
      kind: "negative",
      paragraphs: [`Northwind${i} Traders Limited shall keep the Confidential Information.`],
      quote: null,
      replacement: null,
      action: "none",
      rationale: "Capitalised names are not lowercase spelling candidates.",
    });
  }
  for (let i = 0; i < 20; i++) {
    traps.push({
      id: `pee20_acronym_${i}`,
      ruleId: "spelling.dictionary",
      kind: "negative",
      paragraphs: [`The Company shall deliver the NASA GDPR EBITDA notice ${i}.`],
      quote: null,
      replacement: null,
      action: "none",
      rationale: "All-caps acronyms are excluded.",
    });
  }
  for (let i = 0; i < 20; i++) {
    traps.push({
      id: `pee20_latin_${i}`,
      ruleId: "spelling.dictionary",
      kind: "negative",
      paragraphs: [`The Company shall apply mutatis mutandis and force majeure in clause ${i}.`],
      quote: null,
      replacement: null,
      action: "none",
      rationale: "Legal Latin allowlist.",
    });
  }
  for (let i = 0; i < 20; i++) {
    traps.push({
      id: `pee20_defined_repeat_${i}`,
      ruleId: "spelling.dictionary",
      kind: "negative",
      paragraphs: [
        `"Zyxxco" means a defined party in this agreement.`,
        `The Company shall send the Zyxxco notice in writing.`,
        `The Borrower will review the Zyxxco statement before completion.`,
        `Please deliver the Zyxxco certificate to the buyer ${i}.`,
      ],
      quote: null,
      replacement: null,
      action: "none",
      rationale: "Repeated defined-term token is excluded by the definition index, not by frequency.",
    });
  }
  return traps;
}
