import { createHash } from "node:crypto";
import type { ExtractedDocument } from "../types.ts";
import { sourceSpan, evaluatedScope, type ProofSource, type SourceParagraph } from "../source-map.ts";
import { ProofFindingSchema, type ProofFinding, type LaunchRuleId } from "./contracts.ts";
import { TYPO_ALLOWLIST, DUPLICATE_FUNCTION_WORDS, DUPLICATE_WORD_SEPARATOR } from "./typo-allowlist.ts";
import { absenceBlockingReasons } from "./evidence.ts";
import type { ProofIndexSet } from "./indexes/types.ts";

export type LaunchContext = { source: ProofSource; extracted: ExtractedDocument; sourceSha256: string; indexes?: ProofIndexSet };
type Candidate = { p: SourceParagraph; start: number; end: number; replacement?: string; comment: string; related?: ProofFinding["relatedSpans"]; scopeEvidence?: ProofFinding["scopeEvidence"] };
export function candidateFinding(rule: LaunchRuleId, c: Candidate): ProofFinding {
  const quote = c.p.text.slice(c.start, c.end);
  return ProofFindingSchema.parse({
    id: createHash("sha256").update(JSON.stringify([rule, c.p.partUri, c.p.storyId, c.p.paragraphPath, c.start, c.end, quote])).digest("hex"),
    ruleId: rule, ruleVersion: 1, kind: c.replacement === undefined ? "comment" : "correction",
    category: rule.startsWith("language.") ? "language" : rule.startsWith("definitions.") ? "definitions" : rule.startsWith("references.") ? "references" : "completion",
    severity: c.replacement === undefined ? "attention" : "suggestion", primarySpan: sourceSpan(c.p, c.start, c.end), relatedSpans: c.related ?? [], exactQuote: quote,
    replacement: c.replacement ?? null, comment: c.comment, scopeEvidence: c.scopeEvidence ?? null,
  });
}

function quoted(text: string, start: number, end: number): boolean {
  const ranges = /[“"]([^”"\n]+)[”"]|‘([^’\n]+)’/g;
  for (const m of text.matchAll(ranges)) if (m.index < end && m.index + m[0].length > start) return true;
  return false;
}

function explicitEnglish(p: SourceParagraph): boolean {
  if (!p.language) return true;
  const lang = p.language.toLowerCase();
  return lang === "en" || lang.startsWith("en-");
}

