/**
 * Beta evaluation labels. Written before execution. Independent of packed
 * PEE unit-test cases and not a substitute for the original user document.
 */
export type BetaEvalKind = "agreement" | "amendment" | "notice" | "letter" | "prose";

export type BetaEvalExpected = {
  ruleId: string;
  kind: "correction" | "comment";
  quote: string;
};

export type BetaEvalDoc = {
  id: string;
  kind: BetaEvalKind;
  title: string;
  clean: boolean;
  language: "en-GB" | "en-US";
  paragraphs: string[];
  header?: string;
  expected: BetaEvalExpected[];
  notes: string;
};

export const BETA_EVAL_DOCS: BetaEvalDoc[] = [
  {
    id: "01_agreement_clean_asset_sale",
    kind: "agreement",
    title: "Asset sale agreement with defined names and decimals",
    clean: true,
    language: "en-GB",
    paragraphs: [
      "This Asset Sale Agreement is made on 12 March 2026 between Oakridge Components Limited (the Seller) and Harbour Mill Trading Limited (the Buyer).",
      "\"Completion Date\" means the date on which Completion occurs.",
      "The Seller shall deliver the Plant to the Buyer on the Completion Date.",
      "The Purchase Price is 3.14 percent of the Reference Amount stated in Schedule 1.",
      "Notices may be sent to finance@oakridge.example or https://oakridge.example/notices.",
      "The Seller shall use e.g. the form attached as Schedule 2.",
    ],
    expected: [],
    notes: "First-run held-out. Clean traps: defined labels, decimal, URL, email, e.g., Ltd names. Title-case schedule pointers were labelled clean before execution.",
  },
  {
    id: "02_agreement_clean_nda",
    kind: "agreement",
    title: "Mutual NDA with quoted defined names",
    clean: true,
    language: "en-GB",
    paragraphs: [
      "This agreement is between Silverpine Advisers LLP (the Disclosing Party) and North Quay Research Limited (the Receiving Party).",
      "\"Confidential Information\" means information marked confidential and disclosed for the Project.",
      "The Receiving Party shall keep the Confidential Information in confidence.",
      "The Receiving Party shall not use \"Confidential Information\" except for the Project.",
      "Mr. Patel shall return the papers within ten business days.",
    ],
    expected: [],
    notes: "Quoted defined name and title-case party names must stay silent.",
  },
  {
    id: "03_amendment_clean_clause",
    kind: "amendment",
    title: "Deed of amendment with matching clause numbers",
    clean: true,
    language: "en-GB",
    paragraphs: [
      "This Deed of Amendment is made between the Company and the Investor.",
      "Clause 4.1 of the Original Agreement is deleted and replaced with the following.",
      "4.1 The Investor shall subscribe for the Shares in cash on the Payment Date.",
      "Except as amended by this Deed, the Original Agreement remains in full force.",
      "The parties have executed this Deed on the date written above.",
    ],
    expected: [],
    notes: "First-run held-out. Matching amendment restatement; no planted mechanical error.",
  },
  {
    id: "04_notice_clean_completion",
    kind: "notice",
    title: "Completion notice with date and abbreviation traps",
    clean: true,
    language: "en-GB",
    paragraphs: [
      "To: The Buyer",
      "We hereby give notice that Completion will take place at 10.00 a.m. on 30 November 2026 at the registered office.",
      "Please bring the original share certificates and two forms of identification.",
      "Yours faithfully",
      "For and on behalf of Cedar Vault Limited",
    ],
    expected: [],
    notes: "a.m., November 30 is valid, letter-style closings.",
  },
  {
    id: "05_letter_clean_engagement",
    kind: "letter",
    title: "Engagement letter with UK spelling",
    clean: true,
    language: "en-GB",
    paragraphs: [
      "Dear Ms. Rowe",
      "Thank you for instructing us to organise the completion papers for the transaction.",
      "We will colour-code the enclosures so that each signatory can identify the pages that require execution.",
      "Please telephone the writer if the timetable needs to be discussed.",
      "Yours sincerely",
    ],
    expected: [],
    notes: "organise/colour are valid en-GB.",
  },
  {
    id: "06_prose_clean_board",
    kind: "prose",
    title: "Board paper with ellipsis and percentages",
    clean: true,
    language: "en-GB",
    paragraphs: [
      "The committee considered the proposed dividend and the associated cash requirement.",
      "The forecast surplus is 12.5 percent after tax, subject to the usual working-capital reserve.",
      "Management asked the board to wait... then decide after the March figures are available.",
      "No resolution is sought at this meeting beyond noting the paper.",
    ],
    expected: [],
    notes: "Ellipsis and percent literal are traps, not errors.",
  },
  {
    id: "07_prose_clean_policy",
    kind: "prose",
    title: "Internal policy extract",
    clean: true,
    language: "en-GB",
    paragraphs: [
      "Staff must record gifts above the stated threshold in the register kept by the company secretary.",
      "The threshold is GBP 50 (fifty pounds) unless a local addendum says otherwise.",
      "Questions should be sent to compliance before the gift is accepted.",
    ],
    expected: [],
    notes: "Matching words and figures.",
  },
  {
    id: "08_letter_clean_us_organize",
    kind: "letter",
    title: "US client letter with organize",
    clean: true,
    language: "en-US",
    paragraphs: [
      "Dear Jordan",
      "Please organize the closing binders and send them by courier on Friday.",
      "The estimate is $10,000 (ten thousand dollars) excluding tax.",
      "Kind regards",
    ],
    expected: [],
    notes: "US organize and matching amount pair.",
  },
  {
    id: "09_notice_clean_hyperlink",
    kind: "notice",
    title: "Notice containing a URL and email",
    clean: true,
    language: "en-GB",
    paragraphs: [
      "Please download the data room index from https://files.example.test/index and then notify counsel.",
      "Direct questions to deals@harbourmill.example before 5 p.m. on Friday.",
      "This notice is given under clause 18 of the Agreement.",
    ],
    expected: [],
    notes: "URL and email must not be spell-checked as prose tokens.",
  },
  {
    id: "10_agreement_clean_ltd_variant",
    kind: "agreement",
    title: "Party name Ltd/Limited trap",
    clean: true,
    language: "en-GB",
    paragraphs: [
      "This agreement is between Maple Court Holdings Limited (the Company) and the Investor.",
      "The Company, Maple Court Holdings Ltd, shall keep the statutory books at the registered office.",
      "The Investor shall pay the subscription monies to the Company on Completion.",
    ],
    expected: [],
    notes: "Ltd vs Limited is an established party trap, not a finding.",
  },
  {
    id: "11_amendment_clean_schedule",
    kind: "amendment",
    title: "Schedule restart numbering trap",
    clean: true,
    language: "en-GB",
    paragraphs: [
      "The parties agree to replace Schedule 1 of the Original Agreement.",
      "SCHEDULE 1",
      "1. The following definitions apply in this Schedule.",
      "2. The Services are described in the statement of work attached to this Schedule.",
      "The amendment does not affect Schedule 2 of the Original Agreement.",
    ],
    expected: [],
    notes: "Schedule restarting at 1 is not a duplicate-number error.",
  },
  {
    id: "12_agreement_liason_spelling",
    kind: "agreement",
    title: "Independent dictionary misspelling liason",
    clean: false,
    language: "en-GB",
    paragraphs: [
      "The Company shall appoint a liason officer to coordinate the handover with the Buyer.",
      "That officer shall report weekly until Completion.",
    ],
    expected: [{ ruleId: "spelling.dictionary", kind: "comment", quote: "liason" }],
    notes: "Independent of recieve/teh/goverment development tokens.",
  },
  {
    id: "13_amendment_seperate_typo",
    kind: "amendment",
    title: "Allowlist typo in an amendment",
    clean: false,
    language: "en-GB",
    paragraphs: [
      "Clause 7.2 is amended so that the Seller shall seperate the escrow funds from its operating account.",
      "All other terms of the Original Agreement remain unchanged.",
    ],
    expected: [{ ruleId: "language.typo_allowlist", kind: "correction", quote: "seperate" }],
    notes: "Allowlist correction in amendment prose.",
  },
  {
    id: "14_notice_duplicate_comma",
    kind: "notice",
    title: "Repeated comma in a notice",
    clean: false,
    language: "en-GB",
    paragraphs: [
      "Please pay,, the outstanding invoice within five business days of this notice.",
      "Interest will accrue after that date in accordance with the Agreement.",
    ],
    expected: [{ ruleId: "punctuation.duplicate_mark", kind: "correction", quote: ",," }],
    notes: "Duplicate comma in operative notice prose.",
  },
  {
    id: "15_letter_duplicate_the",
    kind: "letter",
    title: "Repeated function word in a letter",
    clean: false,
    language: "en-GB",
    paragraphs: [
      "I write to confirm that the the signed counterparts were received this morning.",
      "Please retain one original with your papers.",
    ],
    expected: [{ ruleId: "language.duplicate_word", kind: "correction", quote: "the" }],
    notes: "Duplicate function word.",
  },
  {
    id: "16_agreement_undefined_term",
    kind: "agreement",
    title: "Undefined title-case term",
    clean: false,
    language: "en-GB",
    paragraphs: [
      "This agreement is between Riverton Logistics Limited (the Supplier) and the Customer.",
      "The Supplier shall keep the Service Levels for the duration of this agreement.",
      "The Customer shall pay the charges within 30 days.",
    ],
    expected: [{ ruleId: "definitions.undefined_use", kind: "comment", quote: "Service Levels" }],
    notes: "Service Levels is used as a defined term without a declaration.",
  },
  {
    id: "17_agreement_placeholder",
    kind: "agreement",
    title: "Unfilled placeholder",
    clean: false,
    language: "en-GB",
    paragraphs: [
      "The Seller shall deliver the notice under Clause 8 by [TBD].",
      "The Buyer shall acknowledge receipt in writing.",
    ],
    expected: [{ ruleId: "completion.placeholder", kind: "comment", quote: "[TBD]" }],
    notes: "First-run held-out. Exact unfinished drafting marker. Clause 8 was not labelled as an error.",
  },
  {
    id: "18_letter_quoted_prose_concensus",
    kind: "letter",
    title: "Misspelling inside quoted ordinary prose",
    clean: false,
    language: "en-GB",
    paragraphs: [
      "The client wrote: \"Please record the concensus of the working group in the minutes and send them today.\"",
      "I would be grateful if you could confirm that this was done.",
    ],
    expected: [{ ruleId: "spelling.dictionary", kind: "comment", quote: "concensus" }],
    notes: "Quoted prose should be commented, not treated as a defined label.",
  },
  {
    id: "19_notice_repeat_guage",
    kind: "notice",
    title: "Repeated independent misspelling",
    clean: false,
    language: "en-GB",
    paragraphs: [
      "Please send the pressure guage reading before noon.",
      "A second guage reading is required after the test.",
      "Retain the guage certificates with the site file.",
    ],
    expected: [{ ruleId: "spelling.dictionary", kind: "comment", quote: "guage" }],
    notes: "Three occurrences; comments should combine, not disappear.",
  },
  {
    id: "20_agreement_words_figures",
    kind: "agreement",
    title: "Bound words and figures mismatch",
    clean: false,
    language: "en-GB",
    paragraphs: [
      "The Buyer shall pay USD 10,000 (fifteen thousand) within five business days of Completion.",
      "Payment shall be made to the account nominated by the Seller.",
    ],
    expected: [{ ruleId: "figures.words_figures_mismatch", kind: "comment", quote: "USD 10,000 (fifteen thousand)" }],
    notes: "Adjacent bound pair with different values.",
  },
];
