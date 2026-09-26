import { buildDocx } from "./docx.ts";

/** Synthetic SHA used as the in-app fixture. Contains labelled Proof loci. */
export function sampleShaParagraphs(): string[] {
  return [
    "SHAREHOLDERS AGREEMENT",
    "This Shareholders Agreement (the \"Agreement\") is made on [insert date] at Bengaluru.",
    "BETWEEN",
    "Acme Technologies Private Limited, a company incorporated under the Companies Act, 2013, with CIN U72900KA2018PTC012345, having its registered office at [PAN ABCDE1234F is on file] (the \"Company\");",
    "AND",
    "Northstar Capital Partners LLP (the \"Investor\");",
    "AND",
    "Rohan Mehta (the \"Promoter\").",
    "The Company may be reached at ops@acme-example.com for notices under this Agreement.",
    "WHEREAS the Investor has agreed to subscribe to securities of the Company on the terms of this Agreement.",
    "1. Definitions and Interpretation",
    "\"Affiliate\" means, in relation to a Person, any other Person that directly or indirectly controls, is controlled by, or is under common control with, such Person.",
    "\"Business Plan\" means the annual business plan of the Company.",
    "\"Person\" means any individual, company, or other legal entity.",
    "\"Transfer\" means any sale, assignment, or other disposition of Securities.",
    "2. Effectiveness and Term",
    "This Agreement shall come into effect on the Effective Date and shall continue until terminated in accordance with Clause 99.1.",
    "3. Share Capital",
    "The subscription amount is INR 10,000,000 (Rupees One Crore only).",
    "4. Board and Governance",
    "The Board shall comprise five Directors, including one Investor Director. Quorum at a Board meeting shall require the Investor Director.",
    "5. Transfer of Securities",
    "No Shareholder shall Transfer any Securities except as permitted under this Clause 5. A Promoter lock-in applies for three years.",
    "6. Reserved Matters",
    "The Company shall not, without Investor Majority consent, amend the Articles or issue Securities.",
    "7. Information Rights",
    "The Company shall deliver monthly MIS to the Investor.",
    "8. Termination",
    "This Agreement may be terminated by written notice in the circumstances set out in this Clause 8.",
    "9. Governing Law",
    "This Agreement is governed by the laws of India. Courts at Bengaluru have exclusive jurisdiction.",
    "10. Notices",
    "Any notice shall be sent to the addresses set out in Schedule A.",
    "IN WITNESS WHEREOF the Parties have executed this Agreement.",
    "Signed for and on behalf of the Company",
    "Authorised Signatory",
    "Name: __________________",
    "Schedule A Notices",
    "Company: Acme Technologies Private Limited",
    "Investor: Northstar Capital Partners LLP",
  ];
}

export async function sampleShaDocx(): Promise<Buffer> {
  const paras = sampleShaParagraphs();
  // Embed a zero-width space inside a legal token for exec.hidden_character.
  paras[11] = paras[11].replace("Affiliate", "Affili\u200bate");
  return buildDocx(paras, { pages: 3 });
}

export function sampleShaLabels() {
  return {
    must_find: [
      "structure.broken_xref",
      "exec.unfilled_placeholder",
      "exec.hidden_character",
      "defterm.unused",
      "exec.signature_block_mismatch",
    ],
    trap: ["Affiliate as unused — the hidden-character token should not also fire unused on the clean spelling"],
    not_a_defect: ["Clause 5 internal reference should resolve"],
  };
}
