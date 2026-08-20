/**
 * Reviewed-current ingest. Stories stay separate; never one giant string.
 *
 * getReviewedText usage adapted from Vaquill AI ms-word-addin (Apache-2.0).
 */
import type { DocumentSnapshot, StoryText } from "../contracts/snapshot";
import { apiSet, runWord } from "./host";
import { sha256Hex } from "./selection";

async function readStory(
  context: Word.RequestContext,
  body: Word.Body,
  story: StoryText["story"],
): Promise<StoryText> {
  const paras = body.paragraphs;
  const canUid = apiSet("1.6");
  const canList = apiSet("1.3");
  const fields = ["items/text"];
  if (canUid) fields.push("items/uniqueLocalId");
  if (canList) fields.push("items/listItemOrNullObject");
  paras.load(fields.join(","));
  await context.sync();
  if (canList) {
    for (const p of paras.items) {
      if (!p.listItemOrNullObject.isNullObject) {
        p.listItemOrNullObject.load("listString,level");
      }
    }
    await context.sync();
  }
  let reviewed: OfficeExtension.ClientResult<string>[] | null = null;
  if (apiSet("1.4") && typeof paras.items[0]?.getReviewedText === "function") {
    try {
      const tracked = body.getTrackedChanges();
      tracked.load("items/type");
      await context.sync();
      if (tracked.items.length > 0) {
        reviewed = paras.items.map((p) =>
          p.getReviewedText(Word.ChangeTrackingVersion.current),
        );
        await context.sync();
      }
    } catch {
      reviewed = null;
    }
  }
  const paragraphs: string[] = [];
  const uniqueLocalIds: string[] = [];
  const listPrefixes: string[] = [];
  paras.items.forEach((p, i) => {
    paragraphs.push(reviewed ? reviewed[i]?.value ?? p.text ?? "" : p.text ?? "");
    uniqueLocalIds.push(canUid ? p.uniqueLocalId || "" : "");
    const prefix =
      canList && !p.listItemOrNullObject.isNullObject
        ? (p.listItemOrNullObject.listString || "").trim()
        : "";
    listPrefixes.push(prefix);
  });
  return { story, paragraphs, uniqueLocalIds, listPrefixes };
}

export async function ingestDocument(opts: {
  documentId: string;
  documentVersionId: string;
}): Promise<DocumentSnapshot> {
  const stories: StoryText[] = [];
  const body = await runWord(async (context) =>
    readStory(context, context.document.body, "body"),
  );
  stories.push(body);
  try {
    const notes = await runWord(async (context) => {
      const fn = context.document.body.footnotes;
      fn.load("items");
      await context.sync();
      const collected: string[] = [];
      const ids: string[] = [];
      for (const n of fn.items) {
        const reviewed = n.body.getReviewedText(Word.ChangeTrackingVersion.current);
        await context.sync();
        collected.push(reviewed.value || "");
        ids.push("");
      }
      return { story: "footnote" as const, paragraphs: collected, uniqueLocalIds: ids, listPrefixes: collected.map(() => "") };
    });
    if (notes.paragraphs.length) stories.push(notes);
  } catch {
    /* host without footnotes */
  }
  try {
    const hf = await runWord(async (context) => {
      const sections = context.document.sections;
      sections.load("items");
      await context.sync();
      const headers: string[] = [];
      const footers: string[] = [];
      for (const s of sections.items) {
        const h = s.getHeader(Word.HeaderFooterType.primary);
        const f = s.getFooter(Word.HeaderFooterType.primary);
        const hr = h.getReviewedText(Word.ChangeTrackingVersion.current);
        const fr = f.getReviewedText(Word.ChangeTrackingVersion.current);
        await context.sync();
        if ((hr.value || "").trim()) headers.push(hr.value || "");
        if ((fr.value || "").trim()) footers.push(fr.value || "");
      }
      return { headers, footers };
    });
    if (hf.headers.length) {
      stories.push({ story: "header", paragraphs: hf.headers, uniqueLocalIds: hf.headers.map(() => ""), listPrefixes: hf.headers.map(() => "") });
    }
    if (hf.footers.length) {
      stories.push({ story: "footer", paragraphs: hf.footers, uniqueLocalIds: hf.footers.map(() => ""), listPrefixes: hf.footers.map(() => "") });
    }
  } catch {
    /* host without headers */
  }
  const bodyText = stories[0]?.paragraphs.join("\n") || "";
  return {
    documentId: opts.documentId,
    documentVersionId: opts.documentVersionId,
    versionHash: "sha256:" + (await sha256Hex(bodyText)),
    stories,
    capturedAt: new Date().toISOString(),
  };
}
