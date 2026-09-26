import type { CorpusFixture } from "./types.ts";

const SIGS_ALL = [
  "Signed for and on behalf of the Company",
  "Authorised Signatory",
  "Signed for and on behalf of the Investor",
  "Authorised Signatory",
  "Signed for and on behalf of the Promoter",
  "Authorised Signatory",
];

function parties(date = "1 January 2026"): string[] {
  return [
    "SHAREHOLDERS AGREEMENT",
    `This Shareholders Agreement (the "Agreement") is made on ${date} at Bengaluru.`,
    "BETWEEN",
    'Acme Technologies Private Limited, a company incorporated under the Companies Act, 2013 (the "Company");',
    "AND",
    'Northstar Capital Partners LLP (the "Investor");',
    "AND",
    'Rohan Mehta (the "Promoter").',
  ];
}

function wrap(clauses: string[], signatures = SIGS_ALL, schedule?: string[]): string[] {
  return [...parties(), ...clauses, "IN WITNESS WHEREOF the Parties have executed this Agreement.", ...signatures, ...(schedule ?? [])];
}

/** 13 labelled SHAs. Every v1 check has a must-find and an exception. */
export const CORPUS: CorpusFixture[] = [
  {
    id: "sha-01-xref-placeholder",
    title: "Broken xref and unfilled placeholder",
    paragraphs: wrap([
      "1. Definitions and Interpretation",
      '"Affiliate" means any Person that controls the Company.',
      '"Person" means any individual or company.',
      "2. Effectiveness and Term",
      "This Agreement shall continue until terminated in accordance with Clause 99.1.",
      "3. Share Capital",
      "The subscription amount is INR 10,000,000.",
      "4. Transfer of Securities",
      "No Shareholder shall Transfer any Securities except as permitted under this Clause 4.",
      "5. Notices",
      "Any notice shall be sent as set out in this Clause 5.",
      "6. Date of execution",
      "This Agreement is made on [insert date].",
    ]),
    labels: [
      { kind: "must_find", checkId: "structure.broken_xref", needle: "99.1" },
      { kind: "must_find", checkId: "exec.unfilled_placeholder", needle: "insert date" },
      { kind: "trap", checkId: "structure.broken_xref", needle: "Clause 4", note: "existing clause is not a defect" },
      { kind: "trap", checkId: "structure.broken_xref", needle: "Clause 5", note: "self-reference resolves" },
    ],
  },
  {
    id: "sha-02-unused-hidden",
    title: "Unused definition and hidden character",
    paragraphs: (() => {
      const paras = wrap([
        "1. Definitions",
        '"Affiliate" means a Person controlling the Company.',
        '"Person" means any individual or company.',
        '"Business Plan" means the annual business plan of the Company.',
        "2. Transfers",
        "An Affiliate may receive Securities. A Promoter lock-in applies for three years.",
        "3. Term",
        "This Agreement continues as set out in this Clause 3.",
      ]);
      const i = paras.findIndex((p) => p.includes("lock-in"));
      paras[i] = paras[i].replace("lock-in", "lock\u200b-in");
      return paras;
    })(),
    labels: [
      { kind: "must_find", checkId: "defterm.unused", needle: "Business Plan" },
      { kind: "must_find", checkId: "exec.hidden_character", needle: "zero_width" },
      { kind: "trap", checkId: "defterm.unused", needle: "Affiliate", note: "used term stays quiet" },
      { kind: "not_a_defect", checkId: "exec.hidden_character", needle: "hyphen", note: "ordinary hyphen in lock-in" },
    ],
  },
  {
    id: "sha-03-signature-gap",
    title: "Named Investor has no signature block",
    paragraphs: wrap(
      [
        "1. Definitions",
        '"Person" means any individual or company.',
        "2. Term",
        "This Agreement continues as set out in this Clause 2.",
      ],
      [
        "Signed for and on behalf of the Company",
        "Authorised Signatory",
        "Signed for and on behalf of the Promoter",
        "Authorised Signatory",
      ],
    ),
    labels: [
      { kind: "must_find", checkId: "exec.signature_block_mismatch", needle: "Investor" },
      { kind: "trap", checkId: "exec.signature_block_mismatch", needle: "Company", note: "Company block is present" },
    ],
  },
  {
    id: "sha-04-numbering-gap",
    title: "Clause 3 omitted in the body",
    paragraphs: wrap([
      "1. Definitions",
      '"Person" means any individual or company.',
      "2. Term",
      "This Agreement continues as set out in this Clause 2.",
      "4. Board and Governance",
      "The Board shall comprise five Directors.",
      "5. Notices",
      "Notices follow this Clause 5.",
    ]),
    labels: [
      { kind: "must_find", checkId: "structure.numbering_gap", needle: "3" },
      { kind: "trap", checkId: "structure.broken_xref", needle: "Clause 2" },
    ],
  },
  {
    id: "sha-05-duplicate-number",
    title: "Duplicate body 3; schedule 1 is a different namespace",
    paragraphs: wrap(
      [
        "1. Definitions",
        '"Person" means any individual or company.',
        "2. Term",
        "This Agreement continues as set out in this Clause 2.",
        "3. Board",
        "The Board shall comprise five Directors.",
        "3. Governance again",
        "Quorum at a Board meeting shall require the Investor Director.",
        "4. Notices",
        "Notices follow this Clause 4.",
      ],
      SIGS_ALL,
      ["Schedule 1 Notices", "1. Address", "Company: Acme Technologies Private Limited"],
    ),
    labels: [
      { kind: "must_find", checkId: "structure.duplicate_number", needle: "3" },
      {
        kind: "trap",
        checkId: "structure.duplicate_number",
        needle: "1",
        note: "body 1 and schedule 1 are different namespaces",
      },
    ],
  },
  {
    id: "sha-06-amount-table",
    title: "Subscription amount clashes with the table",
    paragraphs: wrap([
      "1. Definitions",
      '"Person" means any individual or company.',
      "2. Share Capital",
      "Subscription amount: INR 10000000 is payable at closing.",
      "3. Headcount",
      "Employee count: 12 is the current figure.",
      "4. Term",
      "This Agreement continues as set out in this Clause 4.",
    ]),
    docx: {
      tableRows: [
        ["Subscription amount: INR 5000000"],
        ["Employee count: 12"],
        ["Office count: 3"],
      ],
    },
    labels: [
      { kind: "must_find", checkId: "amount.table_prose_conflict", needle: "subscription amount" },
      {
        kind: "trap",
        checkId: "amount.table_prose_conflict",
        needle: "office count",
        note: "coincidental number without a shared label",
      },
      {
        kind: "not_a_defect",
        checkId: "amount.table_prose_conflict",
        needle: "employee count",
        note: "same labelled figure in table and prose",
      },
    ],
  },
  {
    id: "sha-07-header-party",
    title: "Header names a different legal entity",
    paragraphs: wrap([
      "1. Definitions",
      '"Person" means any individual or company.',
      "2. Term",
      "This Agreement continues as set out in this Clause 2.",
    ]),
    docx: { header: "Helios Ventures Private Limited — draft SHA" },
    labels: [
      { kind: "must_find", checkId: "party.header_counterparty_mismatch", needle: "Helios" },
    ],
  },
  {
    id: "sha-08-fields",
    title: "Unresolved MERGEFIELD; PAGE is excluded",
    paragraphs: wrap([
      "1. Definitions",
      '"Person" means any individual or company.',
      "2. Term",
      "This Agreement continues as set out in this Clause 2.",
    ]),
    docx: { fields: ["MERGEFIELD ClosingDate", "PAGE"] },
    labels: [
      { kind: "must_find", checkId: "exec.suspicious_field", needle: "MERGEFIELD" },
      { kind: "trap", checkId: "exec.suspicious_field", needle: "PAGE", note: "page number fields are excluded" },
    ],
  },
  {
    id: "sha-09-undefined-candidate",
    title: "Securities used without a definition",
    paragraphs: wrap([
      "1. Definitions",
      '"Person" means any individual or company.',
      "2. Transfer of Securities",
      "No Shareholder shall Transfer any Securities except as permitted under this Clause 2.",
      "3. Board",
      "The Board shall comprise five Directors.",
      "4. Governing Law",
      "This Agreement is governed by the laws of India.",
    ]),
    labels: [
      { kind: "must_find", checkId: "defterm.undefined_candidate", needle: "Securities" },
      { kind: "trap", checkId: "defterm.undefined_candidate", needle: "Board", note: "legal stopword" },
      { kind: "trap", checkId: "defterm.undefined_candidate", needle: "India", note: "configured stopword" },
    ],
  },
  {
    id: "sha-10-unresolved-comment",
    title: "Open Word comment",
    paragraphs: wrap([
      "1. Definitions",
      '"Person" means any individual or company.',
      "2. Term",
      "This Agreement continues as set out in this Clause 2.",
    ]),
    docx: { comments: [{ author: "Associate", text: "Confirm the lock-in with the partner." }] },
    labels: [
      { kind: "must_find", checkId: "exec.unresolved_comment", needle: "Associate" },
    ],
  },
  {
    id: "sha-11-clean-exceptions",
    title: "Clean SHA — exceptions and matching header",
    paragraphs: wrap([
      "1. Definitions",
      '"Affiliate" means a Person controlling the Company.',
      '"Person" means any individual or company.',
      "2. Term",
      "This Agreement continues as set out in this Clause 2. A Promoter lock-in applies for three years.",
      "3. Board",
      "The Board shall comprise five Directors. An Affiliate may attend as observer.",
      "4. Notices",
      "Notices follow this Clause 4.",
    ]),
    docx: {
      header: "Acme Technologies Private Limited (the Company)",
      fields: ["PAGE"],
    },
    labels: [
      { kind: "trap", checkId: "defterm.unused", needle: "Affiliate" },
      { kind: "trap", checkId: "structure.broken_xref", needle: "Clause 2" },
      { kind: "trap", checkId: "structure.numbering_gap", note: "1–4 consecutive" },
      { kind: "trap", checkId: "exec.signature_block_mismatch", note: "all named parties signed" },
      { kind: "trap", checkId: "exec.hidden_character", note: "ordinary hyphen only" },
      { kind: "trap", checkId: "exec.suspicious_field", needle: "PAGE" },
      { kind: "trap", checkId: "exec.unfilled_placeholder", note: "no insert tokens" },
      { kind: "trap", checkId: "party.header_counterparty_mismatch", note: "header names the Company" },
      { kind: "not_a_defect", checkId: "exec.unresolved_comment", note: "no comments part — suppressed, not a hit" },
    ],
  },
  {
    id: "sha-12-placeholder-exceptions",
    title: "Bracketed defined term is not a placeholder",
    paragraphs: wrap([
      "1. Definitions",
      '"Person" means any individual or company.',
      "2. Parties",
      "The [Company] shall deliver monthly MIS to the Investor.",
      "3. Amount still open",
      "The fee is [insert amount] on closing.",
      "4. Term",
      "This Agreement continues as set out in this Clause 4.",
    ]),
    labels: [
      { kind: "must_find", checkId: "exec.unfilled_placeholder", needle: "insert amount" },
      { kind: "trap", checkId: "exec.unfilled_placeholder", needle: "[Company]", note: "bracketed defined term" },
    ],
  },
  {
    id: "sha-13-mixed-loci",
    title: "Second positive loci for gap, unused and xref",
    paragraphs: wrap([
      "1. Definitions",
      '"Escrow" means the escrow arrangement in this Agreement.',
      '"Person" means any individual or company.',
      "2. Term",
      "This Agreement continues until Clause 80.4 applies.",
      "4. Reserved Matters",
      "The Company shall not issue Securities without Investor Majority consent.",
    ]),
    labels: [
      { kind: "must_find", checkId: "structure.broken_xref", needle: "80.4" },
      { kind: "must_find", checkId: "structure.numbering_gap", needle: "3" },
      { kind: "must_find", checkId: "defterm.unused", needle: "Escrow" },
      { kind: "trap", checkId: "structure.broken_xref", needle: "Clause 2", note: "no Clause 2 self-ref here; 2 exists so unused 2-ref would be quiet" },
    ],
  },
];

export const CORPUS_SIZE = CORPUS.length;
