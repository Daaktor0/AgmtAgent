import { newId } from "./ids.ts";
import type { DealMapEntry, Provision } from "./types.ts";

void newId;

export function buildDealMap(provisions: Provision[]): DealMapEntry[] {
  const entries: DealMapEntry[] = [];
  const leaves = provisions.filter((p) => p.ownsText);

  const add = (
    category: string,
    label: string,
    value: string | null,
    p: Provision | null,
    start: number | null,
    end: number | null,
    confidence: number,
    uncertainty: string | null = null,
  ) => {
    entries.push({
      category,
      label,
      value,
      provisionId: p?.provisionId ?? null,
      start,
      end,
      extractionMethod: "deterministic",
      confidence,
      uncertaintyCode: uncertainty,
    });
  };

  const find = (rx: RegExp): { p: Provision; m: RegExpExecArray } | null => {
    for (const p of leaves) {
      const m = rx.exec(p.canonicalText);
      if (m) return { p, m };
    }
    return null;
  };

  for (const p of leaves.slice(0, 12)) {
    const party = p.canonicalText.match(
      /([A-Z][A-Za-z0-9&.,' \-]{3,80}?(?:Private Limited|Limited|LLP))\s*\(\s*(?:the\s+)?[“"']([^”"']+)[”"']/ ,
    );
    if (party) add("parties", party[2], party[1], p, party.index ?? 0, (party.index ?? 0) + party[0].length, 0.9);
  }

  const inst = find(/\b(shareholders[’']?\s+agreement|share\s+subscription\s+agreement|share\s+purchase\s+agreement|disclosure\s+letter)\b/i);
  if (inst) add("instrument", "stated_instrument", inst.m[0], inst.p, inst.m.index, inst.m.index + inst.m[0].length, 0.95);
  else add("instrument", "stated_instrument", null, null, null, null, 0, "absent");

  const gov = find(/\bgoverned by the laws of ([A-Za-z ]{3,40})/i) ?? find(/\bgoverning law[^\n]{0,80}/i);
  if (gov) add("governing_law", "governing_law", gov.m[0].slice(0, 120), gov.p, gov.m.index, gov.m.index + gov.m[0].length, 0.85);
  else add("governing_law", "governing_law", null, null, null, null, 0, "absent");

  const date = find(/\b(effective date|date of (?:this )?agreement)[^\n]{0,60}/i);
  if (date) add("dates", "effective_or_signing", date.m[0].slice(0, 120), date.p, date.m.index, date.m.index + date.m[0].length, 0.7);
  else add("dates", "effective_or_signing", null, null, null, null, 0, "absent");

  const headings: [string, RegExp][] = [
    ["economics", /\b(subscription amount|consideration|price per share|valuation)\b/i],
    ["conditions_precedent", /\bconditions?\s+precedent\b/i],
    ["closing", /\b(closing|completion)\b/i],
    ["conditions_subsequent", /\bconditions?\s+subsequent\b/i],
    ["continuing_obligations", /\b(information rights|covenant)\b/i],
    ["warranties", /\b(representation|warrant)/i],
    ["liability", /\b(indemnif|limitation of liability|cap on)\b/i],
    ["termination", /\bterminat/i],
    ["governance", /\b(board|reserved matter|quorum|investor director)\b/i],
    ["transfer", /\b(right of first|rofr|rofo|tag[\s-]along|drag[\s-]along|lock[\s-]?in)\b/i],
    ["schedules", /\bschedule\s+[A-Z0-9]/i],
  ];
  for (const [cat, rx] of headings) {
    const hit = find(rx);
    if (hit) add(cat, cat, hit.m[0], hit.p, hit.m.index, hit.m.index + hit.m[0].length, 0.75);
    else add(cat, cat, null, null, null, null, 0, "absent");
  }

  return entries;
}
