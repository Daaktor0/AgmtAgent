/**
 * Post-observation rewrites of three first-run documents. Development/regression
 * only. Not held-out evidence. Original labels and first-run results stay in
 * labels.ts and first-run-results.json.
 */
import type { BetaEvalDoc } from "./labels.ts";

export const BETA_EVAL_REWRITTEN_REGRESSION: BetaEvalDoc[] = [
  {
    id: "01_agreement_clean_asset_sale_rewritten",
    kind: "agreement",
    title: "Rewritten asset sale (post-observation)",
    clean: true,
    language: "en-GB",
    paragraphs: [
      "This Asset Sale Agreement is made on 12 March 2026 between Oakridge Components Limited (the Seller) and Harbour Mill Trading Limited (the Buyer).",
      "\"Completion Date\" means the date on which Completion occurs.",
      "The Seller shall deliver the Plant to the Buyer on the Completion Date.",
      "The Purchase Price is 3.14 percent of the amount stated in the attached list.",
      "Notices may be sent to finance@oakridge.example or https://oakridge.example/notices.",
      "The Seller shall use e.g. the form attached to this agreement.",
    ],
    expected: [],
    notes: "Rewritten after first-run structural comments. Not untouched held-out evidence.",
  },
  {
    id: "03_amendment_clean_clause_rewritten",
    kind: "amendment",
    title: "Rewritten deed of amendment (post-observation)",
    clean: true,
    language: "en-GB",
    paragraphs: [
      "This Deed of Amendment is made between the Company and the Investor.",
      "The subscription clause of the Original Agreement is deleted and replaced with the following.",
      "The Investor shall subscribe for the Shares in cash on the date of this Deed.",
      "Except as amended by this Deed, the Original Agreement remains in full force.",
      "The parties have executed this Deed on the date written above.",
    ],
    expected: [],
    notes: "Rewritten after first-run structural comments. Not untouched held-out evidence.",
  },
  {
    id: "17_agreement_placeholder_rewritten",
    kind: "agreement",
    title: "Rewritten placeholder (post-observation)",
    clean: false,
    language: "en-GB",
    paragraphs: [
      "The Seller shall deliver the notice by [TBD].",
      "The Buyer shall acknowledge receipt in writing.",
    ],
    expected: [{ ruleId: "completion.placeholder", kind: "comment", quote: "[TBD]" }],
    notes: "Rewritten after first-run structural comments. Not untouched held-out evidence.",
  },
];
