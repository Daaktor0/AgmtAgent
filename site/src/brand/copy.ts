/**
 * Public-site copy. Source of truth: Agmt-Website-Copywriting-v2.md, which
 * supersedes all v1 wording (including "Legal work. Well made." and
 * "A careful pass. Back in Word."). Section IDs (H01, F04, B03, ...) match
 * that document so a wording change here can be traced back to its source.
 *
 * PROOF_STATE is the one flag every page reads for availability. Do not let
 * a page infer readiness from anything else (a registry flag, a badge, a
 * hopeful sentence) — see Agmt-Website-Copywriting-v2.md §13.
 */
export type PublicationState = "launch" | "prelaunch" | "outage";
/**
 * "prelaunch": web/'s auth gate, zero-LLM guard, 25 MiB/.docx limit, and
 * 2-hour/5-minute retention are genuinely implemented and CI-enforced
 * (deploy fails without RESEND_API_KEY; a smoke test asserts anonymous
 * upload returns 401). But web/src/routes/index.tsx — app.agmt.legal's own
 * current home page — still tells visitors "Beta preparation · uploads not
 * yet available" next to the Proof link. registry.ts marking Proof
 * "available" is exactly the badge §13 says not to trust over that. Flip
 * this once that visitor-facing contradiction is resolved.
 */
export const PROOF_STATE: PublicationState = "prelaunch";

export const FOOTER_DESCRIPTION = "Practical tools for legal work.";

/* ------------------------------------------------------------------ nav */

export const NAV = {
  logoLabel: "Agmt home",
  products: "Products",
  trust: "Document handling",
  app: "Open app",
  mobileMenu: "Menu",
  mobileClose: "Close menu",
  skip: "Skip to content",
};

export const FOOTER_LINKS = {
  products: [
    { label: "All products", to: "/products" },
    { label: "Proof", to: "/products/proof" },
    { label: "Open app", href: "https://app.agmt.legal" },
  ],
  agmt: [
    { label: "Document handling", to: "/trust" },
    { label: "For builders", to: "/builders" },
  ],
  legal: [
    { label: "Privacy Notice", to: "/privacy" },
    { label: "Terms of Use", to: "/terms" },
  ],
};

/* ------------------------------------------------------------------ cta */

export const CTA = {
  useProof: "Use Proof for free",
  seeHowProofWorks: "See how Proof works",
  viewAllProducts: "View all products",
  openApp: "Open app",
  howProofHandles: "How Proof handles your document",
  registerInterest: "Register your interest",
  backToAgmt: "Back to Agmt",
};

/* -------------------------------------------------------------- homepage */

export const HOME = {
  hero: {
    eyebrow: "Legal technology from Agmt",
    headline: "Good legal work deserves better tools.",
    body: "Agmt builds practical tools for legal professionals. Our first product, Proof, checks Word agreements and returns proposed corrections and comments in Word.",
    prelaunchBody:
      "Agmt builds practical tools for legal professionals. Our first product, Proof, is a proofreading tool for Word agreements. It will be free at launch.",
    primaryCta: CTA.useProof,
    secondaryLink: CTA.seeHowProofWorks,
    helper: "Free at launch. A verified email is required.",
    prelaunchHelper: "Proof is not open for use yet.",
  },
  featured: {
    label: "Proof by Agmt",
    headline: "Catch the details that edits leave behind.",
    body: "Repeated words. Unfinished placeholders. References that no longer resolve. Proof gives your agreement a focused check and returns the results in a Word document.",
    outputExplanation:
      "Proposed corrections appear as tracked changes. Items that need your judgment appear as comments.",
    link: CTA.seeHowProofWorks,
    specimenCaption: "Illustrative example. Review proposed changes and comments in Word.",
  },
  facts: {
    items: [
      {
        heading: "Review it in Word.",
        body: "Accept or reject proposed corrections in the document itself.",
      },
      {
        heading: "Know what is checked.",
        body: "Proof runs a defined set of checks, without large language models.",
      },
      {
        heading: "Know how long files stay.",
        body: "Uploaded files, generated files and extracted document content are deleted within two hours of the original upload start.",
      },
    ],
    link: CTA.howProofHandles,
    accessibleLabel: "How Proof works and handles documents",
  },
  future: {
    heading: "More tools for legal work.",
    intro: "Proof is the first Agmt product. These are the next areas we plan to address.",
  },
  closing: {
    headline: "Put Proof to work on your next draft.",
    prelaunchHeadline: "Meet Proof, our first product.",
    body: "A focused proofreading pass, with the result back in Word.",
    prelaunchBody: "A focused proofreading pass for Word agreements. Free at launch.",
    cta: CTA.useProof,
    quietLink: "Building a legal-tech product? Let us know.",
  },
};

