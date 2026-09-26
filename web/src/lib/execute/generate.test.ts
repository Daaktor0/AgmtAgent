import { test } from "node:test";
import assert from "node:assert/strict";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument } from "pdf-lib";
import { layoutSegments } from "./detect.ts";
import { pageItems } from "./extract.ts";
import { buildSignaturePages, findNameSlots, fontStyle, guessSampleName, PRESET_FORMATS, type StyledItem, type TemplateSpec } from "./generate.ts";
import { buildSignatureTemplate, NO_SIGNATURE_EXPECTED } from "./sample-parties.ts";

const A4: [number, number] = [595.28, 841.89];
const open = (bytes: Uint8Array) => pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;

async function pageLines(bytes: Uint8Array, n: number): Promise<string[]> {
  return layoutSegments(await pageItems(await open(bytes), n)).map((s) => s.text);
}

/** Positioned text with font facts, as the browser reads a template. */
async function styledItems(bytes: Uint8Array): Promise<{ items: StyledItem[]; width: number }> {
  const pdf = await open(bytes);
  const page = await pdf.getPage(1);
  const content = await page.getTextContent();
  await page.getOperatorList();
  const items: StyledItem[] = [];
  for (const raw of content.items) {
    if (!("str" in raw)) continue;
    const [a, b, c, d, e, f] = raw.transform as number[];
    const font = page.commonObjs.has(raw.fontName) ? page.commonObjs.get(raw.fontName) : null;
    items.push({ str: raw.str, x: e, y: f, width: raw.width, height: raw.height || Math.hypot(c, d) || Math.hypot(a, b), style: fontStyle(font, content.styles[raw.fontName]?.fontFamily) });
  }
  return { items, width: page.getViewport({ scale: 1 }).width };
}

test("plain formats: one page per party, the name in its block, the footer without a date, no Agmt mark", async () => {
  const { bytes, texts } = await buildSignaturePages({
    size: A4,
    footer: NO_SIGNATURE_EXPECTED.footer,
    sheets: [
      { name: "Saffron Healthcare Private Limited", kind: "plain", body: PRESET_FORMATS.company.body },
      { name: "Vikram Mehta", kind: "plain", body: PRESET_FORMATS.individual.body },
    ],
  });
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 2);
  const first = await pageLines(bytes, 1);
  assert.ok(first.includes("Saffron Healthcare Private Limited"), first.join(" | "));
  assert.ok(first.includes("through its authorised signatory"));
  assert.ok(first.some((l) => l.startsWith("This signature page forms an integral part of the Shareholders' Agreement")));
  const second = await pageLines(bytes, 2);
  assert.ok(second.includes("Vikram Mehta"));
  assert.ok(!second.some((l) => /Designation/.test(l)), "an individual signs without a designation");
  assert.match(texts[0], /Saffron Healthcare Private Limited/);
  assert.doesNotMatch(Buffer.from(bytes).toString("latin1"), /agmt|execute/i, "no Execute or Agmt name anywhere, metadata included");
});

test("a PDF template: its page copied with only the signer's name replaced, the footer untouched", async () => {
  const template = await buildSignatureTemplate();
  const { items, width } = await styledItems(template);
  assert.equal(guessSampleName(items), "Orchid Capital Private Limited", "the sample name is found for the lawyer to confirm");
  const slots = findNameSlots(items, "Orchid Capital Private Limited", width);
  assert.equal(slots.length, 1, "only the signature block's name, not the parties in the footer");
  assert.deepEqual({ align: slots[0].align, upper: slots[0].upper, style: slots[0].style }, { align: "left", upper: true, style: { family: "serif", bold: true, italic: false } });

  const spec: TemplateSpec = {
    bytes: template,
    pageIndex: 0,
    sample: "Orchid Capital Private Limited",
    slots,
    text: layoutSegments(items).map((s) => s.text).join("\n"),
  };
  const long = "Kestrel India Opportunities Fund – Scheme A, acting through its investment manager Kestrel Advisors LLP";
  const { bytes, texts, residue } = await buildSignaturePages({
    size: A4,
    footer: "IGNORED FOR TEMPLATES",
    sheets: [
      { name: "Radhika Menon", kind: "template", template: spec },
      { name: long, kind: "template", template: spec },
    ],
  });
  assert.deepEqual(residue, [], "the sample name was taken out of the text, not just painted over");
  const first = await pageLines(bytes, 1);
  assert.ok(first.includes("RADHIKA MENON"), `name set in the template's capitals: ${first.join(" | ")}`);
  assert.ok(!first.some((l) => l.includes("ORCHID")), "the sample name is covered");
  assert.ok(first.some((l) => l.startsWith("This signature page forms an integral part")), "the template's own footer stays");
  assert.ok(!first.includes("IGNORED FOR TEMPLATES"));
  assert.match(texts[0], /Radhika Menon/);
  const second = (await pageLines(bytes, 2)).join(" ");
  assert.match(second, /KESTREL INDIA OPPORTUNITIES FUND – SCHEME A, ACTING THROUGH ITS INVESTMENT MANAGER KESTREL ADVISORS LLP/, "a long name is shrunk or wrapped, never cut off");
});

test("characters the standard fonts can't draw are simplified, not fatal", async () => {
  const { bytes } = await buildSignaturePages({
    size: A4,
    footer: "Signature page to the Agreement [●]",
    sheets: [{ name: "Łukasz Żółć Holdings Private Limited", kind: "plain", body: PRESET_FORMATS.company.body }],
  });
  const lines = await pageLines(bytes, 1);
  assert.ok(lines.includes("Lukasz Zołc Holdings Private Limited") || lines.some((l) => /ukasz/.test(l)), lines.join(" | "));
});
