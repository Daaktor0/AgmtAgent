import type { SourceParagraph } from "../source-map.ts";
import type { ProofFinding, LaunchRuleId } from "./contracts.ts";
import { TYPO_ALLOWLIST, DUPLICATE_FUNCTION_WORDS, DUPLICATE_WORD_SEPARATOR } from "./typo-allowlist.ts";
import { candidateFinding, quoted, explicitEnglish, type LaunchContext } from "./launch-context.ts";
import { referenceRuleFindings } from "./rules/references.ts";
import { definitionRuleFindings } from "./rules/definitions.ts";

export { candidateFinding, type LaunchContext } from "./launch-context.ts";

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
  if (rule.startsWith("references.")) return referenceRuleFindings(ctx, rule);
  if (rule.startsWith("definitions.")) return definitionRuleFindings(ctx, rule);
  return out;
}
