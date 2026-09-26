import { test } from "node:test";
import assert from "node:assert/strict";
import { rangesToRemove, tokenize } from "./pdf-content.ts";

const enc = new TextEncoder();
const dec = new TextDecoder();

function cut(content: string, targets: { x: number; y: number; width: number }[]): string {
  const b = enc.encode(content);
  const ranges = rangesToRemove(b, targets).filter(([s]) => s >= 0);
  let out = "";
  let at = 0;
  for (const [s, e] of ranges) {
    out += dec.decode(b.subarray(at, s)) + " ";
    at = e;
  }
  return out + dec.decode(b.subarray(at));
}

test("Word-style runs: each in its own BT with a Tm; only the name's run goes", () => {
  const content = [
    "q 0 0 595 842 re W n",
    "BT /F1 12 Tf 1 0 0 1 72.02 700 Tm [(SIGNED AND DELIVERED for and on behalf of)] TJ ET",
    "BT /F2 12 Tf 1 0 0 1 72.02 682 Tm [(ORCHID)-3( CAPITAL PRIVATE LIMITED)] TJ ET",
    "BT /F1 12 Tf 1 0 0 1 72.02 664 Tm [(through its \\(authorised\\) signatory)] TJ ET",
    "Q",
  ].join("\n");
  const out = cut(content, [{ x: 72, y: 682, width: 220 }]);
  assert.doesNotMatch(out, /ORCHID|CAPITAL/);
  assert.match(out, /SIGNED AND DELIVERED/);
  assert.match(out, /through its \\\(authorised\\\) signatory/, "strings with escaped brackets survive intact");
  assert.match(out, /BT \/F2 12 Tf 1 0 0 1 72\.02 682 Tm\s+ET/, "the text state around the name is kept");
});

test("Google-style pages: a flipped CTM and Td moves", () => {
  const content = [
    "q 1 0 0 -1 0 842 cm",
    "BT /F4 12 Tf 1 0 0 -1 0 0 Tm 72 -142 Td <0036003B> Tj ET",
    "BT /F5 12 Tf 1 0 0 -1 0 0 Tm 72 -160 Td <0032003500260032> Tj ( PRIVATE LIMITED) Tj ET",
    "Q",
  ].join("\n");
  // 842 - 160 = 682 on the page.
  const out = cut(content, [{ x: 72, y: 682, width: 200 }]);
  assert.match(out, /<0036003B> Tj/, "the line above stays");
  assert.doesNotMatch(out, /0032003500260032|PRIVATE LIMITED/, "the name and its continuation run go");
});

test("line operators: T* and the quote operator keep their line moves", () => {
  const content = "BT /F1 12 Tf 14 TL 72 700 Td (First line) Tj T* (ORCHID CAPITAL) Tj (Third) ' ET";
  const b = enc.encode(content);
  const ranges = rangesToRemove(b, [{ x: 72, y: 686, width: 150 }]);
  assert.equal(ranges.filter(([s]) => s >= 0).length, 1);
  const out = cut(content, [{ x: 72, y: 686, width: 150 }]);
  assert.match(out, /\(First line\) Tj T\*\s+\(Third\) '/);
});

test("inline images and dictionaries don't derail the reader", () => {
  const content = "q BI /W 2 /H 1 /BPC 8 /CS /G ID \u0000ÿEI\u0000 EI Q BT /F1 12 Tf 1 0 0 1 72 682 Tm (ORCHID) Tj ET /P <</MCID 3>> BDC EMC";
  const kinds = tokenize(enc.encode(content)).map((t) => t.text).filter(Boolean);
  assert.ok(kinds.includes("EI") && kinds.includes("Tj") && kinds.includes("BDC"), kinds.join(" "));
  assert.doesNotMatch(cut(content, [{ x: 72, y: 682, width: 60 }]), /ORCHID/);
});
