import { CAP_STOPWORDS, LEGAL_STOPWORDS, PARTY_LABELS, RE_PLACEHOLDER, RE_XREF } from "../patterns.ts";
import type {
  Definition,
  DefinitionUse,
  ExtractedDocument,
  ProofHitDraft,
  Provision,
  SignatureInventory,
} from "../types.ts";

export type CheckCtx = {
  provisions: Provision[];
  definitions: Definition[];
  uses: DefinitionUse[];
  extracted: ExtractedDocument;
};

function leaves(ctx: CheckCtx): Provision[] {
  return ctx.provisions.filter((p) => p.ownsText);
}

function hit(
  checkId: string,
  checkVersion: number,
  severity: ProofHitDraft["severity"],
  certainty: ProofHitDraft["certainty"],
  p: Provision,
  start: number,
  end: number,
  detailCode: string,
  detailArgs: ProofHitDraft["detailArgs"],
): ProofHitDraft {
  const s = Math.max(0, start);
  const e = Math.min(p.canonicalLength, Math.max(s + 1, end));
  return { checkId, checkVersion, severity, certainty, provisionId: p.provisionId, quoteStart: s, quoteEnd: e, detailCode, detailArgs };
}

export function runDefterm(ctx: CheckCtx): ProofHitDraft[] {
  const out: ProofHitDraft[] = [];
  const defined = new Set(ctx.definitions.map((d) => d.normalisedTerm));
  const usedIds = new Set(ctx.uses.map((u) => u.definitionId));

  for (const d of ctx.definitions) {
    if (!usedIds.has(d.definitionId)) {
      const p = ctx.provisions.find((x) => x.provisionId === d.definingProvisionId);
      if (!p) continue;
      out.push(
        hit("defterm.unused", 1, "low", "exact", p, d.start, d.end, "defined_but_unused", {
          term: d.term,
        }),
      );
    }
  }

  const skip = new Set([...LEGAL_STOPWORDS, ...[...CAP_STOPWORDS].map((s) => s.toLowerCase())]);
  for (const p of leaves(ctx)) {
    const rx = /\b[A-Z][A-Za-z]{2,}(?:\s+[A-Z][A-Za-z]{2,}){0,3}\b/g;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(p.canonicalText))) {
      if (m.index === 0) continue;
      const before = p.canonicalText.slice(0, m.index);
      if (/(^|[.!?]\s+)$/.test(before)) continue;
      if (CAP_STOPWORDS.has(m[0].split(" ")[0])) continue;
      const norm = m[0].toLowerCase();
      if (skip.has(norm) || defined.has(norm)) continue;
      if (PARTY_LABELS.some((l) => l.toLowerCase() === norm)) continue;
      if (m[0].length < 5) continue;
      out.push(
        hit("defterm.undefined_candidate", 1, "low", "heuristic", p, m.index, m.index + m[0].length, "possibly_undefined", {
          term: m[0],
        }),
      );
    }
  }
  return out;
}

