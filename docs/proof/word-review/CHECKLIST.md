# Word verification checklist (synthetic only)

These files are generated from the launch fixtures. They are not client
documents and they are not a Microsoft Word fidelity receipt until a named
reviewer completes this list on a dated Word build.

Generate or refresh the pairs:

```
cd web
node --experimental-strip-types scripts/proof-word-review.ts
```

Files land in this directory as `<fixture>.docx` (source) and
`<fixture>_Proofread.docx` (output).

## Reviewer

- Name:
- OS / Word build:
- Date:
- Commit SHA:

## For each pair

Open the **source** first, then the **_Proofread** copy. Use All Markup.

| Fixture | Opens without repair | All Markup shows Agmt Proof revisions/comments | Accept/reject Agmt changes only | Existing comments/revisions preserved | Save / reopen still opens | Layout not obviously destroyed | Notes |
|---|---|---|---|---|---|---|---|
| body | | | | n/a | | | |
| split_runs | | | | n/a | | | mixed-format `recieve` may be a comment, not a tracked change |
| table | | | | n/a | | | |
| prior_review | | | | | | | prior comment and ins/del must remain |
| party_name | | | | n/a | | | `Recieve Private Limited` must **not** be “corrected” |

## Must hold

- Author of new revisions/comments is `Agmt Proof` / `AP`.
- Do not run Word’s “Accept all revisions” on the output and treat that as a product test.
- A schema-valid Open XML SDK result is **not** a substitute for this checklist.
- `employment_typo_split` / mixed-run `recieve` stays labelled: tracked replace expected, comment may be the actual output action.

## Result

- Pass / Fail / Blocked:
- Blocking Word build issues:
