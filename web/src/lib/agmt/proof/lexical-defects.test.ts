/**
 * Synthetic regressions for split-run spelling, inherited English variants,
 * legal hyphenation, and contextual recipient placeholders.
 * Permanent tests never load the user document.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import { buildDocx } from "../docx.ts";
import { analyzeProof } from "./launch.ts";
import { processProofLocal } from "../../proof-local/pipeline.ts";
import { TYPO_ALLOWLIST } from "./typo-allowlist.ts";
import { LEGAL_ALLOWLIST } from "./legal-allowlist.ts";
import {
  ENGLISH_VARIANT_FALLBACK_DICTIONARY,
  ENGLISH_VARIANT_FALLBACK_REASON,
  resolveSpellingDictionary,
  stylesDefaultLanguage,
} from "./language.ts";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function xmlDocx(body: string, extra: Record<string, string> = {}): Promise<Buffer> {
  const zip = await JSZip.loadAsync(await buildDocx(["placeholder"]));
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>${body}<w:sectPr/></w:body></w:document>`,
    { date: new Date(0) },
  );
  for (const [name, xml] of Object.entries(extra)) {
    zip.file(name, xml, { date: new Date(0) });
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

function stylesPart(lang: string): Record<string, string> {
  return {
    "word/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="${escape(lang)}" w:eastAsia="${escape(lang)}" w:bidi="ar-SA"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`,
  };
}

function proseParagraph(inner: string): string {
  return `<w:p>${inner}</w:p>`;
}

function run(text: string, attrs = "", rPr = ""): string {
  return `<w:r${attrs}>${rPr}<w:t xml:space="preserve">${escape(text)}</w:t></w:r>`;
}

test("en-IN is English and falls back to the bundled en-GB dictionary", () => {
  const resolved = resolveSpellingDictionary("en-IN", "en-US");
  assert.equal(resolved.english, true);
  assert.equal(resolved.dictionary, ENGLISH_VARIANT_FALLBACK_DICTIONARY);
  assert.equal(resolved.fallback, "variant-en-GB");
  assert.equal(resolved.reason, ENGLISH_VARIANT_FALLBACK_REASON);
  assert.equal(resolveSpellingDictionary("en-GB").dictionary, "en-GB");
  assert.equal(resolveSpellingDictionary("en-US").dictionary, "en-US");
  assert.equal(resolveSpellingDictionary("fr-FR").english, false);
  const styles = stylesDefaultLanguage(stylesPart("en-IN")["word/styles.xml"]);
  assert.equal(styles, "en-IN");
  const noisy = stylesDefaultLanguage(
    `<?xml version="1.0"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-IN" w:eastAsia="en-IN" w:bidi="ar-SA"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`,
  );
  assert.equal(noisy, "en-IN");
});

test("Plaaase split across proofErr runs is an exact-span spelling comment suggesting Please", async () => {
  assert.equal("plaaase" in TYPO_ALLOWLIST, false);
  const after = " confirm the applicable escalation mechanism. The draft contains an inconsistency between 7% and six percent for the remaining term.";
  const body = proseParagraph(
    run("Escalation: ")
    + `<w:proofErr w:type="spellStart"/>`
    + run("Pl", ` w:rsidR="00BA2231"`)
    + run("aa", ` w:rsidR="001F7869"`)
    + run("ase", ` w:rsidR="00BA2231"`)
    + `<w:proofErr w:type="spellEnd"/>`
    + run(after),
  );
  const analysis = await analyzeProof(await xmlDocx(body, stylesPart("en-IN")));
  const hit = analysis.plan.findings.find((finding) => finding.exactQuote === "Plaaase");
  assert.equal(hit?.ruleId, "spelling.dictionary");
  assert.equal(hit?.kind, "comment");
  assert.equal(hit?.replacement, null);
  assert.equal(hit?.primarySpan.textStart, "Escalation: ".length);
  assert.equal(hit?.primarySpan.textEnd, "Escalation: Plaaase".length);
  assert.equal(hit?.primarySpan.nodeSegments.length, 3);
  assert.match(hit?.comment ?? "", /Suggested spelling: Please/);
  assert.equal(analysis.source.paragraphs[0]?.language, "en-IN");
});

test("identically and differently formatted split-run misspellings are still detected", async () => {
  const tail = " the notice in writing before the stated deadline.";
  const same = await analyzeProof(await xmlDocx(proseParagraph(run("Please send the ") + run("gov") + run("erment") + run(tail))));
  assert.equal(same.plan.findings.some((finding) => finding.exactQuote === "goverment" && finding.ruleId === "spelling.dictionary"), true);

  const mixed = await analyzeProof(await xmlDocx(proseParagraph(
    run("Please send the ")
    + run("mis", "", "<w:rPr><w:b/></w:rPr>")
    + run("pelled", "", "<w:rPr><w:i/></w:rPr>")
    + run(tail),
  )));
  const misspelled = mixed.plan.findings.find((finding) => finding.exactQuote === "mispelled");
  assert.equal(misspelled?.ruleId, "spelling.dictionary");
  assert.equal(misspelled?.kind, "comment");
});

test("inherited en-IN, en-GB and en-US select the documented dictionary", async () => {
  const frame = (word: string) => `Please send the ${word} notice in writing before Friday.`;
  const inColour = await analyzeProof(await xmlDocx(proseParagraph(run(frame("colour"))), stylesPart("en-IN")));
  assert.equal(inColour.plan.findings.some((finding) => finding.ruleId === "spelling.dictionary"), false);
  const inColor = await analyzeProof(await xmlDocx(proseParagraph(run(frame("color"))), stylesPart("en-IN")));
  assert.ok(inColor.plan.findings.some((finding) => finding.exactQuote === "color"));

  const gbColour = await analyzeProof(await xmlDocx(proseParagraph(run(frame("colour"))), stylesPart("en-GB")));
  assert.equal(gbColour.plan.findings.some((finding) => finding.ruleId === "spelling.dictionary"), false);
  const gbColor = await analyzeProof(await xmlDocx(proseParagraph(run(frame("color"))), stylesPart("en-GB")));
  assert.ok(gbColor.plan.findings.some((finding) => finding.exactQuote === "color"));

  const usColor = await analyzeProof(await xmlDocx(proseParagraph(run(frame("color"))), stylesPart("en-US")));
  assert.equal(usColor.plan.findings.some((finding) => finding.ruleId === "spelling.dictionary"), false);
  const usColour = await analyzeProof(await xmlDocx(proseParagraph(run(frame("colour"))), stylesPart("en-US")));
  assert.ok(usColour.plan.findings.some((finding) => finding.exactQuote === "colour"));

  const missingWithUsUi = await analyzeProof(await xmlDocx(proseParagraph(run(frame("color")))), { language: "en-US" });
  assert.equal(missingWithUsUi.plan.findings.some((finding) => finding.ruleId === "spelling.dictionary"), false);
  const explicitNonEnglish = await analyzeProof(await xmlDocx(
    proseParagraph(run(frame("goverment"), "", `<w:rPr><w:lang w:val="fr-FR"/></w:rPr>`)),
    stylesPart("en-IN"),
  ));
  assert.equal(explicitNonEnglish.plan.findings.some((finding) => finding.ruleId === "spelling.dictionary"), false);
});

test("between is ordinary prose unless it has party-introduction evidence", async () => {
  const ordinary = await analyzeProof(await buildDocx([
    "Please confirm the goverment payment between the parties before Friday.",
  ]));
  assert.ok(ordinary.plan.findings.some((finding) => finding.exactQuote === "goverment"));

  const partyIntroduction = await analyzeProof(await buildDocx([
    "This Agreement is made between Alpha Holdings Limited and Beta Trading Limited. Please confirm the goverment payment before Friday.",
  ]));
  assert.equal(partyIntroduction.plan.findings.some((finding) => finding.exactQuote === "goverment"), false);
});

test("licensor and hyphenated legal compounds stay silent; misspelled variants still comment", async () => {
  assert.equal(LEGAL_ALLOWLIST.has("licensor"), true);
  const clean = await analyzeProof(await buildDocx([
    "Please confirm the termination notice available to the Sub-Licensor following expiry of the term.",
    "The Licensor shall deliver the notice in writing before completion.",
    "Each licensee shall keep the pre-agreed record with the file.",
  ]));
  assert.equal(clean.plan.findings.some((finding) => finding.ruleId === "spelling.dictionary"), false);

  const dirty = await analyzeProof(await buildDocx([
    "Please confirm the termination notice available to the Sub-Licensr following expiry of the term.",
    "Please send the well-knowwn notice in writing before Friday.",
  ]));
  assert.ok(dirty.plan.findings.some((finding) => finding.exactQuote === "Licensr" && finding.ruleId === "spelling.dictionary"));
  assert.ok(dirty.plan.findings.some((finding) => finding.exactQuote === "knowwn" && finding.ruleId === "spelling.dictionary"));
});

test("Dear [-] team is an unfinished placeholder; numeric and class brackets are not", async () => {
  const positive = await analyzeProof(await buildDocx([
    "Dear [-] team,",
    "Please confirm the attached draft before circulation on Friday.",
  ]));
  const hit = positive.plan.findings.find((finding) => finding.ruleId === "completion.placeholder");
  assert.equal(hit?.exactQuote, "[-]");
  assert.equal(hit?.kind, "comment");
  assert.equal(hit?.replacement, null);

  const traps = await analyzeProof(await buildDocx([
    "The formula uses [12-14] as a reference value in Schedule 1.",
    "The character class [A-Z] is not a drafting slot in this clause.",
    "See the judgment in [2019] EWCA Civ 1 for the same point.",
    "The party [-] shall be identified by the schedule.",
    "The team may use [-] as a notation in the formula.",
  ]));
  assert.equal(traps.plan.findings.some((finding) => finding.ruleId === "completion.placeholder"), false);
});

test("re-run preserves an existing Licensor comment and still marks Plaaase on a synthetic source", async () => {
  const zip = await JSZip.loadAsync(await buildDocx(["placeholder"]));
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>`
    + `<w:p>${run("Dear [-] team, please review the attached draft before Friday.")}</w:p>`
    + `<w:p>${run("Escalation: Plaaase confirm the applicable mechanism for the remaining term.")}</w:p>`
    + `<w:p>${run("Please confirm the notice available to the Sub-")}<w:commentRangeStart w:id="0"/>${run("Licensor")}<w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r>${run(" following expiry of the term.")}</w:p>`
    + `<w:sectPr/></w:body></w:document>`,
    { date: new Date(0) },
  );
  zip.file(
    "word/comments.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:comments xmlns:w="${W}"><w:comment w:id="0" w:author="Agmt Proof" w:initials="AP"><w:p><w:r><w:t xml:space="preserve">Proof does not recognise “Licensor”. Nearby dictionary forms include: license, licensed, licensee. This is a review comment, not an automatic correction.</w:t></w:r></w:p></w:comment></w:comments>`,
    { date: new Date(0) },
  );
  const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
  zip.file(
    "word/_rels/document.xml.rels",
    rels.replace(
      "</Relationships>",
      `<Relationship Id="rIdComments" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/></Relationships>`,
    ),
    { date: new Date(0) },
  );
  const types = await zip.file("[Content_Types].xml")!.async("string");
  zip.file(
    "[Content_Types].xml",
    types.replace(
      "</Types>",
      `<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/></Types>`,
    ),
    { date: new Date(0) },
  );
  const source = await zip.generateAsync({ type: "nodebuffer" });
  const analysis = await analyzeProof(source);
  assert.equal(analysis.plan.findings.some((finding) => finding.exactQuote === "Licensor"), false);
  assert.ok(analysis.plan.findings.some((finding) => finding.exactQuote === "Plaaase"));
  assert.ok(analysis.plan.findings.some((finding) => finding.exactQuote === "[-]"));
  const result = await processProofLocal(new Uint8Array(source));
  const comments = await (await JSZip.loadAsync(result.output)).file("word/comments.xml")!.async("string");
  assert.match(comments, /Proof does not recognise “Licensor”/);
  assert.match(comments, /Suggested spelling: Please/);
  assert.match(comments, /unfilled: \[-\]/);
  assert.equal((comments.match(/Proof does not recognise “Licensor”/g) ?? []).length, 1);
});
