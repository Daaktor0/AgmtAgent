/**
 * Independently labelled PEE-12 party-consistency cases.
 */
import { createHash } from "node:crypto";
import type { LaunchRuleId } from "../../proof/contracts.ts";
import type { BetaRuleCase } from "./beta-rule-cases.ts";
import type { SplitBucket } from "./beta-rule-denominators.ts";

export const PEE12_CASES_VERSION = "proof-pee12-cases-v1";
export const PEE12_SUPPORTED_RECALL = 0.9;
export const PEE12_COMMENT_PRECISION = 0.98;
export const PEE12_MIN_SAMPLES = 100;

const FAMILIES = ["sha", "ssa", "nda", "employment", "letter"] as const;

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function splitBucket(familyId: string): SplitBucket {
  const slot = Number.parseInt(sha(familyId).slice(0, 8), 16) % 10;
  if (slot < 6) return "development";
  if (slot < 8) return "calibration";
  return "held_out";
}

export function pee12Positives(): BetaRuleCase[] {
  return FAMILIES.flatMap((family) => Array.from({ length: 130 }, (_, i) => {
    const company = `${family[0]!.toUpperCase()}${family.slice(1)} Holdings ${i + 1} Limited`;
    const wrong = `${family[0]!.toUpperCase()}${family.slice(1)} Trading ${i + 1} Limited`;
    return {
      id: `pee12_name_${family}_${i}`,
      ruleId: "parties.consistency" as const,
      kind: "positive" as const,
      paragraphs: [
        `This Agreement is between ${company} (the "Company") and Other Party Limited ("Investor").`,
        `The Company, ${wrong}, shall deliver notice under this ${family} document.`,
      ],
      quote: wrong,
      replacement: null,
      action: "comment" as const,
      rationale: `Role Company used with a different legal name in ${family}.`,
    };
  }));
}

export function pee12Traps(): BetaRuleCase[] {
  return FAMILIES.flatMap((family) => [
    ...Array.from({ length: 40 }, (_, i) => ({
      id: `pee12_ltd_${family}_${i}`,
      ruleId: "parties.consistency" as const,
      kind: "negative" as const,
      paragraphs: [
        `This Agreement is between ${family[0]!.toUpperCase()}${family.slice(1)} Alpha ${i + 1} Limited (the "Company") and Other Party Limited ("Investor").`,
        `The Company, ${family[0]!.toUpperCase()}${family.slice(1)} Alpha ${i + 1} Ltd, shall deliver notice.`,
      ],
      quote: null,
      replacement: null,
      action: "none" as const,
      rationale: "Ltd/Limited is the same name after normalisation.",
    })),
    ...Array.from({ length: 30 }, (_, i) => ({
      id: `pee12_pte_${family}_${i}`,
      ruleId: "parties.consistency" as const,
      kind: "negative" as const,
      paragraphs: [
        `This Agreement is between XYZ Holdings ${family} ${i} Limited (the "Company") and XYZ Holdings ${family} ${i} Pte Ltd ("Investor").`,
        `The Company and the Investor shall complete the ${family} transaction.`,
      ],
      quote: null,
      replacement: null,
      action: "none" as const,
      rationale: "Group companies with different jurisdictional suffixes are different entities.",
    })),
    ...Array.from({ length: 30 }, (_, i) => ({
      id: `pee12_together_${family}_${i}`,
      ruleId: "parties.consistency" as const,
      kind: "negative" as const,
      paragraphs: [
        `This Agreement is between Alpha ${family} ${i} Limited (the "Company") and Beta ${family} ${i} Limited ("Investor").`,
        "The Purchaser and the Seller together shall execute the deed.",
      ],
      quote: null,
      replacement: null,
      action: "none" as const,
      rationale: "Shared role language is not a bound-name mismatch.",
    })),
    ...Array.from({ length: 30 }, (_, i) => ({
      id: `pee12_office_${family}_${i}`,
      ruleId: "parties.consistency" as const,
      kind: "negative" as const,
      paragraphs: [
        `This Agreement is between Gamma ${family} ${i} Limited (the "Company") and Other Party Limited ("Investor").`,
        `The registered office of Delta Unrelated ${i} Limited is in Mumbai.`,
      ],
      quote: null,
      replacement: null,
      action: "none" as const,
      rationale: "Registered-office addresses are excluded.",
    })),
  ]);
}

export function pee12Adversarial(): { id: string; ruleId: LaunchRuleId; paragraphs: string[]; expectSilent: boolean; note: string }[] {
  return [
    {
      id: "pee12_adv_quoted",
      ruleId: "parties.consistency",
      paragraphs: [
        'This Agreement is between Example Limited (the "Company") and Other Limited ("Investor").',
        'The Company shall record that "Wrong Name Limited" was used.',
      ],
      expectSilent: true,
      note: "quoted name",
    },
    {
      id: "pee12_adv_party_name_fixture_shape",
      ruleId: "parties.consistency",
      paragraphs: [
        'This Agreement is between Recieve Private Limited (the "Company") and Other Limited ("Investor").',
        "The Company shall deliver the notice.",
      ],
      expectSilent: true,
      note: "declared name used only as the bound party, including a labelled typo in the legal name",
    },
  ];
}

export function pee12Denominators() {
  return {
    version: PEE12_CASES_VERSION,
    families: [...FAMILIES],
    perRule: {
      "parties.consistency": {
        uniquePositiveFamilies: pee12Positives().length,
        uniqueNegativeFamilies: pee12Traps().length,
        heldOutPositive: pee12Positives().filter((item) => splitBucket(item.id) === "held_out").length,
        heldOutNegative: pee12Traps().filter((item) => splitBucket(item.id) === "held_out").length,
        independence: "Each ID is one (family, name) pair. Packed documents are execution only. Superficial Ltd/Limited copies are traps, not extra positives.",
      },
    },
  };
}
