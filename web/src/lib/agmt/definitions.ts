import { newId } from "./ids.ts";
import { RE_DEF_INLINE, RE_DEF_PLAIN, RE_DEF_QUOTED } from "./patterns.ts";
import type { Definition, DefinitionUse, Provision } from "./types.ts";

const PARTY_TERMS = new Set(
  ["company", "investor", "promoter", "promoters", "founder", "founders", "shareholder", "purchaser", "seller"].map(
    (s) => s.toLowerCase(),
  ),
);

export function extractDefinitions(provisions: Provision[]): {
  definitions: Definition[];
  uses: DefinitionUse[];
} {
  const definitions: Definition[] = [];
  const seen = new Set<string>();

  for (const p of provisions) {
    if (!p.ownsText) continue;
    const text = p.canonicalText;
    const found: { term: string; start: number; end: number; legalName: string | null }[] = [];

    const add = (term: string, start: number, end: number, legalName: string | null) => {
      const t = term.replace(/\s+/g, " ").trim().replace(/[ ,;:]+$/, "");
      if (!t || t.length > 90 || ["a", "an", "the"].includes(t.toLowerCase())) return;
      found.push({ term: t, start, end, legalName });
    };

    for (const rx of [RE_DEF_QUOTED, RE_DEF_INLINE]) {
      const r = new RegExp(rx.source, "g");
      let m: RegExpExecArray | null;
      while ((m = r.exec(text))) {
        add(m[1], m.index, m.index + m[0].length, null);
      }
    }
    const plain = text.match(RE_DEF_PLAIN);
    if (plain) add(plain[1], 0, Math.min(text.length, plain[0].length), null);

    // "Acme Technologies Private Limited (the "Company")"
    const legal = /([A-Z][A-Za-z0-9&.,' \-]{3,80}?(?:Private Limited|Pvt\.?\s*Ltd\.?|Limited|LLP|Inc\.?))\s*\(\s*(?:the\s+)?[“"']([^”"']+)[”"']\s*\)/g;
    let lm: RegExpExecArray | null;
    while ((lm = legal.exec(text))) {
      add(lm[2], lm.index, lm.index + lm[0].length, lm[1].trim());
    }

    for (const f of found) {
      const key = `${p.scopeType}|${p.scopeId}|${f.term.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      definitions.push({
        definitionId: newId(),
        term: f.term,
        normalisedTerm: f.term.toLowerCase(),
        definitionKind: PARTY_TERMS.has(f.term.toLowerCase()) ? "defined_party" : "defined_term",
        scopeType: p.scopeType,
        scopeId: p.scopeId,
        definingProvisionId: p.provisionId,
        start: f.start,
        end: f.end,
        legalName: f.legalName,
      });
    }
  }

  const uses: DefinitionUse[] = [];
  for (const def of definitions) {
    const rx = new RegExp(`\\b${escapeRe(def.term)}\\b`, "g");
    for (const p of provisions) {
      if (!p.ownsText) continue;
      if (p.scopeType !== def.scopeType && def.scopeType !== "main_body") {
        // schedule-local must not overwrite main-body; still detect local uses
        if (p.scopeId !== def.scopeId) continue;
      }
      let m: RegExpExecArray | null;
      rx.lastIndex = 0;
      while ((m = rx.exec(p.canonicalText))) {
        if (p.provisionId === def.definingProvisionId && m.index >= def.start && m.index < def.end) {
          continue;
        }
        uses.push({
          definitionUseId: newId(),
          definitionId: def.definitionId,
          provisionId: p.provisionId,
          start: m.index,
          end: m.index + m[0].length,
        });
      }
    }
  }

  return { definitions, uses };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
