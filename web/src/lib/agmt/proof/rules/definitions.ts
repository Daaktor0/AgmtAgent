/**
 * Index-backed definition rules (PEE-11 / PWC-41).
 * Comment-only. Incomplete inventories suppress absence claims.
 * Ambiguous inventories never become automatic corrections.
 */
import { CAP_STOPWORDS } from "../../patterns.ts";
import { sourceSpan, evaluatedScope, type SourceParagraph } from "../../source-map.ts";
import { candidateFinding, paragraphForSpan, quoted, explicitEnglish, type LaunchContext } from "../launch-context.ts";
import type { LaunchRuleId, ProofFinding } from "../contracts.ts";
import type { DefinitionEntry } from "../indexes/types.ts";

const GENERIC_NOUNS = new Set(["agreement", "deed", "contract", "parties", "party", "appendix", "notice"]);
const COMMON_WORDS = new Set([
  ...GENERIC_NOUNS,
  "confidential", "information", "services", "service", "business", "day",
  "data", "personal", "intellectual", "property", "employee", "employer",
  "company", "customer", "product", "products", "software", "document",
  "documents", "record", "records", "fee", "fees", "payment", "payments",
  "term", "terms", "condition", "conditions", "right", "rights",
  "obligation", "obligations", "law", "laws", "regulation", "regulations",
  "date", "time", "year", "month", "period", "amount", "price",
  "share", "shares", "board", "director", "directors", "work", "group",
  "person", "persons", "entity", "affiliate", "affiliates", "subsidiary",
  "control", "interest", "interests", "asset", "assets", "liability",
  "liabilities", "tax", "taxes", "loss", "losses", "claim", "claims",
  "event", "events", "change", "material", "adverse", "effect",
]);
const PROPER_NOUN_HEADS = new Set([
  "court", "bank", "exchange", "limited", "ltd", "llp", "inc", "plc", "llc",
  "university", "college", "department", "ministry", "commission", "authority",
  "government", "council", "street", "road", "avenue", "city", "kingdom",
  "republic", "federation", "islands", "county", "state", "island",
  "hospital", "agency", "office", "tribunal", "registry", "stock", "reserve",
  "act", "code", "rules", "ordinance", "bill", "kong", "york",
]);
const GEO_STARTERS = new Set([
  "new", "hong", "united", "south", "north", "east", "west", "great",
  "saint", "san", "santa", "los", "las", "mount", "port", "fort", "lake", "cape",
]);
const TITLE_CASE = /\b([A-Z][A-Za-z0-9'&/-]*(?:\s+[A-Z][A-Za-z0-9'&/-]*)+)\b/g;
const LOCATION_QUALIFIER = /^\s+(?:stated|set out|listed|described|specified|identified)\s+in\s+(?:this\s+)?(?:Schedule|Annexure|Annex|Appendix|Exhibit|Clause|Section|the Original)\b/i;
const HEADER_DEFINITION = /[“"][^”"]+[”"]\s+(?:means and includes|shall have the meaning|has the meaning|shall mean|means|includes|as defined in)\b|[“"][^”"]+[”"]\s*:/;
const LOCAL_PURPOSE = /\bfor the purposes of this (?:schedule|annexure|annex|appendix|exhibit|part)\b/i;
const EXPRESS_OVERRIDE = /\b(?:notwithstanding|unless otherwise (?:defined|provided|specified)|except as otherwise (?:defined|provided|specified)|only for (?:the purposes of )?this (?:schedule|annexure|annex|appendix|exhibit|part)|in this (?:schedule|annexure|annex|appendix|exhibit|part) only)\b/i;

function headerDefinitionGap(ctx: LaunchContext): boolean {
  return ctx.extracted.blocks.some((block) => block.isHeaderFooter && HEADER_DEFINITION.test(block.text));
}