/** Reused verbatim on Home (H04) and /products (P03). Names/descriptions match web/src/lib/products/registry.ts. */
export const FUTURE_PRODUCTS = [
  { name: "Review", description: "Agreement review.", status: "Coming soon" },
  { name: "Executed copy", description: "Compile executed agreement copies.", status: "Coming soon" },
  { name: "Signature pack", description: "Prepare signature packs.", status: "Coming soon" },
] as const;

/* ------------------------------------------------------------- products */

export const PRODUCTS_INDEX = {
  eyebrow: "Agmt products",
  headline: "Tools with a clear job to do.",
  body: "Start with Proof for Word agreements. More Agmt products are planned for the work around drafting, review and execution.",
  available: {
    name: "Proof",
    status: "Free at launch",
    prelaunchStatus: "Coming soon · Free at launch",
    headline: "Proofread your agreement. Review the changes in Word.",
    body: "Run a defined set of mechanical checks on a supported Word agreement. Download a document with proposed corrections as tracked changes and issues requiring judgment as comments.",
    primaryCta: CTA.useProof,
    secondaryLink: CTA.seeHowProofWorks,
    helper: "One English .docx per run. A verified email is required.",
  },
  plannedHeading: "Coming next",
};

/* ----------------------------------------------------------- proof page */

export const PROOF = {
  breadcrumb: "Products / Proof",
  name: "Proof by Agmt",
  status: "Free at launch",
  prelaunchStatus: "Coming soon · Free at launch",
  headline: "Proofread your agreement. Review the changes in Word.",
  body: "Upload a supported Word agreement. Proof checks for a defined set of mechanical issues and returns a .docx with proposed corrections and comments for you to review.",
  primaryCta: CTA.useProof,
  helper: "A verified email is required. One native, unencrypted English .docx, up to 25 MiB, per run.",
  secondaryLink: "What Proof checks",
  prelaunchNotice: "Proof is not open for use yet. The details below describe its planned launch scope.",

  output: {
    heading: "The result stays with the document.",
    body: "Corrections you can accept or reject appear as Word tracked changes. Issues that need a decision appear as comments anchored to the relevant text.",
    supporting: "Download the document and review the proposals in Word.",
    exampleLabel: "Illustrative example",
    exampleCaption: "A proposed correction and an unfinished placeholder, shown in Word-style markup.",
  },

  steps: {
    heading: "From your draft back to Word.",
    items: [
      {
        heading: "Choose your agreement.",
        body: "Sign in to Agmt and upload a supported Word document.",
      },
      {
        heading: "Run the checks.",
        body: "Proof checks for the supported issues and prepares the output.",
      },
      {
        heading: "Review the result.",
        body: "Download the Word document. Accept or reject proposed corrections and review the comments.",
      },
    ],
  },

  checks: {
    heading: "What Proof checks",
    intro: "The launch version focuses on six groups of mechanical issues.",
    items: [
      { name: "Common typos", description: "A selected list of common typing errors." },
      { name: "Repeated words", description: "Repeated function words, such as “the the.”" },
      { name: "Unfinished placeholders", description: "Drafting placeholders that still need attention." },
      {
        name: "Missing internal references",
        description: "References that do not resolve within the supported document scope.",
      },
      {
        name: "Duplicate clause numbers",
        description: "Clause numbers that appear more than once within the checked scope.",
      },
      {
        name: "Duplicate definitions",
        description: "Defined terms that appear to have been defined more than once within the checked scope.",
      },
    ],
    scopeNote:
      "Proof is a focused mechanical check. It does not provide a comprehensive grammar check, legal review or confirmation that an agreement is ready to sign.",
    decisionNote: "You decide whether a proposed correction is appropriate for your document.",
  },

  documents: {
    heading: "Before you upload",
    body: "Proof supports one native, unencrypted English Word document (.docx) per run, up to 25 MiB.",
    limitations: "PDF files, older .doc files and password-protected documents are not supported by this release.",
    coverageNote: "Some document features can limit which checks complete. Review any coverage notice with your result.",
  },

  handling: {
    heading: "Temporary files. A clear time limit.",
    body: "Uploaded documents, generated files and extracted document content are deleted from Agmt's servers within two hours of the original upload start. Processing, retries and downloads do not restart that window.",
    timingNote: "Download access closes earlier so deletion can complete within the limit.",
    processingNote: "Proof makes no large language model calls.",
    link: CTA.howProofHandles,
  },

  /** Base FAQ (F07). The early-deletion row is appended only once that control is verified live — see /trust verification note. */
  faq: [
    {
      question: "Is Proof free?",
      answer: "Proof is free at launch. A verified email is required to use it.",
    },
    {
      question: "What do I get back?",
      answer:
        "A Word document (.docx) with eligible proposed corrections as tracked changes and issues requiring judgment as anchored comments.",
    },
    {
      question: "Does Proof perform legal review?",
      answer:
        "No. It checks a defined set of mechanical issues. You remain responsible for the legal content and for deciding which proposals to accept.",
    },
    {
      question: "Does Proof use a large language model?",
      answer: "No. Proof runs its checks without making large language model calls.",
    },
    {
      question: "What if Proof finds no issues?",
      answer:
        "The returned document may be unchanged. No findings means the completed checks found no issues; it is not a guarantee that the document is error-free.",
    },
    {
      question: "How long can I download the result?",
      answer:
        "The application shows your download deadline. Download access ends before the original two-hour deletion limit; retries and downloads do not extend it.",
    },
  ],
  earlyDeleteFaq: {
    question: "Can I delete the files earlier?",
    answer: "Use “Delete files now” in the application to request early deletion.",
  },

  closing: {
    headline: "Give your next draft a Proof pass.",
    prelaunchHeadline: "Proof is coming to Agmt.",
    cta: CTA.useProof,
    prelaunchCta: CTA.viewAllProducts,
    helper: "Review the proposed changes in Word.",
    prelaunchHelper: "Free at launch.",
  },
};

