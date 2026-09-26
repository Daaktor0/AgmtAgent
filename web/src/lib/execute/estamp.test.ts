import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeStampPaper, readEStamp, stampNames } from "./estamp.ts";

test("reads the fields of an e-stamp certificate", () => {
  const text = [
    "INDIA NON JUDICIAL",
    "Government of National Capital Territory of Delhi",
    "e-Stamp",
    "Certificate No. : IN-DL48213377561290X",
    "Certificate Issued Date : 12-Sep-2026 11:04 AM",
    "Purchased by : BANYAN CAPITAL FUND I",
    "Description of Document : Article 5 General Agreement",
    "First Party : MERIDIAN FOODS PRIVATE LIMITED",
    "Second Party : BANYAN CAPITAL FUND I",
    "Stamp Duty Paid By : BANYAN CAPITAL FUND I",
    "Stamp Duty Amount(Rs.) : 1,500 (One Thousand Five Hundred only)",
  ].join("\n");
  assert.equal(looksLikeStampPaper(text), true);
  const s = readEStamp(text)!;
  assert.equal(s.certificateNo, "IN-DL48213377561290X");
  assert.equal(s.purchasedBy, "BANYAN CAPITAL FUND I");
  assert.equal(s.firstParty, "MERIDIAN FOODS PRIVATE LIMITED");
  assert.equal(s.paidBy, "BANYAN CAPITAL FUND I");
  assert.equal(s.amount, "1500");
  assert.equal(s.description, "Article 5 General Agreement");
  assert.equal(stampNames(s).length, 4);
});

test("physical stamp paper is stamp paper without details; an agreement page is neither", () => {
  assert.equal(looksLikeStampPaper("INDIA NON JUDICIAL  FIVE HUNDRED RUPEES"), true);
  assert.equal(readEStamp("INDIA NON JUDICIAL  FIVE HUNDRED RUPEES"), null);
  assert.equal(looksLikeStampPaper("For and on behalf of KESTREL VENTURES LLP\nName:\nDesignation:"), false);
});
