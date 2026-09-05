import JSZip from "jszip";
import { buildDocx } from "../docx.ts";

export const DEMO_SENTENCE = "The Company shall recieve the the notice under Clause 99.2 by [●].";
export const DEMO_ACCEPTED = "The Company shall receive the notice under Clause 99.2 by [●].";
export const DEMO_EXPECTED = Object.freeze([
  { ruleId: "language.typo_allowlist", quote: "recieve", replacement: "receive", start: 18, end: 25 },
  { ruleId: "language.duplicate_word", quote: " the", replacement: "", start: 29, end: 33 },
  { ruleId: "references.missing_target", quote: "Clause 99.2", replacement: null, start: 47, end: 58 },
  { ruleId: "completion.placeholder", quote: "[●]", replacement: null, start: 62, end: 65 },
]);
export const LAUNCH_FIXTURES = ["body", "split_runs", "table", "prior_review", "party_name"] as const;
export type LaunchFixture = typeof LAUNCH_FIXTURES[number];
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const run = (s: string, properties = "") => `<w:r>${properties}<w:t xml:space="preserve">${escape(s)}</w:t></w:r>`;

/** All synthetic. Uses the existing fixture package builder, never a production document writer. */
export async function launchFixture(kind: LaunchFixture): Promise<Buffer> {
  const zip = await JSZip.loadAsync(await buildDocx([DEMO_SENTENCE], kind === "prior_review" ? {
    comments: [{ author: "Prior Reviewer", text: "Existing comment stays unchanged." }],
  } : undefined));
  let body = `<w:p>${run(DEMO_SENTENCE)}</w:p>`;
  if (kind === "split_runs") body = `<w:p>${run("The Company shall re", "<w:rPr><w:b/></w:rPr>")}${run("cieve the ", "<w:rPr><w:i/></w:rPr>")}${run("the notice under Clause 99.")}${run("2 by [●].")}</w:p>`;
  if (kind === "table") body = `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="9000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="9000" w:type="dxa"/></w:tcPr>${body}</w:tc></w:tr></w:tbl>`;
  if (kind === "prior_review") body += `<w:p><w:commentRangeStart w:id="0"/>${run("Unrelated prior review.")}<w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r><w:ins w:id="7" w:author="Prior Reviewer" w:date="2026-01-01T00:00:00Z">${run(" Added earlier.")}</w:ins><w:del w:id="8" w:author="Prior Reviewer" w:date="2026-01-01T00:00:00Z"><w:r><w:delText>Removed earlier.</w:delText></w:r></w:del></w:p>`;
  if (kind === "party_name") body = `<w:p>${run('This Agreement is between Recieve Private Limited ("Recieve") and Example Limited.')}</w:p><w:p>${run('Recieve shall deliver the notice to Recieve Private Limited.')}</w:p><w:p>${run('For and on behalf of Recieve Private Limited')}</w:p>`;
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>${body}<w:sectPr/></w:body></w:document>`, { date: new Date(0) });
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
