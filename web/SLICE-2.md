# Agmt Slice 2

DocumentIndex quality. Review, Mail, redline, chat and lineage stay out of scope.

## What landed

- Golden set of labelled SHAs for index quality (`src/lib/agmt/corpus/index-quality-fixtures.ts`).
- Weights and thresholds are pinned under `iq-v2` and replayed in CI.
- Every non-blank line still owns exactly one text-owning leaf; headers, table cells and signature text are owned.
- Clause body inherits the current heading so a real SHA is classified, not a sea of unclassified paragraphs.
- Schedule-local defined terms do not overwrite or silently qualify the body term of the same name.
- Unreadable / no usable outline **blocks Review**. Material unclassified **does not refuse** the file; it sets `incomplete_source`.
- Proof shows a source-quality banner (classified share, unclassified volume, components), namespaced definitions, signature inventory, and the Review gate reason.

## Golden set

| id | Label |
|---|---|
| idx-01-clean-sha | high quality, usable outline, Review eligible (Slice 3) |
| idx-02-unclassified-header | usable outline + material unclassified header → incomplete_source, not refused |
| idx-03-no-outline | unreadable, Review blocked |
| idx-04-schedule-local-term | body Affiliate and schedule Affiliate both exist; uses stay in their namespace |
| idx-05-headers-tables-sigs | header, table, signature leaves owned |
| idx-06-numbering-gaps | usable outline despite numbering gaps |

## How to replay

`npm run test:proof`

## Explicitly unfinished

- Slices 3–6 (SHA Review, exports, Mail, v2 lineage).
