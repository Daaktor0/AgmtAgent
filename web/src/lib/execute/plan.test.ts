import { test } from "node:test";
import assert from "node:assert/strict";
import { describePlan, planExecutedCopy } from "./plan.ts";

const sigPages = new Map([
  [6, ["company"]],
  [7, ["rahul", "priya"]],
  [8, ["banyan"]],
]);

test("stamp paper first, signed pages replace the signature pages in place", () => {
  const plan = planExecutedCopy({
    pageCount: 10,
    signaturePages: sigPages,
    signedByParty: new Map([
      ["company", ["c"]],
      ["rahul", ["r"]],
      ["priya", ["p"]],
      ["banyan", ["b"]],
    ]),
    stampIds: ["s1", "s2"],
  });
  assert.deepEqual(plan.missingParties, []);
  assert.equal(plan.missingStamp, false);
  assert.deepEqual(
    plan.segments.map((s) => (s.kind === "agreement" ? s.pageIndex : s.attachmentId)),
    ["s1", "s2", 0, 1, 2, 3, 4, 5, "c", "r", "p", "b", 9],
  );
  assert.deepEqual(describePlan(plan, () => 1), [
    "Stamp paper (2 pages)", "Agreement pp. 1–6", "Countersigned (4 pages)", "Agreement p. 10",
  ]);
});

test("a page signed together is placed once; a missing party keeps the unsigned page", () => {
  const plan = planExecutedCopy({
    pageCount: 10,
    signaturePages: sigPages,
    signedByParty: new Map([
      ["company", ["c"]],
      ["rahul", ["joint"]],
      ["priya", ["joint"]],
    ]),
    stampIds: [],
  });
  assert.deepEqual(plan.missingParties, ["banyan"]);
  assert.equal(plan.missingStamp, true);
  const ids = plan.segments.map((s) => (s.kind === "agreement" ? `${s.pageIndex}${s.unsigned ? "u" : ""}` : s.attachmentId));
  assert.deepEqual(ids.slice(6), ["c", "joint", "8u", "9"]);
});

test("a party whose return spans two signature pages is placed once", () => {
  const plan = planExecutedCopy({
    pageCount: 4,
    signaturePages: new Map([[1, ["a"]], [2, ["a"]]]),
    signedByParty: new Map([["a", ["two-pages"]]]),
    stampIds: ["s"],
  });
  assert.deepEqual(
    plan.segments.map((s) => (s.kind === "agreement" ? s.pageIndex : s.attachmentId)),
    ["s", 0, "two-pages", 3],
  );
});
