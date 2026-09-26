/** Frozen ordinary-prose candidates. Context eligibility is mandatory; never dictionary autocorrect. */
export const TYPO_ALLOWLIST_VERSION = "proof-typos-v2";

/**
 * Whole-token misspellings that are not valid en-GB or en-US words, each with a
 * unique correction. Capitalised party names, quotations and URLs stay excluded
 * by ordinary-prose guards, not by omitting the lowercase token.
 */
export const TYPO_ALLOWLIST: Readonly<Record<string, string>> = Object.freeze({
  teh: "the",
  recieve: "receive",
  recieving: "receiving",
  occured: "occurred",
  occurence: "occurrence",
  occurrance: "occurrence",
  seperate: "separate",
  seperately: "separately",
  seperation: "separation",
  untill: "until",
  arguement: "argument",
  begining: "beginning",
  compair: "compare",
  acheive: "achieve",
  acheived: "achieved",
  adress: "address",
  agian: "again",
  aparent: "apparent",
  appearence: "appearance",
  availible: "available",
  becuase: "because",
  beleive: "believe",
  buisness: "business",
  commitee: "committee",
  definately: "definitely",
  sucess: "success",
  sucessful: "successful",
  neccessary: "necessary",
  priviledge: "privilege",
  reccomend: "recommend",
  refered: "referred",
  relevent: "relevant",
  writen: "written",
  writting: "writing",
  accomodate: "accommodate",
  accross: "across",
  independant: "independent",
  existance: "existence",
  thier: "their",
  indeminity: "indemnity",
});

/** `that` stays excluded until "that that" legal-prose traps are adjudicated. */
export const DUPLICATE_FUNCTION_WORDS = Object.freeze([
  "the", "a", "an", "of", "to", "and", "in", "for", "by", "with", "which", "is",
] as const);

export const DUPLICATE_WORD_SEPARATOR = String.raw`[ \t\u00a0]+`;