/* ------------------------------------------------------------ trust page */

export const TRUST = {
  eyebrow: "Document handling",
  headline: "Know what happens to your document.",
  body: "Before you use a tool, you should know what it does with your work. Here is how Proof processes document content and limits how long it stays on Agmt's servers.",
  scopeNote: "This page concerns Proof. It is not a blanket privacy or security promise about future Agmt products.",
  prelaunchIntro:
    "The details below describe Proof's required launch behaviour. Live processing and deletion have not yet been verified for publication.",

  processing: {
    heading: "A defined set of checks.",
    body: "Proof checks supported Word agreements for specific mechanical issues. It makes no large language model calls. Proposed corrections appear as tracked changes; issues requiring judgment appear as anchored comments.",
    link: "See what Proof checks",
  },

  retention: {
    heading: "No more than two hours from upload.",
    body: "The deletion window begins when the server authorises the upload. Uploaded documents, generated files and extracted document content are deleted within that original two-hour window. Processing, retries and downloads do not extend it.",
    supporting:
      "Download access closes earlier to allow deletion to complete within the limit. The application shows the deadline for your result.",
  },

  otherRecords: {
    heading: "Document content and account records are different.",
    body: "The two-hour limit applies to Proof's document content. It does not mean that your account details or operational records are deleted after every use. The Privacy Notice explains how those records are handled.",
    link: "Read the Privacy Notice",
  },

  decision: {
    heading: "You review the proposed changes.",
    body: "Proof's checks have a defined scope. A completed run does not certify the legal content or guarantee that every issue has been found. Review the output and any coverage notice before relying on it.",
  },

  further: {
    heading: "Questions about how your information is handled?",
    body: "The Privacy Notice sets out the relevant contact details and how to make a request about your information.",
    link: "Read the Privacy Notice",
  },
};

/* --------------------------------------------------------- builders page */

export const BUILDERS = {
  eyebrow: "For builders",
  headline: "For people building legal technology.",
  body: "Leave your email and, if you have one, a link to your product. We'll get in touch when we have something relevant to share or discuss.",
  formHeading: "Register your interest",
  fields: {
    email: {
      label: "Email address",
      placeholder: "you@example.com",
      helper: "Where we can reach you.",
    },
    url: {
      label: "Product website (optional)",
      placeholder: "https://",
      helper: "A product website or public project page, if you have one.",
    },
  },
  consentLabel: "I agree to receive emails from Agmt relevant to my interest as a legal-tech builder.",
  cta: CTA.registerInterest,
  privacyMicrocopyPrefix:
    "We'll use these details to follow up on your interest. You can ask us to stop at any time. Read our",
  validation: {
    emailMissing: "Enter your email address.",
    emailInvalid: "Enter a valid email address, such as you@example.com.",
    urlInvalid: "Enter a valid website address, or leave this field blank.",
    consentMissing: "Please confirm that Agmt may email you about your interest.",
    saving: "Saving your details...",
    saveFailure: "We couldn't save your details. Please try again.",
    offline: "You're offline. Check your connection and try again.",
    rateLimited: "Too many attempts. Please try again in a few minutes.",
    unavailable: "Registration is temporarily unavailable. Please try again later.",
  },
  confirmation: {
    heading: "Thank you. We have your details.",
    body: "We'll be in touch when we have something relevant to share or discuss.",
    link: CTA.backToAgmt,
  },
  quietLink: "Building a legal-tech product? Let us know.",
};

