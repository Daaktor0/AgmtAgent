import { test } from "node:test";
import assert from "node:assert/strict";
import { displayName, groupSegments, isLikelySignaturePage, suggestPartyNames } from "./detect.ts";

test("side-by-side signature blocks stay separate segments", () => {
  const segs = groupSegments([
    { str: "SIGNED AND DELIVERED by the", x: 72, y: 700, width: 150, height: 10 },
    { str: "SIGNED AND DELIVERED by the", x: 320, y: 700, width: 150, height: 10 },
    { str: "RAHUL MEHTA", x: 72, y: 685, width: 70, height: 10 },
    { str: "PRIYA NAIR", x: 320, y: 685, width: 60, height: 10 },
  ]);
  assert.deepEqual(segs, ["SIGNED AND DELIVERED by the", "SIGNED AND DELIVERED by the", "RAHUL MEHTA", "PRIYA NAIR"]);
});

test("party names come from the common Indian signature-block forms", () => {
  assert.deepEqual(
    suggestPartyNames([
      "IN WITNESS WHEREOF the Parties have executed this Agreement on the day and year first above written.",
      "SIGNED AND DELIVERED by the within named Company",
      "MERIDIAN FOODS PRIVATE LIMITED",
      "through its authorised signatory",
      "Name:",
      "Designation:",
    ]),
    ["Meridian Foods Private Limited"],
  );
  assert.deepEqual(suggestPartyNames(["For and on behalf of BANYAN CAPITAL FUND I", "acting through its manager"]), [
    "Banyan Capital Fund I",
  ]);
  assert.deepEqual(suggestPartyNames(["SIGNED AND DELIVERED by the within named Investor, ANAND IYER"]), ["Anand Iyer"]);
  assert.deepEqual(suggestPartyNames(["For and on behalf of", "M/s. KESTREL VENTURES LLP", "Name:"]), ["Kestrel Ventures LLP"]);
  assert.deepEqual(
    suggestPartyNames(['Signed by Acme Industries Limited (the "Seller") through its director', "By: ____"]),
    ["Acme Industries Limited"],
  );
});

test("a dense body page is not a signature page; a sparse signing page is", () => {
  const body = Array.from({ length: 40 }, () => "The Company shall procure that each Shareholder complies with this Agreement.");
  assert.equal(isLikelySignaturePage(body), false);
  assert.equal(
    isLikelySignaturePage(["For and on behalf of XYZ LIMITED", "Name:", "Designation:", "[Signature page to the Agreement]"]),
    true,
  );
});

test("capitalised names become title case, keeping abbreviations", () => {
  assert.equal(displayName("BANYAN CAPITAL FUND II"), "Banyan Capital Fund II");
  assert.equal(displayName("RAHUL MEHTA HUF"), "Rahul Mehta HUF");
  assert.equal(displayName("STATE BANK OF INDIA"), "State Bank of India");
  assert.equal(displayName("HDFC CAPITAL ADVISORS LIMITED"), "HDFC Capital Advisors Limited");
  assert.equal(displayName("Acme Industries Limited"), "Acme Industries Limited");
});
