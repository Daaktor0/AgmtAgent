import { newId } from "./ids.ts";
import { RE_DEF_INLINE, RE_DEF_PLAIN, RE_DEF_QUOTED } from "./patterns.ts";
import type { Definition, DefinitionUse, Provision } from "./types.ts";

const PARTY_TERMS = new Set(
  ["company", "investor", "promoter", "promoters", "founder", "founders", "shareholder", "purchaser", "seller"].map(
    (s) => s.toLowerCase(),
  ),
);

const BODY_SCOPES = new Set(["main_body", "definitions", "recitals"]);

function isBodyScope(scopeType: string): boolean {
  return BODY_SCOPES.has(scopeType);
}

/**
 * SPEC §4.4: key is document + version + scope_type + scope_id + normalised_term.
 * A schedule-local definition MUST NOT overwrite or silently qualify a main-body definition.
 * Uses resolve to the most specific matching definition: same scope first, then body.
 */
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

    const legal =
      /([A-Z][A-Za-z0-9&.,' \-]{3,80}?(?:Private Limited|Pvt\.?\s*Ltd\.?|Limited|LLP|Inc\.?))\s*\(\s*(?:the\s+)?[“"']([^”"']+)[”"']\s*\)/g;
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

  const byTerm = new Map<string, Definition[]>();
  for (const def of definitions) {
    const list = byTerm.get(def.normalisedTerm) ?? [];
    list.push(def);
    byTerm.set(def.normalisedTerm, list);
  }

  function resolveDef(term: string, p: Provision): Definition | null {
    const cands = byTerm.get(term.toLowerCase()) ?? [];
    const local = cands.find((d) => d.scopeId === p.scopeId);
    if (local) return local;
    if (!isBodyScope(p.scopeType)) {
      const body = cands.find((d) => isBodyScope(d.scopeType));
      return body ?? null;
    }
    return cands.find((d) => isBodyScope(d.scopeType)) ?? null;
  }

  const uses: DefinitionUse[] = [];
  const claimed = new Set<string>();
  for (const p of provisions) {
    if (!p.ownsText) continue;
    for (const [norm] of byTerm) {
      const def = resolveDef(norm, p);
      if (!def) continue;
      const rx = new RegExp(`\\b${escapeRe(def.term)}\\b`, "g");
      let m: RegExpExecArray | null;
      while ((m = rx.exec(p.canonicalText))) {
        if (p.provisionId === def.definingProvisionId && m.index >= def.start && m.index < def.end) {
          continue;
        }
        const spanKey = `${p.provisionId}:${m.index}:${m.index + m[0].length}`;
        if (claimed.has(spanKey)) continue;
        claimed.add(spanKey);
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
