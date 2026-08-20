"""Synthetic Word-like documents for the golden vertical slice.

These intentionally contain known issues. Agmt must discover them through
outline, read, definition, search and overlap — not a hard-coded answer.
"""
from __future__ import annotations

# 1. Duplicate indemnity / double-recovery positive case.
DOUBLE_RECOVERY = [
    'This Shareholders\' Agreement is made between Helios Pvt Ltd (the "Company") and Kestrel Fund (the "Investor").',
    '1. DEFINITIONS',
    '"Losses" means all losses, liabilities, damages, costs and expenses.',
    '2. BUSINESS',
    '2.1 The Company shall carry on the business.',
    '5. INDEMNITY',
    '5.1 The Company shall indemnify the Investor against all Losses arising out of a breach of this Agreement.',
    '5.2 The indemnity in Clause 5.1 is the Investor\'s exclusive monetary remedy for a breach, except as expressly provided.',
    '5.3 Where the Company makes a payment to the Investor under Clause 5.1, the amount payable shall be grossed up by reference to the Investor\'s shareholding percentage in the Company, and in addition the Investor shall be deemed to have suffered a direct loss equal to its proportionate share of the loss suffered by the Company.',
    '6. RESERVED MATTERS',
    '6.1 The Company shall not incur indebtedness without Investor consent.',
    '9. PAYMENT',
    '9.1 Payments under this Agreement shall be made in INR.',
]

# Same as DOUBLE_RECOVERY plus an existing no-double-recovery limb.
NO_DOUBLE_ALREADY = DOUBLE_RECOVERY[:-1] + [
    '9.10 Without duplication, the Investor shall not recover twice in respect of the same Loss.',
    '9.1 Payments under this Agreement shall be made in INR.',
]

# Overlapping but distinct: price adjustment vs indemnity, different measure.
DISTINCT_REMEDIES = [
    '1. DEFINITIONS',
    '"Losses" means damages awarded by a court.',
    '5. INDEMNITY',
    '5.1 The Company shall indemnify the Investor against Losses arising from a Tax Claim.',
    '7. PRICE ADJUSTMENT',
    '7.1 If working capital is less than the locked-box amount, the Seller shall pay the shortfall as a price adjustment, which is not a Loss.',
]

# Clean: selected language is a covenant with no second recovery route.
NO_ISSUE = [
    '1. DEFINITIONS',
    '"Losses" means all losses and liabilities.',
    '5. INDEMNITY',
    '5.1 The Company shall indemnify the Investor against Losses arising out of a breach.',
    '7. INFORMATION',
    '7.1 The Company shall deliver monthly management accounts to the Investor.',
]

# Two indemnity headings — ambiguity.
AMBIGUOUS_INDEMNITY = [
    '1. DEFINITIONS',
    '"Losses" means all losses.',
    '9.1 General Indemnity',
    '9.1 The Promoters shall indemnify the Investor against Losses from a Title Claim.',
    '9.10 Tax Indemnity',
    '9.10 The Company shall indemnify the Investor against Losses from a Tax Claim.',
    '7.3 The Investor may recover its costs of enforcement in addition to any other remedy.',
]

# Clause renamed — heading no longer says indemnity.
RENAMED = [
    '1. DEFINITIONS',
    '"Losses" means all losses.',
    '5. HOLD HARMLESS',
    '5.1 The Company shall hold the Investor harmless from Losses.',
    '7.3 The Investor may recover its costs in addition to any other remedy.',
]

# Duplicate identical wording in two clauses.
DUPLICATE_TEXT = [
    '1. DEFINITIONS',
    '"Losses" means all losses.',
    '5. INDEMNITY',
    '5.1 The Company shall indemnify the Investor against Losses.',
    '7.1 The prior written consent of the Investor is required for any transfer.',
    '7.3 The prior written consent of the Investor is required for any transfer.',
]

# Table-cell shaped paragraphs (ingest flattens cells to paragraphs).
TABLE_CELL = [
    '5. INDEMNITY',
    '5.1 The Company shall indemnify the Investor against Losses.',
    'Cap | Amount | Notes',
    'General | INR 1 | in addition the Investor shall recover the same Loss again',
]

# Multi-paragraph selection.
MULTI_PARA = DOUBLE_RECOVERY

# Footnote/header stories.
FOOTNOTE_INDEMNITY = {
    "paragraphs": [
        '1. OPERATIVE',
        '1.1 The Investor subscribes for the Shares.',
        '7.3 The Investor may recover fees in addition to other amounts.',
    ],
    "stories": {
        "footnote": ['The Company shall indemnify the Investor against all Losses.'],
        "header": ['INDEMNITY — see footnote 1'],
        "footer": ['Confidential'],
    },
}

SELECTION_5_3 = (
    "Where the Company makes a payment to the Investor under Clause 5.1, "
    "the amount payable shall be grossed up by reference to the Investor's "
    "shareholding percentage in the Company, and in addition the Investor "
    "shall be deemed to have suffered a direct loss equal to its proportionate "
    "share of the loss suffered by the Company."
)

GOLDEN_INSTRUCTION = (
    "Check this language against the indemnity clause for any double-recovery issue."
)
