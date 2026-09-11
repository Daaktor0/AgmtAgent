# Beta evaluation — first-run restoration and adjudication

The original 20 documents were labelled before execution. After the first run
flagged structural comments on three documents labelled clean (and one dirty
document with an extra comment), those three documents were rewritten. That
rewritten set is **not** held-out evidence.

This file preserves the first-run population, labels, findings and results.
Engine changes after this record are evaluated on fresh, independently labelled
cases in `web/src/lib/agmt/corpus/beta-eval/fresh-cases.test.ts`.

Original user planted document: **not reproduced**.

## First-run result (frozen)

20 documents, 11 labelled clean, 9 labelled dirty. No blocked unsafe
corrections. Extra comments (scored as false positives against the original
labels):

| Document | Rule | Quote |
|---|---|---|
| `01_agreement_clean_asset_sale` | `definitions.undefined_use` | Reference Amount |
| `01_agreement_clean_asset_sale` | `references.missing_target` | Schedule 1 |
| `01_agreement_clean_asset_sale` | `references.missing_target` | Schedule 2 |
| `03_amendment_clean_clause` | `references.duplicate_number` | 4.1 |
| `03_amendment_clean_clause` | `definitions.undefined_use` | Payment Date |
| `17_agreement_placeholder` | `references.missing_target` | Clause 8 |

Dirty planted findings (`liason`, `seperate`, `,,`, `the the`, `Service Levels`,
`[TBD]`, quoted `concensus`, repeated `guage`, words/figures mismatch) all
matched. No false negatives on labelled dirty spans.

## Disputed findings

### 1. `01` — “the Reference Amount stated in Schedule 1”

**Synthetic text.** Asset sale extract. Completion Date is defined. Then:
“The Purchase Price is 3.14 percent of the Reference Amount stated in Schedule 1.”

**Why labelled clean.** Title-case commercial English pointing at a schedule
figure, alongside decimal / URL / email / e.g. traps. Title case was not treated
as a planted undefined-term error.

**Rule evidence / comment.** Title-case run after a determiner (`the`), no
matching quoted definition. Comment: review question that “Reference Amount” is
written like a defined term but no matching definition was found.

**Adjudication.** **False positive** against the original label. Title case plus
a determiner does not establish an undefined term. The same sentence locates the
amount in Schedule 1. This is not a confirmed drafting defect in the extract.

### 2. `01` — “Schedule 1” and “Schedule 2”

**Synthetic text.** “…stated in Schedule 1.” and “…the form attached as Schedule 2.”
No schedule headings exist in this short file.

**Why labelled clean.** A short extract may point at schedules that live with
the rest of the agreement, or outside this file.

**Rule evidence / comment.** Parsed as internal schedule references; zero
matching headings in the checked numbering scope. Comment asks the reader to
confirm the reference.

**Adjudication.** **Ambiguity.** If this file is the entire agreement, missing
schedule text is a genuine drafting gap. If it is an extract, or the schedules
are a separate instrument, the comments are false positives. A reference may
legitimately point outside the file. Original clean label is preserved. These
remain first-run false positives. `references.missing_target` is **not**
disabled: complete agreements that cite a missing internal schedule should still
be commented. Testers should expect comments on extracts that cite schedules
absent from the file.

### 3. `03` — duplicate “4.1”

**Synthetic text.** “Clause 4.1 of the Original Agreement is deleted and
replaced with the following.” then “4.1 The Investor shall subscribe…”

**Why labelled clean.** Standard amendment restatement. The two “4.1”s are a
citation of the original clause and the replacement numbering, not two operative
clauses of this deed.

**Rule evidence / comment.** The citation was indexed as a numbering label
because a paragraph starting “Clause 4.1 of …” matched the numbering regex.
Comment: clause number 4.1 appears more than once.

**Adjudication.** **False positive.** Engine bug, not a labelling mistake.
Numbering no longer treats “Clause/Section/Article N of …” as a document number.
Evaluated on a fresh 9.3 restatement, not on this held-out document.

