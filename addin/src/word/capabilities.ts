import { apiSet } from "./host";

export interface CapabilityReport {
  host: string;
  wordApi: {
    "1.3": boolean;
    "1.4": boolean;
    "1.5": boolean;
    "1.6": boolean;
    "1.8": boolean;
  };
  comments: boolean;
  trackedChanges: boolean;
  uniqueLocalId: boolean;
  reviewedText: boolean;
  footnotes: boolean;
  headersFooters: boolean;
  tables: boolean;
  getFileAsync: boolean;
  reason?: string;
}

export function reportCapabilities(): CapabilityReport {
  const inWord = typeof Office !== "undefined" && Office.context?.host === Office.HostType.Word;
  if (!inWord) {
    return {
      host: "none",
      wordApi: { "1.3": false, "1.4": false, "1.5": false, "1.6": false, "1.8": false },
      comments: false,
      trackedChanges: false,
      uniqueLocalId: false,
      reviewedText: false,
      footnotes: false,
      headersFooters: false,
      tables: false,
      getFileAsync: false,
      reason: "Not running in Word.",
    };
  }
  return {
    host: "Word",
    wordApi: {
      "1.3": apiSet("1.3"),
      "1.4": apiSet("1.4"),
      "1.5": apiSet("1.5"),
      "1.6": apiSet("1.6"),
      "1.8": apiSet("1.8"),
    },
    comments: apiSet("1.4"),
    trackedChanges: apiSet("1.6"),
    uniqueLocalId: apiSet("1.6"),
    reviewedText: apiSet("1.4"),
    footnotes: apiSet("1.5"),
    headersFooters: apiSet("1.3"),
    tables: apiSet("1.3"),
    getFileAsync: typeof Office.context.document.getFileAsync === "function",
  };
}