function requireCompleteDefinitions(ctx: LaunchContext, rule: LaunchRuleId): void {
  if (!ctx.indexes) throw new Error("incomplete_definition_scope");
  if (!ctx.source.complete || ctx.indexes.definitions.completeness !== "complete") {
    throw new Error("incomplete_definition_scope");
  }
  if ((rule === "definitions.undefined_use" || rule === "definitions.unused") && headerDefinitionGap(ctx)) {
    throw new Error("incomplete_definition_scope");
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function headingOrParty(paragraph: SourceParagraph): boolean {
  if (/heading|title|address|signature/i.test(paragraph.style ?? "")) return true;
  if (/\b(?:between|registered office|residing at|on behalf of|signed by|witness)\b/i.test(paragraph.text)) return true;
  return false;
}

function titleLike(paragraph: SourceParagraph): boolean {
  if (headingOrParty(paragraph)) return true;
  const text = paragraph.text.trim();
  if (text.length > 80 || /[.?!]/.test(text) || /\b(?:shall|will|must|may|should|means)\b/i.test(text)) return false;
  const words = text.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.every((word) => word[0] === word[0]?.toUpperCase());
}

function sentenceStart(text: string, start: number): boolean {
  if (start === 0) return true;
  const before = text.slice(0, start).trimEnd();
  return /[.!?;:]$/.test(before);
}

function inRevision(paragraph: SourceParagraph, start: number, end: number): boolean {
  return paragraph.nodes.some((node) => node.revision && node.start < end && node.end > start);
}

function sameSpan(entry: DefinitionEntry, paragraph: SourceParagraph, start: number, end: number): boolean {
  return entry.span.partUri === paragraph.partUri
    && JSON.stringify(entry.span.paragraphPath) === JSON.stringify(paragraph.paragraphPath)
    && entry.span.textStart === start
    && entry.span.textEnd === end;
}

function sameParagraph(entry: DefinitionEntry, paragraph: SourceParagraph): boolean {
  return entry.span.partUri === paragraph.partUri
    && JSON.stringify(entry.span.paragraphPath) === JSON.stringify(paragraph.paragraphPath);
}

function ordinaryLowercaseUse(entry: DefinitionEntry, quote: string): boolean {
  if (quote !== quote.toLowerCase()) return false;
  const words = entry.normalisedTerm.split(/\s+/).filter((word) => /[a-z]/i.test(word));
  return words.length > 0 && words.every((word) => COMMON_WORDS.has(word));
}

function intendedLocalOverride(paragraph: SourceParagraph): boolean {
  return LOCAL_PURPOSE.test(paragraph.text) || EXPRESS_OVERRIDE.test(paragraph.text);
}

function properNounPhrase(phrase: string): boolean {
  const words = phrase.split(/\s+/);
  const first = words[0]!.toLowerCase();
  const last = words[words.length - 1]!.toLowerCase();
  if (PROPER_NOUN_HEADS.has(first) || PROPER_NOUN_HEADS.has(last) || GEO_STARTERS.has(first)) return true;
  return /\b(?:limited|ltd\.?|llp|inc\.?|plc|llc|pte\.?|gmbh)\b/i.test(phrase);
}

function definedTermDeterminer(text: string, start: number): boolean {
  return /(?:^|[\s,;:(])(?:the|this|such|any|each|every)\s+$/i.test(text.slice(0, start));
}

function termUses(ctx: LaunchContext, term: string): { paragraph: SourceParagraph; start: number; end: number; quote: string }[] {
  const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, "gi");
  const hits: { paragraph: SourceParagraph; start: number; end: number; quote: string }[] = [];
  for (const paragraph of ctx.source.paragraphs) {
    for (const match of paragraph.text.matchAll(new RegExp(pattern.source, "gi"))) {
      hits.push({ paragraph, start: match.index, end: match.index + match[0].length, quote: match[0] });
    }
  }
  return hits;
}

export function definitionRuleFindings(ctx: LaunchContext, rule: LaunchRuleId): ProofFinding[] {
  requireCompleteDefinitions(ctx, rule);
  const indexes = ctx.indexes!;
  const out: ProofFinding[] = [];
  const local = indexes.definitions.entries.filter((entry) => !entry.imported);

  if (rule === "definitions.duplicate") {
    const seen = new Map<string, DefinitionEntry>();
    for (const entry of local) {
      const key = `${entry.scope}:${entry.normalisedTerm}`;
      const prior = seen.get(key);
      const paragraph = paragraphForSpan(ctx.source, entry.span);
      if (!paragraph) continue;
      if (prior) {
        const priorParagraph = paragraphForSpan(ctx.source, prior.span);
        if (!priorParagraph) continue;
        out.push(candidateFinding(rule, {
          p: paragraph,
          start: entry.span.textStart,
          end: entry.span.textEnd,
          comment: "This term is defined more than once in this scope. Please check the definitions.",
          related: [sourceSpan(priorParagraph, prior.span.textStart, prior.span.textEnd)],
        }));
      } else seen.set(key, entry);
    }
    return out;
  }

  if (rule === "definitions.scope_redefinition") {
    for (const entry of local) {
      if (!entry.parentTerm) continue;
      const parent = local.find((candidate) => candidate.scope === "main_body" && candidate.normalisedTerm === entry.normalisedTerm);
      if (!parent || parent.imported || parent.bodyKey === entry.bodyKey) continue;
      const paragraph = paragraphForSpan(ctx.source, entry.span);
      const parentParagraph = paragraphForSpan(ctx.source, parent.span);
      if (!paragraph || !parentParagraph) continue;
      if (inRevision(paragraph, entry.span.textStart, entry.span.textEnd)) continue;
      if (intendedLocalOverride(paragraph)) continue;
      out.push(candidateFinding(rule, {
        p: paragraph,
        start: entry.span.textStart,
        end: entry.span.textEnd,
        comment: `Review question: “${entry.term}” is defined in this schedule with different text from the main-body definition. Please confirm whether the local definition is intended.`,
        related: [sourceSpan(parentParagraph, parent.span.textStart, parent.span.textEnd)],
      }));
    }
    return out;
  }

  if (rule === "definitions.unused") {
    for (const entry of local) {
      const paragraph = paragraphForSpan(ctx.source, entry.span);
      if (!paragraph) continue;
      const uses = termUses(ctx, entry.term).filter((hit) => !sameSpan(entry, hit.paragraph, hit.start, hit.end) && hit.quote === entry.term);
      if (uses.length) continue;
      out.push(candidateFinding(rule, {
        p: paragraph,
        start: entry.span.textStart,
        end: entry.span.textEnd,
        comment: `“${entry.term}” is defined but not used elsewhere in the checked text. Please confirm whether the definition is needed.`,
        scopeEvidence: evaluatedScope(ctx.source, entry.scope, 0),
      }));
    }
    return out;
  }

  if (rule === "definitions.case_variant") {
    for (const entry of local) {
      if (GENERIC_NOUNS.has(entry.normalisedTerm)) continue;
      for (const hit of termUses(ctx, entry.term)) {
        if (hit.quote === entry.term) continue;
        if (sameParagraph(entry, hit.paragraph)) continue;
        if (quoted(hit.paragraph.text, hit.start, hit.end)) continue;
        if (!explicitEnglish(hit.paragraph) || headingOrParty(hit.paragraph) || titleLike(hit.paragraph)) continue;
        if (inRevision(hit.paragraph, hit.start, hit.end)) continue;
        if (ordinaryLowercaseUse(entry, hit.quote)) continue;
        if (sentenceStart(hit.paragraph.text, hit.start) && hit.quote[0] === hit.quote[0]?.toUpperCase() && entry.term.toLowerCase() === hit.quote.toLowerCase() && entry.term[0] === entry.term[0]?.toUpperCase() && hit.quote.slice(1) === entry.term.slice(1).toLowerCase() && entry.term.includes(" ") === false) {
          continue;
        }
        if (hit.quote.toLowerCase() === `${entry.term.toLowerCase()}s`) continue;
        out.push(candidateFinding(rule, {
          p: hit.paragraph,
          start: hit.start,
          end: hit.end,
          comment: `Review question: “${hit.quote}” looks like the defined term “${entry.term}” with different capitalisation. Please confirm the intended form.`,
        }));
      }
    }
    return out;
  }

  if (rule === "definitions.undefined_use") {
    const defined = new Set(indexes.definitions.entries.map((entry) => entry.normalisedTerm));
    for (const paragraph of ctx.source.paragraphs) {
      if (!explicitEnglish(paragraph) || headingOrParty(paragraph) || titleLike(paragraph)) continue;
      for (const match of paragraph.text.matchAll(new RegExp(TITLE_CASE.source, "g"))) {
        const phrase = match[1]!;
        const start = match.index;
        const end = start + phrase.length;
        if (quoted(paragraph.text, start, end)) continue;
        if (sentenceStart(paragraph.text, start)) continue;
        if (inRevision(paragraph, start, end)) continue;
        if (!definedTermDeterminer(paragraph.text, start)) continue;
        if (LOCATION_QUALIFIER.test(paragraph.text.slice(end))) continue;
        if (properNounPhrase(phrase)) continue;
        const words = phrase.split(/\s+/);
        if (words.some((word) => CAP_STOPWORDS.has(word))) continue;
        if (defined.has(phrase.toLowerCase())) continue;
        if (indexes.definitions.entries.some((entry) => phrase.toLowerCase().includes(entry.normalisedTerm) || entry.normalisedTerm.includes(phrase.toLowerCase()))) continue;
        if (indexes.parties.entries.some((party) =>
          party.shortName === phrase || party.legalName === phrase
          || phrase === party.shortName || (party.legalName != null && (phrase === party.legalName || party.legalName.includes(phrase) || phrase.includes(party.shortName)))
        )) continue;
        out.push(candidateFinding(rule, {
          p: paragraph,
          start,
          end,
          comment: `Review question: “${phrase}” is written like a defined term but no matching definition was found in the checked text. Please confirm whether it should be defined.`,
        }));
      }
    }
  }
  return out;
}
