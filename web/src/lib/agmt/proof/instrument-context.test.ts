import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDocx } from "../docx.ts";
import { analyzeProof } from "./launch.ts";
import { instrumentContext } from "./instrument-context.ts";

test("amendment restatement and bulk incorporation are detected from text, not length", async () => {
  const amendment = await analyzeProof(await buildDocx([
    "This Deed of Amendment is made between the Company and the Investor.",
    "Clause 4.1 of the Original Agreement is deleted and replaced with the following.",
    "4.1 The Investor shall subscribe for the Shares in cash on the Payment Date.",
    "Except as amended by this Deed, the Original Agreement remains in full force.",
  ]));
  const context = instrumentContext(amendment.source);
  assert.equal(context.amendsNamedInstrument, true);
  assert.equal(context.namedInstrument, "Original Agreement");
  assert.equal(context.bulkIncorporatesDefinitions, false);
  assert.equal(context.restatedParagraphIds.size, 1);

  const bulk = await analyzeProof(await buildDocx([
    "This Deed of Amendment is made between the Company and the Investor.",
    "Unless otherwise defined in this Deed, terms defined in the Original Agreement have the same meaning.",
    "The Investor shall pay on the Payment Date.",
  ]));
  const bulkContext = instrumentContext(bulk.source);
  assert.equal(bulkContext.amendsNamedInstrument, true);
  assert.equal(bulkContext.bulkIncorporatesDefinitions, true);

  const standalone = await analyzeProof(await buildDocx([
    "This agreement is between Riverton Logistics Limited (the Supplier) and the Customer.",
    "The Supplier shall keep the Service Levels for the duration of this agreement.",
  ]));
  const none = instrumentContext(standalone.source);
  assert.equal(none.amendsNamedInstrument, false);
  assert.equal(none.bulkIncorporatesDefinitions, false);
  assert.equal(none.restatedParagraphIds.size, 0);
});
