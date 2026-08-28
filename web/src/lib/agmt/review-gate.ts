import type { IndexQuality, Instrument } from "./types.ts";
import { reviewUnsupportedReason } from "./instrument.ts";

/**
 * SPEC §4.7 / §13.3: Review gating is deterministic from the DocumentIndex.
 * Unreadable / no usable outline blocks Review.
 * Material unclassified produces incomplete_source rather than refusal.
 * Slice 2 does not ship Review itself — eligible files still wait for Slice 3.
 */
export type ReviewGate = {
  reviewAllowed: boolean;
  coverage: "full" | "incomplete_source" | "blocked";
  code:
    | "eligible"
    | "incomplete_source"
    | "no_usable_outline"
    | "unreadable"
    | "refused"
    | "unsupported_route"
    | "not_shipped";
  reason: string;
};

export function reviewGate(opts: {
  quality: Pick<IndexQuality, "sourceQuality" | "usableOutline" | "materialUnclassified">;
  instrument: Instrument;
  representedParty: string;
  stage: string;
  refused?: boolean;
  reviewShipped?: boolean;
}): ReviewGate {
  if (opts.refused) {
    return {
      reviewAllowed: false,
      coverage: "blocked",
      code: "refused",
      reason: "This file was refused. Upload a native Word (.docx) file.",
    };
  }
  if (!opts.quality.usableOutline || opts.quality.sourceQuality === "unreadable") {
    return {
      reviewAllowed: false,
      coverage: "blocked",
      code: "no_usable_outline",
      reason: "No usable outline. Review is blocked. Upload a better native Word (.docx) file.",
    };
  }

  const route = reviewUnsupportedReason(opts.instrument, opts.representedParty, opts.stage);
  if (route) {
    return {
      reviewAllowed: false,
      coverage: "blocked",
      code: "unsupported_route",
      reason: route,
    };
  }

  const incomplete = opts.quality.materialUnclassified || opts.quality.sourceQuality !== "high";
  if (!(opts.reviewShipped ?? false)) {
    return {
      reviewAllowed: false,
      coverage: incomplete ? "incomplete_source" : "full",
      code: incomplete ? "incomplete_source" : "not_shipped",
      reason: incomplete
        ? "Source is incomplete. Review would run with incomplete_source. Review ships in Slice 3."
        : "Run Review ships in Slice 3. Proof made no language-model call.",
    };
  }

  if (incomplete) {
    return {
      reviewAllowed: true,
      coverage: "incomplete_source",
      code: "incomplete_source",
      reason: "Usable outline with material unclassified or low structure confidence. Review runs with incomplete_source.",
    };
  }
  return {
    reviewAllowed: true,
    coverage: "full",
    code: "eligible",
    reason: "Native DOCX, usable outline, no material unclassified.",
  };
}