function ordinaryProse(p: SourceParagraph, start: number, end: number, ctx: LaunchContext): boolean {
  if (!p.safe || /heading|title|address|signature/i.test(p.style ?? "")) return false;
  if (!explicitEnglish(p)) return false;
  if (/\b(?:between|registered office|residing at|on behalf of|signed by|witness|address|party name)\b/i.test(p.text)) return false;
  const at = ctx.source.paragraphs.indexOf(p);
  if (ctx.source.paragraphs.slice(0, at + 1).some((s) => /^\s*(?:IN WITNESS|SIGNATURES|EXECUTION BLOCK)/i.test(s.text))) return false;
  if (quoted(p.text, start, end)) return false;
  // Avoid declaration labels, named/quoted identifiers and unusual language scopes.
  if (/^\s*(?:\d+(?:\.\d+)*[.)]?\s+)?[^.]{1,100}\s+(?:means|shall mean)\b/i.test(p.text) && start < p.text.search(/\b(?:means|shall mean)\b/i)) return false;
  if ([...p.text].some((c) => /\p{L}/u.test(c) && !/\p{Script=Latin}/u.test(c))) return false;
  for (const m of p.text.matchAll(/\S*(?:https?:\/\/|www\.|@|[\\/])\S*/g)) if (m.index < end && m.index + m[0].length > start) return false;
  if (!/\b(?:shall|will|must|may|should|has|have|is|are|was|were)\b/i.test(p.text)) return false;
  // A definition/party label reused elsewhere is never an ordinary-prose correction.
  const word = p.text.slice(start, end).trim().toLowerCase();
  for (const other of ctx.source.paragraphs) {
    for (const m of other.text.matchAll(/[“"]([^”"\n]{1,100})[”"]/g)) {
      if (m[1].toLowerCase().split(/\s+/).includes(word)) return false;
    }
  }
  return true;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function typoTokenPattern(): RegExp {
  const keys = Object.keys(TYPO_ALLOWLIST).sort((a, b) => b.length - a.length).map(escapeRegExp);
  return new RegExp(String.raw`\b(?:${keys.join("|")})\b`, "g");
}

function duplicateWordPattern(): RegExp {
  return new RegExp(String.raw`\b([a-z]+)(${DUPLICATE_WORD_SEPARATOR})(\1)\b`, "g");
}

function language(ctx: LaunchContext, rule: LaunchRuleId): ProofFinding[] {
  const out: ProofFinding[] = [];
  const regex = rule === "language.typo_allowlist" ? typoTokenPattern() : duplicateWordPattern();
  for (const p of ctx.source.paragraphs) {
    for (const m of p.text.matchAll(regex)) {
      if (rule === "language.duplicate_word" && !(DUPLICATE_FUNCTION_WORDS as readonly string[]).includes(m[1]!)) continue;
      const start = rule === "language.duplicate_word" ? m.index + m[1]!.length + m[2]!.length : m.index;
      const end = rule === "language.duplicate_word" ? start + m[3]!.length : m.index + m[0].length;
      if (!ordinaryProse(p, m.index, m.index + m[0].length, ctx)) continue;
      const nodes = p.nodes.filter((n) => n.start < end && n.end > start);
      const replacement = rule === "language.typo_allowlist" ? TYPO_ALLOWLIST[m[0]] : "";
      if (rule === "language.typo_allowlist" && !replacement) continue;
      if (nodes.some((n) => !n.editable)) {
        if (nodes.every((n) => n.editable || n.revision)) out.push(candidateFinding(rule, { p, start, end, comment: `Possible correction: ‘${p.text.slice(start, end)}’ → ‘${replacement}’. This text is already within an existing tracked change.` }));
        continue;
      }
      out.push(candidateFinding(rule, { p, start, end, replacement, comment: rule === "language.typo_allowlist" ? `Possible typo: ‘${m[0]}’ → ‘${replacement}’.` : "Repeated function word." }));
    }
  }
  return out;
}

const PLACEHOLDER_PATTERNS: readonly RegExp[] = [
  /\[●\]/g,
  /\[(?:…|\.{3})\]/g,
  /\[TBD[^\]]{0,40}\]/gi,
  /\[insert [^\]]{1,80}\]/gi,
  /\[draft[^\]]{0,40}\]/gi,
  /_{4,}/g,
  /[—–]{4,}/g,
  /\bXX\.XX\b/g,
  /‹[^›]{1,80}›/g,
  /\{(?:insert [^}]{1,80}|TBD[^}]{0,40}|draft[^}]{0,40}|date|name|amount|address|●|…|\.{3})\}/gi,
];

function placeholderHits(text: string): { start: number; end: number }[] {
  const hits: { start: number; end: number }[] = [];
  for (const pattern of PLACEHOLDER_PATTERNS) {
    for (const m of text.matchAll(pattern)) {
      hits.push({ start: m.index, end: m.index + m[0].length });
    }
  }
  hits.sort((a, b) => a.start - b.start || (b.end - a.end));
  const kept: { start: number; end: number }[] = [];
  for (const hit of hits) {
    if (kept.some((prior) => prior.start < hit.end && hit.start < prior.end)) continue;
    kept.push(hit);
  }
  return kept;
}

function skipPlaceholder(p: SourceParagraph, start: number, end: number, ctx: LaunchContext): boolean {
  if (quoted(p.text, start, end)) return true;
  if (/heading|title|address|signature/i.test(p.style ?? "")) return true;
  const at = ctx.source.paragraphs.indexOf(p);
  if (ctx.source.paragraphs.slice(0, at + 1).some((s) => /^\s*(?:IN WITNESS|SIGNATURES|EXECUTION BLOCK)/i.test(s.text))) return true;
  const slice = p.text.slice(start, end);
  if (/^_{4,}$/.test(slice) || /^[—–]{4,}$/.test(slice)) {
    if (p.isTable) return true;
    if (/^[\s_—–.-]*$/.test(p.text)) return true;
    if (/\b(?:signed by|signature|for and on behalf)\b/i.test(p.text)) return true;
  }
  return false;
}

function labels(ctx: LaunchContext) {
  const body = ctx.extracted.blocks.filter((b) => !b.isHeaderFooter);
  const result: { p: SourceParagraph; label: string; start: number; end: number }[] = [];
  for (let i = 0; i < ctx.source.paragraphs.length; i++) {
    const p = ctx.source.paragraphs[i];
    const literal = p.text.match(/^\s*(?:(?:Clause|Section)\s+)?(\d+(?:\.\d+)*)(?:[.)](?=\s)|(?=\s))\s+/i);
    if (literal) result.push({ p, label: literal[1], start: literal[0].indexOf(literal[1]), end: literal[0].indexOf(literal[1]) + literal[1].length });
    else if (body[i]?.numbering && p.text.trim()) {
      if (body[i].text !== p.text) throw new Error("numbering_source_mismatch");
      result.push({ p, label: body[i].numbering!.replace(/[.)]+$/, ""), start: 0, end: p.text.length });
    }
  }
  return result;
}

