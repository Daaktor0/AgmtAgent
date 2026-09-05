/** Frozen ordinary-prose candidates. Context eligibility is mandatory; never dictionary autocorrect. */
export const TYPO_ALLOWLIST_VERSION = "proof-typos-v1";
export const TYPO_ALLOWLIST: Readonly<Record<string, string>> = Object.freeze({
  teh: "the", recieve: "receive", occured: "occurred", seperate: "separate",
});
export const DUPLICATE_FUNCTION_WORDS = Object.freeze(["the", "a", "an", "of", "to", "and", "in", "for", "by", "with"] as const);