/* ------------------------------------------------------ shared / states */

export const STATES = {
  notFound: {
    heading: "We couldn't find that page.",
    body: "Check the address, or return to Agmt.",
    action: CTA.backToAgmt,
  },
  pageError: {
    heading: "This page couldn't load.",
    body: "Please try again.",
    action: "Try again",
  },
  loadingFailure: {
    heading: "This is taking longer than expected.",
    body: "Refresh the page to try again.",
    action: "Refresh page",
  },
};

export const A11Y = {
  mobileMenuOpen: "Open navigation",
  mobileMenuClose: "Close navigation",
  mainNav: "Main navigation",
  footerNav: "Footer navigation",
  illustrativeExample: "Illustrative Word output showing a proposed correction and an anchored comment.",
};

/* -------------------------------------------------------------- privacy/terms */

export const LEGAL_PAGES = {
  privacy: {
    heading: "Privacy Notice",
    navTitle: "Privacy Notice",
    pendingBody:
      "Publishing this notice requires facts we have not yet confirmed: the legal operator and a monitored contact route, the categories and purposes of data collected, how long account and builder-contact records are kept, which processors and hosting providers are involved, and how to withdraw or request your information.",
  },
  terms: {
    heading: "Terms of Use",
    navTitle: "Terms of Use",
    pendingBody:
      "Publishing these terms requires facts we have not yet confirmed: the actual operator of Agmt, the service conditions that apply, and the supported limits of each product.",
  },
  pendingHeading: "This notice is not yet published.",
  pendingNote: "We will publish the full notice once those details are confirmed.",
};

/* -------------------------------------------------------------- metadata */

export const METADATA = {
  home: {
    title: "Agmt — Practical tools for legal work",
    description:
      "Agmt builds practical tools for legal professionals. Start with Proof, a Word agreement proofreader that returns tracked corrections and comments.",
    prelaunchTitle: "Proof by Agmt — Word agreement proofreading, coming soon",
    prelaunchDescription:
      "Proof is Agmt's forthcoming Word agreement proofreader. Explore its planned checks, Word output and document-handling requirements. Free at launch.",
    socialHeadline: "Good legal work deserves better tools.",
    socialSupport: "Practical tools from Agmt. Starting with Proof.",
  },
  products: {
    title: "Products — Agmt",
    description:
      "Explore Agmt products for legal work. Proof is free at launch; agreement review, executed-copy compilation and signature-pack preparation are planned.",
  },
  proof: {
    title: "Proof by Agmt — Word agreement proofreading",
    description:
      "Check a supported Word agreement and review proposed corrections and anchored comments in Word. Proof is free at launch.",
    prelaunchTitle: "Proof by Agmt — Word agreement proofreading, coming soon",
    prelaunchDescription:
      "Proof is Agmt's forthcoming Word agreement proofreader. Explore its planned checks, Word output and document-handling requirements. Free at launch.",
    socialHeadline: "Proofread your agreement. Review the changes in Word.",
    socialLabel: "Free at launch",
  },
  trust: {
    title: "How Proof handles documents — Agmt",
    description:
      "Understand Proof's checks, Word output and original two-hour document-content deletion window, including how account records are handled separately.",
  },
  builders: {
    title: "For legal-tech builders — Agmt",
    description:
      "Building a legal-tech product? Register your email with Agmt so we can contact you when there is something relevant to share or discuss.",
    socialHeadline: "For people building legal technology.",
    socialSupport: "Register your interest with Agmt.",
  },
  privacy: { title: "Privacy Notice — Agmt", description: "How Agmt handles information, and how to contact us about your privacy." },
  terms: { title: "Terms of Use — Agmt", description: "Terms governing the use of Agmt and its products." },
};

export const COMPANY = {
  oneLine: "Agmt builds practical tools for legal professionals.",
  short:
    "Agmt is an independent legal-technology company building practical tools for legal professionals. Proof, its first product, checks supported Word agreements and returns proposed corrections and comments in Word.",
};
