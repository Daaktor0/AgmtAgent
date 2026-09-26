import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addAttachment, assignAllSuggested, coParties, copyFileName, partyOrder, planFor, removePartyFromPage,
  signedFor, toggleSignaturePage, toggleSignedParty, updateParty, withAgreement, type AttachmentMeta,
} from "./state.ts";

const page = (likelySignature: boolean, suggestedParties: string[] = []) => ({ segments: [], likelySignature, suggestedParties });
const meta = (id: string, fileName: string): AttachmentMeta => ({ id, fileName, pageCount: 1, thumb: "", rotation: 0 });

function start() {
  return withAgreement("SPA_Final_v3.pdf", [
    page(false), page(false), page(true, ["Acme Limited"]), page(true, ["Rahul Mehta", "Priya Nair"]), page(false),
  ]);
}

test("an agreement seeds parties from the detected signature pages", () => {
  const s = start();
  assert.equal(s.title, "SPA");
  assert.deepEqual(partyOrder(s).map((id) => s.parties[id].name), ["Acme Limited", "Rahul Mehta", "Priya Nair"]);
  const rahul = partyOrder(s)[1];
  assert.deepEqual(coParties(s, rahul).map((id) => s.parties[id].name), ["Priya Nair"]);
  const t = toggleSignaturePage(s, 4);
  assert.deepEqual(t.sigPages[4].map((id) => t.parties[id].name), ["Party on page 5"]);
});

test("returns dropped in bulk are placed by their file names", () => {
  let s = start();
  s = addAttachment(s, meta("a", "Acme - countersigned.pdf"));
  s = addAttachment(s, meta("b", "e-stamp Acme.pdf"));
  s = addAttachment(s, meta("c", "IMG_2231.jpg"));
  s = assignAllSuggested(s);
  const [acme] = partyOrder(s);
  assert.deepEqual(signedFor(s, acme), ["a"]);
  assert.equal(s.placement.b.role, "stamp");
  assert.equal(s.placement.c.role, "unassigned");
});

test("one scan signed by both promoters covers both; removing a party frees its files", () => {
  let s = start();
  const [acme, rahul, priya] = partyOrder(s);
  s = addAttachment(s, meta("joint", "promoters.pdf"), { role: "signed", partyId: rahul });
  s = toggleSignedParty(s, "joint", priya);
  s = addAttachment(s, meta("acme", "acme.pdf"), { role: "signed", partyId: acme });
  s = addAttachment(s, meta("stamp", "stamp.pdf"), { role: "stamp", partyId: priya });
  const plan = planFor(s, priya);
  assert.deepEqual(plan.missingParties, []);
  assert.deepEqual(plan.segments.filter((x) => x.kind !== "agreement").map((x) => ("attachmentId" in x ? x.attachmentId : "")), ["stamp", "acme", "joint"]);

  s = updateParty(s, priya, { copy: "original" });
  assert.equal(copyFileName(s, priya), "SPA - Executed Original - Priya Nair.pdf");

  s = removePartyFromPage(s, 3, priya);
  assert.equal(s.parties[priya], undefined);
  assert.equal(s.placement.stamp.role, "unassigned");
  assert.deepEqual((s.placement.joint as { partyIds: string[] }).partyIds, [rahul]);
});