export function launchRuleFindings(ctx: LaunchContext, rule: LaunchRuleId): ProofFinding[] {
  if (rule.startsWith("language.")) return language(ctx, rule);
  const out: ProofFinding[] = [];
  if (rule === "completion.placeholder") {
    for (const p of ctx.source.paragraphs.filter((paragraph) => paragraph.safe)) {
      for (const hit of placeholderHits(p.text)) {
        if (skipPlaceholder(p, hit.start, hit.end, ctx)) continue;
        const quote = p.text.slice(hit.start, hit.end);
        out.push(candidateFinding(rule, { p, start: hit.start, end: hit.end, comment: `This placeholder is unfilled: ${quote}. Please complete or remove it.` }));
      }
    }
  }
  if (rule.startsWith("references.")) {
    if (!ctx.source.complete || ctx.extracted.capabilities.some((c) => c.name === "numbering" && c.state === "unsupported")) throw new Error("incomplete_numbering_scope");
    if (rule === "references.missing_target") {
      const receipt = ctx.extracted.packageCapabilityReceipt;
      if (!receipt || absenceBlockingReasons(receipt).length) throw new Error("incomplete_numbering_scope");
    }
    const inventory = labels(ctx);
    if (rule === "references.duplicate_number") {
      const seen = new Map<string, typeof inventory[number]>();
      for (const entry of inventory) {
        const key = `${entry.p.scope}:${entry.label}`, prior = seen.get(key);
        if (prior) out.push(candidateFinding(rule, { ...entry, comment: `Clause number ${entry.label} appears more than once in this scope. Please check the numbering.`, related: [sourceSpan(prior.p, prior.start, prior.end)] }));
        else seen.set(key, entry);
      }
    } else for (const p of ctx.source.paragraphs) {
      for (const m of p.text.matchAll(/\b(?:Clause|Section)\s+(\d+(?:\.\d+)*)\b/g)) {
        // Explicit external, cross-scope, range and coordinated references need richer resolution.
        const sentence = p.text.slice(Math.max(p.text.lastIndexOf(";", m.index) + 1, 0));
        if (/\b(?:Act|Rules|Regulations|statute|Code|Schedule|Annexure|Exhibit|other agreement)\b/i.test(sentence) || /\bof\s+(?:the|a|an)\s+[^.;]{0,100}(?:Agreement|Deed|Document)\b/i.test(sentence)) continue;
        if (/^\s*(?:[-–]|to\b|and\b|,)/.test(p.text.slice(m.index + m[0].length))) continue;
        if (/^\s*$/.test(p.text.slice(0, m.index))) continue; // Declaration, not a use.
        const matches = inventory.filter((e) => e.p.scope === p.scope && e.label === m[1]).length;
        if (matches === 0) out.push(candidateFinding(rule, { p, start: m.index, end: m.index + m[0].length, comment: `${m[0]} was not found in the checked ${p.scope === "main_body" ? "main-body" : "schedule"} numbering scope. Please confirm the reference.`, scopeEvidence: evaluatedScope(ctx.source, p.scope, 0) }));
      }
    }
  }
  if (rule === "definitions.duplicate") {
    if (!ctx.source.complete) throw new Error("incomplete_definition_scope");
    const seen = new Map<string, { p: SourceParagraph; start: number; end: number }>();
    for (const p of ctx.source.paragraphs) {
      const m = p.text.match(/^\s*(?:\d+(?:\.\d+)*[.)]?\s+)?[“"]([^”"]+)[”"]\s+(?:means|shall mean)\b/i);
      if (!m) continue;
      const start = m[0].indexOf(m[1]), end = start + m[1].length, key = `${p.scope}:${m[1].toLowerCase()}`, prior = seen.get(key);
      if (prior) out.push(candidateFinding(rule, { p, start, end, comment: "This term is defined more than once in this scope. Please check the definitions.", related: [sourceSpan(prior.p, prior.start, prior.end)] }));
      else seen.set(key, { p, start, end });
    }
  }
  return out;
}
