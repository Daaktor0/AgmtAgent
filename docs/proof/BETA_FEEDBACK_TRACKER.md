# Supervised trial — written observation tracker

Use this for notes testers send through the invitation channel. Do not copy document text into the category-feedback logs.

Freeze: `proof-local-supervised-2026-09-11`. Category form: https://app.agmt.legal/proof/feedback. Serving commit: see `BETA_SUPERVISED_TRIAL.md`.

| Date | Tester | Synthetic / non-confidential? | Word review done? | Category form used? | Category (if any) | Reason code (if any) | Written observation (no confidential clauses) | Follow-up |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |
| | | | | | | | | |
| | | | | | | | | |
| | | | | | | | | |
| | | | | | | | | |

## How to fill

- **Category form used?** Yes only if they pressed **Send category** on `/proof/feedback`.
- **Category / reason code** are the closed enums from that form. Leave blank if they only emailed you.
- **Written observation** is your paraphrase of their email. Do not paste clauses, filenames of client files, or excerpts from live matters.
- If they still have the original small planted Word file, record that separately and keep it off this table’s observation column.

## Category-form retrieval

Structured events live in Cloudflare Workers Logs as `PROOF_BETA_FEEDBACK` (v2): `category`, `reasonCode`, optional consented `appVersion`/`browser`. Retention 7 days. 100% sampling. No free text. This table is the place for written notes.
