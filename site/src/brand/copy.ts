/**
 * Public claims for the Agmt launch site.
 *
 * Keep this file factual and visitor-relevant. Do not add customer names,
 * invented metrics, model/provider claims, document-handling promises, or
 * internal beta-allocation mechanics.
 */

export const FOOTER =
  "Agmt · Free agreement proofing for Indian transaction teams · Launching soon";

export const PRODUCT = {
  eyebrow: "The last pass should not take all night",
  tagline: "Find what changed. Catch what broke.",
  heading: "Proofing should not take another evening.",
  lede:
    "Agreements collect broken references, drifting defined terms, numbering gaps and leftover blanks one edit at a time. Agmt checks the document in one pass. Free.",
  scope:
    "Built first for Indian transactional counsel working on shareholder agreements.",
  matter:
    "After the check, Agmt keeps the agreement, its findings, review issues, your decisions, the redline and the email that follows together in one Matter.",
  seats: "Launching soon. The first beta is capped at 50 seats.",
  free: "Free to use when the beta opens.",
} as const;

export const PROBLEM = {
  eyebrow: "The work nobody sees",
  heading: "One agreement. Hundreds of small things to verify.",
  lede:
    "The document has already been drafted, negotiated, copied, renumbered and turned again. The legal judgment gets the attention. The mechanical sweep gets whatever time remains.",
  checks: [
    {
      label: "Definitions",
      title: "A term drifts.",
      body: "Used but never defined. Defined twice. Capitalised differently in one clause.",
    },
    {
      label: "References",
      title: "A clause moves.",
      body: "The numbering changes. The pointer to the old section stays behind.",
    },
    {
      label: "Structure",
      title: "A list breaks.",
      body: "A skipped limb, duplicated number or bracketed blank survives the final round.",
    },
    {
      label: "Parties & figures",
      title: "One detail disagrees.",
      body: "A name, date, amount, percentage or signature block stops matching the rest.",
    },
  ],
} as const;

export const PROOF = {
  label: "Proof",
  price: "Free",
  heading: "A reliable first check, available to everyone.",
  lede:
    "Run a structured integrity pass over a native Word agreement before it reaches the next reviewer.",
  does: [
    "Undefined, unused and inconsistent defined terms",
    "Broken cross-references, numbering and list sequence",
    "Placeholders, hidden characters and unfinished drafting marks",
    "Words-versus-figures conflicts and repeated values",
    "Party names, dates, percentages and signature blocks",
    "A document outline and deal map for the review ahead",
  ],
  refusesTitle: "Evidence, not a vague score",
  refuses: [
    "Each finding points to the exact place in the document",
    "A clean result appears only when the required checks complete",
  ],
  aside:
    "The point is not novelty. It is to make the careful final sweep repeatable, reliable and free.",
} as const;

export const REVIEW = {
  label: "Review",
  price: "Structured review",
  heading: "Then spend the lawyer time on the legal call.",
  lede:
    "Proof asks whether the document holds together. Review asks whether the named provisions work for the mandate: who you act for, the deal stage and what must be protected.",
  does: [
    "A Key Issues List organised by severity, topic and clause",
    "The exact document wording beside every issue",
    "Why the point matters for this mandate",
    "A clear ask and reviewer stamp",
    "Accept, edit, reject or park each issue",
    "Eligible accepted edits carried into a tracked-change DOCX",
  ],
  refusesTitle: "A review you can keep working",
  refuses: [
    "The issue stays attached to its wording and rationale",
    "The lawyer makes every final call",
  ],
  survives:
    "Your decisions remain with the Matter, ready for the next document turn and the email that follows.",
  aside: "Proof the document. Review the deal. Keep the two kinds of work distinct.",
} as const;

export const MAIL = {
  label: "The work after review",
  heading: "Draft the email from decisions already made.",
  lede:
    "Turn the current Matter into a partner brief, client update or team note. Edit it, copy it or download it for the channel you already use.",
} as const;

export const WHO = {
  is: "Built first for Indian transactional associates and partners working on shareholder agreements.",
  isNot:
    "The first route is deliberately focused so the proof and review can be checked against a clear standard.",
} as const;

export const HOW = [
  {
    heading: "Bring the agreement into a Matter",
    body: "Keep the document, its versions and the mandate together as the working record for the deal.",
  },
  {
    heading: "Run the free Proof pass",
    body: "Check definitions, cross-references, numbering, blanks, figures, parties and structural consistency in one sweep.",
  },
  {
    heading: "Inspect the evidence",
    body: "Open each finding at the exact document location. Incomplete checks remain visible.",
  },
  {
    heading: "Move into Review",
    body: "Work the named legal provisions against the party, stage and protections that matter for the mandate.",
  },
  {
    heading: "Make the call",
    body: "Accept, edit, reject or park each issue. Your decision stays connected to its wording and rationale.",
  },
  {
    heading: "Take the work forward",
    body: "Download eligible accepted edits in a tracked-change Word file and draft the email that follows.",
  },
] as const;

export const BETA = {
  headline: "Book your place before Agmt opens.",
  capacity: "50 seats. One focused first cohort.",
  body:
    "Agmt is launching soon. Book a beta seat to be considered for the first cohort, or set a reminder if you only want the launch note.",
  aside:
    "Choose Proof, Review or both. We will write to the address you give us before access opens.",
  emailHelper: "Use the address where you want the beta note.",
  reminderNote: "A reminder does not book a beta seat.",
} as const;

export const LEGAL = [
  "Agmt is software for legal professionals. It does not replace professional judgment or provide legal advice.",
  "Agmt is launching soon. The first beta is capped at 50 seats.",
  "You decide what you submit, what changes you accept and what you share or sign.",
] as const;

export const FLOW = [
  { step: "Draft", note: "The agreement takes shape" },
  { step: "Turn", note: "Edits and numbering move" },
  { step: "Proof", note: "Mechanical defects surface" },
  { step: "Review", note: "Legal issues become decisions" },
  { step: "Forward", note: "Redline and email follow" },
] as const;