### 4. `03` — “the Payment Date”

**Synthetic text.** Restated clause: “…subscribe for the Shares in cash on the
Payment Date.” No definition in this deed. The deed is an amendment of the
Original Agreement.

**Why labelled clean.** Payment Date is a term of the original agreement, not a
term this deed was required to define.

**Rule evidence / comment.** Title-case run after `the`, no local definition.
Same review-question comment as (1).

**Adjudication.** **Lawyer judgment.** Proposed conclusion: **false positive in
amendment context**; title case plus a determiner is not enough, and amendments
commonly use original-agreement terms without restating definitions. If this
were a standalone agreement, some lawyers would still want a definition. Original
clean label is preserved. `definitions.undefined_use` stays enabled (packed
promotion still passes). Testers should treat these comments as review questions,
not confirmed errors.

### 5. `17` — “Clause 8” with `[TBD]`

**Synthetic text.** “The Seller shall deliver the notice under Clause 8 by [TBD].”
Two-paragraph fragment. Labelled dirty only for `[TBD]`.

**Why labelled clean for the clause.** The planted error was the placeholder.
Clause 8 was ordinary cross-reference wording in a fragment.

**Rule evidence / comment.** No numbered clause 8 in the file. Combined with the
placeholder comment.

**Adjudication.** **False positive** against the original label, and combined-rule
noise. A two-paragraph fragment is not a complete numbering scope in any
practical sense, even if the parser marked the inventory complete. A reference
may point outside. `references.missing_target` is not disabled for complete
agreements. Testers should expect missing-clause comments on extracts.

## Lawyer table (proposed conclusions)

| Doc | Span | Original label | Proposed conclusion |
|---|---|---|---|
| 01 | the Reference Amount stated in Schedule 1 | clean trap | False positive. Title case ≠ undefined term; amount is located in a schedule. |
| 01 | Schedule 1 / Schedule 2 | clean extract | Ambiguity. FP if extract/external; genuine gap if this file is the whole agreement. Keep original clean label. |
| 03 | Clause 4.1 … / 4.1 The Investor… | clean amendment restatement | False positive. Citation was indexed as numbering. |
| 03 | the Payment Date | clean original-agreement term | False positive in amendment context; ambiguity if read as a standalone agreement. |
| 17 | under Clause 8 by [TBD] | dirty only for [TBD] | False positive / combined-rule noise on a fragment. |

No original label was rewritten to “dirty” solely because a rule fired.

## Context increment (missing vs unverifiable)

`references.missing_target` and `definitions.undefined_use` stay enabled. Completeness is not inferred from document length and no document-type questionnaire was added.

Engine changes after the first-run record, evaluated on fresh cases:

- A term expressly inherited (`as defined in`, `has the meaning given in`, bulk incorporation of the Original/Principal/Existing Agreement, or a restated original clause) is not flagged as undefined merely because this file omits the definition.
- A citation of another named instrument remains external.
- Where no numbered clause or schedule heading appears in the checked text, absence is a qualified review point, not a proven drafting error.
- Where other clauses or schedule headings exist and this one does not, the comment remains a specific internal miss.
- The previous schedule-locator skip for undefined-use was withdrawn. “Reference Amount stated in Schedule 1” does not prove the term is defined and does not prove Schedule 1 exists.

Held-out re-run against original labels after this increment: `Payment Date` is no longer a false positive. Remaining unplanted comments: `Reference Amount` (review question / ambiguity), `Schedule 1` / `Schedule 2` (qualified unverifiable), `Clause 8` on the placeholder fragment (qualified unverifiable). These stay **false positives / noise** in `context-increment-results.json` (`definitions.undefined_use` fp 1; `references.missing_target` fp 3). Qualified or cautious comment phrasing does **not** convert them to true positives. Planted dirty findings still match. No missed planted findings. Packed PEE-10/11 promotion results do not override these observations.

## Rewritten documents

The three post-observation rewrites live in
`web/src/lib/agmt/corpus/beta-eval/rewritten-regression.ts`. They are
development/regression cases only.