export function runStructure(ctx: CheckCtx): ProofHitDraft[] {
  const out: ProofHitDraft[] = [];
  const numbers = new Map<string, { scope: string; provision: Provision }[]>();
  for (const p of leaves(ctx)) {
    if (!p.number) continue;
    const key = p.number.replace(/^Clause\s+|^Section\s+/i, "");
    const list = numbers.get(key) ?? [];
    list.push({ scope: `${p.scopeType}:${p.scopeId}`, provision: p });
    numbers.set(key, list);
  }

  for (const [num, list] of numbers) {
    const byScope = new Map<string, Provision[]>();
    for (const x of list) {
      const arr = byScope.get(x.scope) ?? [];
      arr.push(x.provision);
      byScope.set(x.scope, arr);
    }
    for (const [, arr] of byScope) {
      if (arr.length > 1 && /^\d+(\.\d+)*$/.test(num)) {
        const p = arr[1];
        out.push(
          hit("structure.duplicate_number", 1, "medium", "exact", p, 0, Math.min(p.canonicalLength, num.length + 2), "duplicate_number", {
            number: num,
          }),
        );
      }
    }
  }

  const byScopeNums = new Map<string, number[]>();
  for (const p of leaves(ctx)) {
    if (!p.number || !/^\d+$/.test(p.number)) continue;
    const k = `${p.scopeType}:${p.scopeId}`;
    const arr = byScopeNums.get(k) ?? [];
    arr.push(Number(p.number));
    byScopeNums.set(k, arr);
  }
  for (const [scope, arr] of byScopeNums) {
    const uniq = [...new Set(arr)].sort((a, b) => a - b);
    for (let i = 1; i < uniq.length; i++) {
      if (uniq[i] > uniq[i - 1] + 1) {
        const p = leaves(ctx).find((x) => x.number === String(uniq[i]) && `${x.scopeType}:${x.scopeId}` === scope);
        if (p) {
          out.push(
            hit("structure.numbering_gap", 1, "medium", "exact", p, 0, Math.min(8, p.canonicalLength), "numbering_gap", {
              missing: uniq[i - 1] + 1,
            }),
          );
        }
      }
    }
  }

  const declared = new Set<string>();
  for (const p of leaves(ctx)) {
    if (p.number) {
      declared.add(p.number.toLowerCase());
      declared.add(p.number.replace(/^Clause\s+|^Section\s+/i, "").toLowerCase());
    }
    const h = p.heading?.toLowerCase();
    if (h) declared.add(h);
    const sch = p.canonicalText.match(/^(Schedule|Annexure|Annex|Exhibit|Appendix|Part)\s+([0-9A-Z]+)/i);
    if (sch) {
      declared.add(`${sch[1].toLowerCase()} ${sch[2].toLowerCase()}`);
      declared.add(sch[2].toLowerCase());
    }
  }

  for (const p of leaves(ctx)) {
    const rx = new RegExp(RE_XREF.source, "g");
    let m: RegExpExecArray | null;
    while ((m = rx.exec(p.canonicalText))) {
      const kind = m[1];
      const num = m[2];
      if (/^(act|code|rules?)$/i.test(kind)) continue;
      const key = `${kind} ${num}`.toLowerCase();
      const numKey = num.toLowerCase();
      const found =
        declared.has(key) ||
        declared.has(numKey) ||
        declared.has(`clause ${numKey}`) ||
        declared.has(`section ${numKey}`) ||
        declared.has(`schedule ${numKey}`);
      if (!found) {
        out.push(
          hit("structure.broken_xref", 1, "high", "exact", p, m.index, m.index + m[0].length, "broken_xref", {
            ref: m[0],
          }),
        );
      }
    }
  }
  return out;
}

export function signatureInventory(ctx: CheckCtx): SignatureInventory {
  const named = new Set<string>();
  for (const d of ctx.definitions) {
    if (d.definitionKind === "defined_party") named.add(d.term);
  }
  for (const label of PARTY_LABELS) {
    for (const p of leaves(ctx).slice(0, 20)) {
      if (new RegExp(`\\b${label}\\b`).test(p.canonicalText)) named.add(label);
    }
  }
  const blocks: SignatureInventory["blocks"] = [];
  for (const p of leaves(ctx)) {
    if (p.nodeType !== "signature_block" && !/for and on behalf|authorised signatory|signed by/i.test(p.canonicalText)) {
      continue;
    }
    const label =
      PARTY_LABELS.find((l) => new RegExp(`\\b${l}\\b`, "i").test(p.canonicalText)) ??
      p.canonicalText.slice(0, 40);
    blocks.push({
      label,
      provisionId: p.provisionId,
      capacity: /director|authorised|attorney/i.exec(p.canonicalText)?.[0] ?? null,
    });
  }
  return { namedParties: [...named], blocks };
}

export function runExec(ctx: CheckCtx): ProofHitDraft[] {
  const out: ProofHitDraft[] = [];
  const inv = signatureInventory(ctx);
  for (const party of inv.namedParties) {
    const has = inv.blocks.some((b) => b.label.toLowerCase() === party.toLowerCase());
    if (!has && ["Company", "Investor", "Promoter", "Purchaser", "Seller"].includes(party)) {
      const p = leaves(ctx).find((x) => x.nodeType === "signature_block") ?? leaves(ctx)[leaves(ctx).length - 1];
      if (p) {
        out.push(
          hit("exec.signature_block_mismatch", 1, "medium", "exact", p, 0, Math.min(40, p.canonicalLength), "missing_block", {
            party,
          }),
        );
      }
    }
  }

  for (const h of ctx.extracted.hiddenChars) {
    const p = ctx.provisions.find((x) => x.blockIndex === h.blockIndex && x.ownsText);
    if (!p) continue;
    out.push(
      hit("exec.hidden_character", 1, "medium", "exact", p, h.start, h.end, "hidden_character", {
        kind: h.kind,
      }),
    );
  }

  for (const f of ctx.extracted.fields) {
    if (!f.unresolved) continue;
    const p = leaves(ctx)[0];
    if (!p) continue;
    out.push(
      hit("exec.suspicious_field", 1, "medium", "exact", p, 0, Math.min(20, p.canonicalLength), "suspicious_field", {
        instr: f.instr.slice(0, 80),
      }),
    );
  }

  for (const p of leaves(ctx)) {
    const rx = new RegExp(RE_PLACEHOLDER.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = rx.exec(p.canonicalText))) {
      if (/^\[[A-Z]+_\d+\]$/.test(m[0])) continue; // canonical placeholders
      if (/^\[(?:Company|Investor|Promoter|Agreement)\]$/.test(m[0])) continue;
      out.push(
        hit("exec.unfilled_placeholder", 1, "high", "exact", p, m.index, m.index + m[0].length, "unfilled_placeholder", {
          token: m[0],
        }),
      );
    }
  }

  if (ctx.extracted.comments.length) {
    for (const c of ctx.extracted.comments) {
      const p = leaves(ctx)[0];
      if (!p) continue;
      out.push(
        hit("exec.unresolved_comment", 1, "medium", "exact", p, 0, Math.min(12, p.canonicalLength), "unresolved_comment", {
          author: c.author || "unknown",
        }),
      );
    }
  }

  const headerText = ctx.extracted.headersFooters.join("\n");
  const definedParties = ctx.definitions.filter((d) => d.definitionKind === "defined_party").map((d) => d.term);
  if (headerText && definedParties.length) {
    const headerHasParty = definedParties.some((t) => headerText.includes(t));
    const otherName = headerText.match(/[A-Z][A-Za-z0-9&.,' \-]{8,}(?:Private Limited|Limited)/);
    if (otherName && !headerHasParty) {
      const p = leaves(ctx)[0];
      if (p) {
        out.push(
          hit("party.header_counterparty_mismatch", 1, "high", "exact", p, 0, Math.min(40, p.canonicalLength), "header_mismatch", {
            header: otherName[0].slice(0, 80),
          }),
        );
      }
    }
  }

  return out;
}

export function runAmount(ctx: CheckCtx): ProofHitDraft[] {
  const out: ProofHitDraft[] = [];
  const tableBlocks = ctx.extracted.blocks.filter((b) => b.isTable);
  const amounts = (text: string) => {
    const found: { n: number; label: string; start: number; end: number }[] = [];
    const rx = /([A-Za-z][A-Za-z ]{2,40})[:\s]+(?:INR|Rs\.?|USD|₹)?\s*([0-9][0-9,]*)/g;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text))) {
      found.push({
        n: Number(m[2].replace(/,/g, "")),
        label: m[1].trim().toLowerCase(),
        start: m.index,
        end: m.index + m[0].length,
      });
    }
    return found;
  };
  const tableAmounts = tableBlocks.flatMap((b) => amounts(b.text).map((a) => ({ ...a, block: b })));
  for (const p of leaves(ctx)) {
    if (p.sourceXmlAnchor.kind === "cell") continue;
    for (const a of amounts(p.canonicalText)) {
      const clash = tableAmounts.find((t) => t.label === a.label && t.n !== a.n);
      if (clash) {
        out.push(
          hit("amount.table_prose_conflict", 1, "high", "exact", p, a.start, a.end, "table_prose_conflict", {
            label: a.label,
            prose: a.n,
            table: clash.n,
          }),
        );
      }
    }
  }
  return out;
}
