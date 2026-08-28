import type { BuildDocxOpts } from "../docx.ts";
import type { SourceQuality } from "../types.ts";
import type { ReviewGate } from "../review-gate.ts";

export type IndexFixtureExpect = {
  usableOutline: boolean;
  materialUnclassified: boolean;
  sourceQuality: SourceQuality | SourceQuality[];
  classifiedShareMin?: number;
  classifiedShareMax?: number;
  refused: false;
  reviewCode: ReviewGate["code"] | ReviewGate["code"][];
  reviewCoverage: ReviewGate["coverage"];
};

export type IndexFixture = {
  id: string;
  title: string;
  paragraphs: string[];
  docx?: BuildDocxOpts;
  expect: IndexFixtureExpect;
  /** Extra assertions beyond quality labels. */
  notes?: string;
};

const SIGS = [
  "Signed for and on behalf of the Company",
  "Authorised Signatory",
  "Signed for and on behalf of the Investor",
  "Authorised Signatory",
];

function parties(): string[] {
  return [
    "SHAREHOLDERS AGREEMENT",
    'This Shareholders Agreement (the "Agreement") is made on 1 January 2026 at Bengaluru.',
    "BETWEEN",
    'Acme Technologies Private Limited, a company incorporated under the Companies Act, 2013 (the "Company");',
    "AND",
    'Northstar Capital Partners LLP (the "Investor");',
  ];
}

function wrap(clauses: string[], schedule?: string[]): string[] {
  return [...parties(), ...clauses, "IN WITNESS WHEREOF the Parties have executed this Agreement.", ...SIGS, ...(schedule ?? [])];
}

const CLEAN_CLAUSES = [
  "1. Definitions and Interpretation",
  '"Affiliate" means any Person that controls the Company.',
  '"Person" means any individual or company.',
  '"Securities" means equity shares of the Company.',
  "2. Effectiveness and Term",
  "This Agreement shall come into effect on the Effective Date and shall continue until terminated in accordance with Clause 8.",
  "3. Share Capital",
  "The subscription amount is INR 10,000,000.",
  "4. Transfer of Securities",
  "No Shareholder shall Transfer any Securities except as permitted under this Clause 4.",
  "5. Board and Governance",
  "The Board shall comprise five Directors, including one Investor Director.",
  "6. Information Rights",
  "The Company shall deliver monthly MIS to the Investor.",
  "7. Governing Law",
  "This Agreement is governed by the laws of India.",
  "8. Notices",
  "Any notice shall be sent as set out in this Clause 8.",
];

/** Header blob long enough to trip the 2,000-character unclassified leaf rule. */
const HUGE_HEADER = `Helios Holdings Confidential — ${"draft watermark alignment block ".repeat(90)}`;

export const INDEX_CORPUS: IndexFixture[] = [
  {
    id: "idx-01-clean-sha",
    title: "Numbered SHA with parties, definitions, signatures",
    paragraphs: wrap(CLEAN_CLAUSES),
    expect: {
      usableOutline: true,
      materialUnclassified: false,
      sourceQuality: "high",
      classifiedShareMin: 0.7,
      refused: false,
      reviewCode: "not_shipped",
      reviewCoverage: "full",
    },
  },
  {
    id: "idx-02-unclassified-header",
    title: "Usable outline plus a material unclassified header leaf",
    paragraphs: wrap(CLEAN_CLAUSES),
    docx: { pages: 3, header: HUGE_HEADER },
    expect: {
      usableOutline: true,
      materialUnclassified: true,
      sourceQuality: ["medium", "low", "high"],
      refused: false,
      reviewCode: "incomplete_source",
      reviewCoverage: "incomplete_source",
    },
    notes: "Material unclassified must not refuse ingest; Review is incomplete_source.",
  },
  {
    id: "idx-03-no-outline",
    title: "Prose with no numbered provisions",
    paragraphs: [
      "This is an internal note about a possible investment.",
      "The parties have discussed valuation informally.",
      "Nothing here is a clause, schedule, annex or recital heading.",
      "Please consider the commercial terms over email.",
    ],
    expect: {
      usableOutline: false,
      materialUnclassified: true,
      sourceQuality: "unreadable",
      classifiedShareMax: 0.5,
      refused: false,
      reviewCode: "no_usable_outline",
      reviewCoverage: "blocked",
    },
  },
  {
    id: "idx-04-schedule-local-term",
    title: "Schedule-local Affiliate does not overwrite the body term",
    paragraphs: wrap(
      [
        "1. Definitions and Interpretation",
        '"Affiliate" means any Person that controls the Company.',
        '"Person" means any individual or company.',
        "2. Transfers",
        "An Affiliate of the Investor may receive Securities.",
        "3. Notices",
        "Notices follow this Clause 3.",
        "4. Governing Law",
        "This Agreement is governed by the laws of India.",
      ],
      [
        "SCHEDULE 1 Affiliate list",
        '"Affiliate" means Helios Holdings Private Limited for the purpose of this Schedule 1 only.',
        "An Affiliate listed here is a scheduled name, not the body control test.",
      ],
    ),
    expect: {
      usableOutline: true,
      materialUnclassified: false,
      sourceQuality: ["high", "medium"],
      refused: false,
      reviewCode: "not_shipped",
      reviewCoverage: "full",
    },
  },
  {
    id: "idx-05-headers-tables-sigs",
    title: "Header, table cells and signature text are owned leaves",
    paragraphs: wrap([
      "1. Definitions",
      '"Company" means Acme Technologies Private Limited.',
      "2. Economics",
      "The subscription amount is set out below.",
      "3. Notices",
      "Notices follow this Clause 3.",
      "4. Governing Law",
      "This Agreement is governed by the laws of India.",
    ]),
    docx: {
      pages: 3,
      header: "Acme Technologies Private Limited — execution copy",
      tableRows: [["Subscription Amount", "INR 10,000,000"]],
    },
    expect: {
      usableOutline: true,
      materialUnclassified: false,
      sourceQuality: ["high", "medium"],
      refused: false,
      reviewCode: "not_shipped",
      reviewCoverage: "full",
    },
  },
  {
    id: "idx-06-numbering-gaps",
    title: "Usable outline with numbering gaps — still not unreadable",
    paragraphs: wrap([
      "1. Definitions",
      '"Company" means Acme Technologies Private Limited.',
      "2. Term",
      "This Agreement continues as set out in this Clause 2.",
      "5. Notices",
      "Notices follow this Clause 5.",
      "8. Governing Law",
      "This Agreement is governed by the laws of India.",
    ]),
    expect: {
      usableOutline: true,
      materialUnclassified: false,
      sourceQuality: ["high", "medium", "low"],
      refused: false,
      reviewCode: ["not_shipped", "incomplete_source"],
      reviewCoverage: "full",
    },
  },
];
