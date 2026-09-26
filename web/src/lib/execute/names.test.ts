import { test } from "node:test";
import assert from "node:assert/strict";
import {
  executedCopyName, guessRoleByFileName, incompleteName, signaturePackName, matchPartyByFileName, safeFileName, titleFromFileName, uniqueNames,
} from "./names.ts";

test("titles drop version noise from the file name", () => {
  assert.equal(titleFromFileName("SHA_Meridian Foods_Execution Version_v9.pdf"), "SHA Meridian Foods");
  assert.equal(titleFromFileName("Services Agreement - FINAL (clean).pdf"), "Services Agreement");
  assert.equal(titleFromFileName("v2.pdf"), "Agreement");
});

test("file names are safe and editable suggestions", () => {
  assert.equal(executedCopyName("SHA", "Banyan Capital Fund I", "original"), "Banyan Capital Fund I - SHA - Executed Original.pdf");
  assert.equal(executedCopyName("SHA", "Banyan Capital Fund I", "counterpart"), "Banyan Capital Fund I - SHA - Executed Counterpart.pdf");
  assert.equal(signaturePackName("SHA", "Priya Nair"), "Priya Nair - SHA - Signature Pages.pdf");
  assert.equal(incompleteName("Priya Nair - SHA - Executed Counterpart.pdf"), "Priya Nair - SHA - Executed Counterpart (incomplete).pdf");
  assert.equal(incompleteName("x (incomplete).pdf"), "x (incomplete).pdf");
  assert.equal(safeFileName('A/B: "C"?'), "A B C.pdf");
  assert.deepEqual(uniqueNames(["a.pdf", "A.pdf", "b.pdf"]), ["a.pdf", "A (2).pdf", "b.pdf"]);
});

test("returned files are matched to a party only when the match is clear", () => {
  const parties = [
    { id: "1", name: "Rahul Mehta" },
    { id: "2", name: "Priya Nair" },
    { id: "3", name: "Banyan Capital Fund I" },
    { id: "4", name: "Banyan Growth LLP" },
  ];
  assert.equal(matchPartyByFileName("Rahul Mehta - signed.pdf", parties), "1");
  assert.equal(matchPartyByFileName("banyan_capital_countersigned.pdf", parties), "3");
  assert.equal(matchPartyByFileName("Banyan.pdf", parties), null); // two Banyans: no guess
  assert.equal(matchPartyByFileName("scan0001.pdf", parties), null);
  assert.equal(guessRoleByFileName("e-Stamp paper - Priya.pdf"), "stamp");
  assert.equal(guessRoleByFileName("Priya countersigned.jpg"), "signed");
  assert.equal(guessRoleByFileName("IMG_2231.jpg"), null);
});
