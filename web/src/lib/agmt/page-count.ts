import {
  PAGE_CAP,
  PAGE_CHARS_PER_PAGE,
  PAGE_COUNT_VERSION,
  PAGE_WORDS_PER_PAGE,
} from "./config.ts";

export function estimatePageCount(input: {
  wordCount: number;
  nonWhitespaceChars: number;
  explicitPageBreaks: number;
  appPages: number | null;
}): { pageCount: number; method: "docx_property" | "estimated"; estimate: number } {
  const estimate = Math.ceil(
    Math.max(
      input.wordCount / PAGE_WORDS_PER_PAGE,
      input.nonWhitespaceChars / PAGE_CHARS_PER_PAGE,
      input.explicitPageBreaks + 1,
    ),
  );
  const app = input.appPages && input.appPages > 0 ? input.appPages : null;
  if (app != null) {
    return {
      pageCount: Math.max(app, estimate),
      method: app >= estimate ? "docx_property" : "estimated",
      estimate,
    };
  }
  return { pageCount: estimate, method: "estimated", estimate };
}

export function exceedsPageCap(pageCount: number): boolean {
  return pageCount > PAGE_CAP;
}

export { PAGE_COUNT_VERSION, PAGE_CAP };
