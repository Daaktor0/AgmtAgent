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

## Category-form retrieval (do this within 7 days)

Structured events live in Cloudflare Workers Logs as `PROOF_BETA_FEEDBACK` (v2): `category`, `reasonCode`, optional consented `appVersion`/`browser`. Retention **7 days**. 100% sampling. No free text, no `note`, no document text. This table is the place for written notes from the invitation channel.

Exact steps:

1. Open https://dash.cloudflare.com/e6bcd0e97f918006b90e65ee06b288fd
2. **Workers & Pages** → **`agmt`** → **Observability**.
3. Set the time range (max 7 days).
4. Filter `type = PROOF_BETA_FEEDBACK` or search `PROOF_BETA_FEEDBACK`.
5. Read `category`, `reasonCode`, and (if present) `appVersion` / `browser`. Attribute `appVersion=proof-local-supervised-2026-09-11` to this freeze.
6. Copy only those closed fields into the table above. Do not paste document text.

Logs URL: https://dash.cloudflare.com/e6bcd0e97f918006b90e65ee06b288fd/workers/services/view/agmt/production/observability

`wrangler tail agmt` shows new events only while it is running. It is not a substitute for the 7-day dashboard query.

Do not commit user documents or excerpts to Git, CI or these logs.
