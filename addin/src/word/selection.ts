/**
 * Selection capture.
 *
 * Empty-selection handling, table-selection recording, reviewed-current text
 * and selection-change subscription are adapted from Vaquill AI ms-word-addin
 * (Apache-2.0). Modified: result is an Agmt SelectionEnvelope; uniqueLocalId
 * is a locator only; no office-word-diff mutation.
 */
import type { SelectionEnvelope, Story } from "../contracts/selection";
import { AgmtWordError, apiSet, runWord } from "./host";

export async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text || "");
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  throw new AgmtWordError("Web Crypto is required to hash a selection.", "no_crypto");
}

function newId(): string {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `sel-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function captureSelection(opts: {
  documentId: string;
  documentVersionId: string;
}): Promise<SelectionEnvelope> {
  return runWord(async (context) => {
    const sel = context.document.getSelection();
    const tables = sel.tables;
    tables.load("items");
    const paras = sel.paragraphs;
    const canUid = apiSet("1.6");
    paras.load(canUid ? "items/text,items/uniqueLocalId" : "items/text");
    let reviewed: OfficeExtension.ClientResult<string> | null = null;
    if (apiSet("1.4") && typeof sel.getReviewedText === "function") {
      reviewed = sel.getReviewedText(Word.ChangeTrackingVersion.current);
    } else {
      sel.load("text");
    }
    const bodyParas = context.document.body.paragraphs;
    bodyParas.load(canUid ? "items/text,items/uniqueLocalId" : "items/text");
    await context.sync();

    const selectedText = (reviewed ? reviewed.value : sel.text) || "";
    const paragraphIds: string[] = [];
    const paragraphIndexes: number[] = [];
    for (const p of paras.items) {
      if (canUid && p.uniqueLocalId) paragraphIds.push(p.uniqueLocalId);
    }
    for (let i = 0; i < bodyParas.items.length; i++) {
      const body = bodyParas.items[i];
      if (canUid && body.uniqueLocalId && paragraphIds.includes(body.uniqueLocalId)) {
        paragraphIndexes.push(i);
      }
    }

    let tablePath: { tableIndex: number; row?: number; column?: number } | undefined;
    if (tables.items.length > 0) {
      tablePath = { tableIndex: 0 };
    }

    let prefix = "";
    let suffix = "";
    if (paragraphIndexes.length) {
      const first = paragraphIndexes[0];
      const last = paragraphIndexes[paragraphIndexes.length - 1];
      if (first > 0) prefix = bodyParas.items[first - 1].text || "";
      if (last + 1 < bodyParas.items.length) suffix = bodyParas.items[last + 1].text || "";
    }

    const hash = await sha256Hex(selectedText);
    const envelope: SelectionEnvelope = {
      selectionId: newId(),
      documentId: opts.documentId,
      documentVersionId: opts.documentVersionId,
      story: "body",
      selectedText,
      selectedTextHash: hash,
      structuralContext: {
        paragraphIds,
        paragraphIndexes,
        tablePath,
        headingPath: [],
      },
      surroundingContext: {
        prefix,
        suffix,
        prefixHash: prefix ? await sha256Hex(prefix) : "",
        suffixHash: suffix ? await sha256Hex(suffix) : "",
      },
      capturedAt: new Date().toISOString(),
    };
    return envelope;
  });
}

export function onSelectionChanged(cb: () => void): () => void {
  const handler = () => cb();
  Office.context.document.addHandlerAsync(Office.EventType.DocumentSelectionChanged, handler);
  return () => {
    Office.context.document.removeHandlerAsync(Office.EventType.DocumentSelectionChanged, { handler });
  };
}

export function isEmptySelection(envelope: SelectionEnvelope): boolean {
  return !(envelope.selectedText || "").trim();
}

export function selectionSpansTable(envelope: SelectionEnvelope): boolean {
  return Boolean(envelope.structuralContext.tablePath);
}

export function storyFromRange(): Story {
  return "body";
}
