# Agmt Slice 1

Proof golden-corpus runner. Review, Mail, redline, chat and lineage stay out of scope.

## What landed

- 13 labelled synthetic SHAs under `src/lib/agmt/corpus/`.
- Each fixture carries `must_find`, `trap` and/or `not_a_defect` loci against a v1 check ID.
- CI gate: a missed must-find, a trap fire or a not-a-defect regression fails the change.
- Every one of the twelve v1 checks has a positive fixture and an exception fixture.
- Registry SHA is pinned. A check version bump fails until the corpus is replayed.
- “Not a defect” remains a human-review ticket. It does not suppress the check.
- Proof hits show `checkId · vN`. Coverage shows version. Source capability is listed on the result.

## Corpus

| id | Must-find | Quiet on purpose |
|---|---|---|
| sha-01-xref-placeholder | broken xref 99.1; `[insert date]` | Clause 4 / 5 exist |
| sha-02-unused-hidden | unused Business Plan; zero-width space | used Affiliate; ordinary hyphen |
| sha-03-signature-gap | missing Investor block | Company block present |
| sha-04-numbering-gap | missing 3 | valid Clause 2 xref |
| sha-05-duplicate-number | two body 3s | schedule 1 ≠ body 1 |
| sha-06-amount-table | subscription amount clash | coincidental / matching figures |
| sha-07-header-party | Helios in the header | — |
| sha-08-fields | MERGEFIELD | PAGE |
| sha-09-undefined-candidate | Securities | Board / India stopwords |
| sha-10-unresolved-comment | open comment | — |
| sha-11-clean-exceptions | — | used terms, consecutive numbering, all signatures, matching header, PAGE, no comments |
| sha-12-placeholder-exceptions | `[insert amount]` | `[Company]` |
| sha-13-mixed-loci | xref 80.4; gap 3; unused Escrow | — |

## How to replay

`npm run test:proof`

A check ID/version, recogniser or exception change that does not replay this set must not merge.

## Explicitly unfinished

- Slices 3–6 (Review, exports, Mail, v2 lineage).
