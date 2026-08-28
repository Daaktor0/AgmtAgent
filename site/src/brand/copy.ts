/**
 * Every claim the site makes, in one file.
 *
 * The rule for editing this: if a fact is not already here, it does not go on
 * the site. No metrics, no customer names, no certifications, no pricing, no
 * model names, no page limits. A short honest page beats a long invented one.
 *
 * The dry lines are deliberate and rationed — at most one per section, never
 * in a seat confirmation and never on /legal.
 */

export const FOOTER = "Agmt · not legal advice · launching soon · India transactional";

export const PRODUCT = {
  what: "A web product for Indian transactional counsel. It reads SHA, SSA, SPA and disclosure-letter packs.",
  modes: "Two modes, launching soon.",
  seats: "Launching soon. 50 beta seats — 30 first-come, 20 allotted.",
} as const;

export const PROOF = {
  label: "Proof",
  price: "Free",
  heading: "A mechanical integrity pass.",
  lede: "No language model. Instant.",
  does: [
    "Undefined and unused definitions",
    "Dangling cross-references",
    "Numbering breaks",
    "Signature block against the parties",
    "Hidden characters",
    "Table-versus-prose number clashes",
  ],
  refusesTitle: "It will not",
  refuses: ["Guess", "Say whether a clause is “market”"],
  aside: "If it has to guess, it waits for Review.",
} as const;

export const REVIEW = {
  label: "Review",
  price: "Paid",
  heading: "A planned read of named provisions.",
  lede: "Read against a mandate: who you act for, the stage, what must be protected.",
  does: [
    "Severity and topic",
    "Clause and verbatim quote",
    "Why it matters for this mandate",
    "The ask, and optional proposed language",
    "A reviewer stamp",
  ],
  refusesTitle: "It will not be",
  refuses: ["A chatbot summary", "A memo that disappears"],
  survives: "The list survives v2 of the file, counterparty markup, and the rest of the pack.",
  aside: "A list you can tick. Not a memo you can skim once and lose.",
} as const;

/** The plain-words list. Order matters: the add-in question comes first. */
export const IS_NOT = [
  "Not a Word add-in at launch. You download a tracked-change DOCX and open it in Word. Word still opens the redline. It is good at that.",
  "Not CLM, not a repository, not e-signature, not obligation management.",
  "Not legal research, not litigation, not Google Docs.",
  "Not Harvey / Spellbook / Ivo / “AI for all of legal.”",
  "Not connected to your ChatGPT, Claude or Grok consumer subscription. That subscription is for drafting emails.",
  "Not legal advice. A lawyer still signs the paper.",
  "Not generally available yet. Proof and Review are launching soon. This site takes interest and assigns beta seats.",
] as const;

export const WHO = {
  is: "Indian transactional associates and partners working SHA, SSA, SPA and disclosure letters.",
  isNot: "Not in-house vendor-paper review. Not students. Not “anyone with a contract.”",
} as const;

/** The site's one mention of AI, qualified in the same breath. */
export const AI_LINE =
  "Review is the one place Agmt uses AI, and it is fenced: a planned read of named clauses, every finding carrying a verbatim quote and a reviewer stamp.";

export const HOW = [
  {
    heading: "Proof is model-free",
    body: "A mechanical pass over the artefact. If a defect can be shown in the file — a definition that never appears again, a cross-reference that does not resolve, a numbering break — it is reported. If it cannot be shown, it is not reported.",
  },
  {
    heading: "Review is a planned read, not RAG over chunks",
    body: "Named clauses, read against the mandate you set. The output is a Key Issues List, not a chat window.",
  },
  {
    heading: "No quote, no finding",
    body: "Every finding quotes the file. If the words are not in the document, there is no finding.",
  },
  {
    heading: "The matter outlives the first run",
    body: "Dispositions, the version diff and the rest of the pack stay with the matter, so the list is still there when v2 arrives.",
  },
  {
    heading: "Signature pages are not auto-generated",
    body: "Missing blocks are flagged. Agmt will tell you a signature block is absent; it will not invent one.",
  },
] as const;

export const BETA = {
  rule: [
    "Fifty seats in all.",
    "Thirty are open and first-come: submit while they last and the seat is yours.",
    "Twenty are reserved and allotted by hand, so the site never fills them on its own.",
  ],
  aside:
    "Thirty seats are first-come. Twenty are allotted, because some paper should not be a race.",
  emailHelper: "The one your firm would not mind seeing on a waitlist.",
  reminderNote: "Email only. No seat is claimed.",
} as const;

export const LEGAL = [
  "Agmt is not legal advice. A lawyer still signs the paper.",
  "When the product launches, the documents you submit to it remain yours.",
  "This marketing site stores only what the form asks for: name, work email, optional firm and role, which mode interests you, your reminder preferences, and the seat status that follows. Nothing else.",
  "This site does not accept agreements. There is no upload here.",
] as const;

export const FLOW = [
  { step: "Upload pack", note: "SHA, SSA, SPA, letters" },
  { step: "Proof", note: "Instant. No model." },
  { step: "Review", note: "Key Issues List" },
  { step: "Dispositions", note: "Your calls, kept" },
  { step: "v2 diff", note: "The list carries over" },
] as const;
