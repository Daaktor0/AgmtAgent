/**
 * Product claims used by the marketing site.
 *
 * Keep this file factual. Do not add customer names, metrics, certifications,
 * pricing amounts, model/provider claims, or promises about document handling.
 */

export const FOOTER = "Agmt · Software for Indian transactional lawyers · India";

export const PRODUCT = {
  eyebrow: "Built for Indian transaction teams",
  tagline: "Proof the artefact. Review the deal.",
  heading: "Your deal pack, under control.",
  lede: "Upload the documents. Catch what breaks. Work the issues. Download the redline.",
  scope:
    "Proof starts with SHA, SSA, SPA and disclosure letters. Review launches first for company-side SHA at signing.",
  matter:
    "Agmt is organised around a Matter: one deal pack, its documents, versions and the calls you make along the way.",
  seats: "The first beta is limited to 50 seats: 30 first-come and 20 allotted.",
} as const;

export const PROOF = {
  label: "Proof",
  price: "Free mode",
  heading: "Catch what breaks before it travels.",
  lede:
    "Upload a native Word file and run a fast integrity pass before the document moves to the next reviewer.",
  does: [
    "Undefined and unused definitions",
    "Broken cross-references and numbering",
    "Placeholders and hidden characters",
    "Words-versus-figures conflicts",
    "Party and signature-block mismatches",
    "A deal map and document outline",
  ],
  refusesTitle: "Proof stays in its lane",
  refuses: ["It does not decide the legal position", "It does not call a clause “market”"],
  aside: "A clean result is shown only when every required check completed.",
} as const;

export const REVIEW = {
  label: "Review",
  price: "Paid mode",
  heading: "Turn the review into a list you can work.",
  lede:
    "Set who you act for, the stage and what must be protected. Agmt reads the named provisions and builds a Key Issues List.",
  does: [
    "Severity, topic and clause",
    "The exact document wording",
    "Why it matters for the mandate",
    "A clear ask and reviewer stamp",
    "Accept, edit, reject or park",
    "Accepted edits in a tracked-change DOCX",
  ],
  refusesTitle: "The working object",
  refuses: ["A structured list, not a disappearing memo", "A lawyer makes every final call"],
  survives:
    "The list stays with the Matter, so the document and your decisions remain connected.",
  aside: "Work the issue. Record the call. Carry it into the next document round.",
} as const;

export const IS_NOT = [
  "Not a Word add-in at launch. Agmt is a web app and returns a tracked-change DOCX that opens in Word.",
  "Not CLM, a document repository, e-signature or obligation management.",
  "Not legal research, litigation software or a general legal chatbot.",
  "Not an in-browser replacement for Word.",
  "Not legal advice. The lawyer decides what is accepted, shared and signed.",
] as const;

export const WHO = {
  is: "Indian transactional associates and partners working on SHA, SSA, SPA and disclosure-letter deal packs.",
  isNot: "Agmt is not designed as a general contract tool for every document or every legal workflow.",
} as const;

export const HOW = [
  {
    heading: "Create the Matter",
    body: "Name the deal pack and set the mandate: who you act for, the instrument, the stage and what must be protected.",
  },
  {
    heading: "Upload the native DOCX",
    body: "Add the agreement to the Matter. Agmt builds the document outline, definition graph and proposed canonicalisation map.",
  },
  {
    heading: "Confirm the map",
    body: "Review legal-name mappings and identifier candidates before the document moves into Proof or Review.",
  },
  {
    heading: "Run Proof",
    body: "Inspect mechanical hits, the deal map, source quality and any check that could not complete. Proof remains useful on its own.",
  },
  {
    heading: "Work the Review list",
    body: "Open each issue with its clause, exact wording, mandate-specific reason and ask. Accept, edit, reject or park it.",
  },
  {
    heading: "Download the work",
    body: "Export the current list or download eligible accepted edits in a tracked-change DOCX for Word.",
  },
] as const;

export const BETA = {
  rule: [
    "Fifty seats in the first beta.",
    "Thirty are first-come. Submit while one is available and the seat is held.",
    "Twenty are allotted by hand for a balanced testing group.",
  ],
  aside: "Join for Proof, Review or both. The form tells you exactly what your submission secured.",
  emailHelper: "Use the address where you want the beta invitation.",
  reminderNote: "Email only. No beta seat is claimed.",
} as const;

export const LEGAL = [
  "Agmt is software for legal professionals. It does not replace professional judgment or provide legal advice.",
  "The marketing site accepts beta sign-ups. The product accepts documents when product access is available.",
  "You decide what you submit to Agmt and what output you accept, share or sign.",
] as const;

export const FLOW = [
  { step: "Matter", note: "Set the deal and mandate" },
  { step: "Upload", note: "Add native DOCX files" },
  { step: "Proof", note: "Catch artefact defects" },
  { step: "Review", note: "Work the Key Issues List" },
  { step: "Download", note: "Take the list or redline" },
] as const;
