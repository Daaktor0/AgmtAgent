# Supervised 3–5 lawyer trial — freeze pack

Invitations are **not** sent by this freeze. The founder sends them.

| Item | Value |
|---|---|
| Freeze id | `proof-local-supervised-2026-09-11` |
| Serving git commit | `a17f207859cf86505a4c3f18b1a14f78e890c682` (docs freeze record; engine `64d88f8`) |
| Serving Worker version | `c038acdd-896a-4703-9330-e85dbbdbc544` (100% traffic, confirmed 2026-09-11) |
| Live assets | `/assets/proof.worker-tmzZ0Dfo.js`; feedback JS `proof-local-supervised-2026-09-11` |
| Public journey | https://app.agmt.legal/proof (anonymous; no account required) |
| Help | https://app.agmt.legal/proof/help |
| Category feedback | https://app.agmt.legal/proof/feedback |
| Tester brief | `docs/proof/BETA_TESTER_BRIEF.md` |
| Invitation draft | `docs/proof/BETA_INVITATION_DRAFT.md` |
| Written-observation tracker | `docs/proof/BETA_FEEDBACK_TRACKER.md` |
| First-run eval | `web/src/lib/agmt/corpus/beta-eval/first-run-results.json` (unchanged) |
| This increment | `web/src/lib/agmt/corpus/beta-eval/context-increment-results.json` |

## Supported browsers and documents

- Current desktop Chromium (Chrome, Edge, or equivalent). Firefox, Safari and iOS are untested.
- Native unencrypted `.docx` only.
- Start testers on synthetic or non-confidential files. Review in Word with All Markup.

## Known limitations (honest, not a blocker list for every roadmap item)

- Not a grammar checker; not a legal review; not perfect accuracy.
- Header comments withheld; footers, footnotes and endnotes preserved and not checked.
- Fields, text boxes, modern review markup, macros, encryption, IRM, Strict OOXML, `.doc`/`.docm`/`.dotx`, PDF out of scope.
- Original planted user document still untested until the actual example is supplied.
- Authentication remains separate and broken for sign-in email; local Proof does not require it.
- Remaining unplanted review questions on the held-out synthetics: `Reference Amount`; qualified `Schedule 1`/`Schedule 2`; qualified `Clause 8` on a fragment. These remain **false positives / noise** against the original clean labels. Qualified phrasing does not convert them to true positives.
- Packed promotion results do not override those observations.

## Feedback storage

| Channel | What | Where | Retention | Receipt |
|---|---|---|---|---|
| `/proof/feedback` | Closed category, optional reason code, optional consented app version/browser | Workers Logs `PROOF_BETA_FEEDBACK` v2 | 7 days, 100% sample | Verified on the previous freeze; extra keys including `note` still rejected |
| Invitation contact | Written observations | Founder’s existing channel | Whatever that channel already uses | Founder-managed; not observability |

No document text, filenames, excerpts or free-text notes in category logs. Do not commit user documents or excerpts to Git, CI or logs. Synthetic regression cases only.

## How to retrieve category feedback (7-day retention)

Workers Logs keep `PROOF_BETA_FEEDBACK` events for **7 days**, sampled at 100%. After that they expire. Written notes do not appear here; testers send those to you on the invitation channel.

### Cloudflare dashboard (historical, last 7 days)

1. Open the Cloudflare dashboard for account **Dexters Lab**: https://dash.cloudflare.com/e6bcd0e97f918006b90e65ee06b288fd
2. Go to **Workers & Pages** → Worker **`agmt`**.
3. Open **Observability**.
4. Set the time range to cover the trial (maximum **7 days**).
5. Search or filter for `PROOF_BETA_FEEDBACK` (field `type` equals `PROOF_BETA_FEEDBACK`).
6. Each event has: `category`, `reasonCode`, `includeTechnical`, optional `appVersion` / `browser` (only if the tester ticked the box), `version` (`proof-beta-feedback-v2`), `at`.
7. There is no `note` field and no document text. Extra keys are rejected at POST.

Direct logs URL: https://dash.cloudflare.com/e6bcd0e97f918006b90e65ee06b288fd/workers/services/view/agmt/production/observability

`wrangler tail agmt` is **live only**. It does not show past events. Use the dashboard for anything already sent.

Retrieval was confirmed on this freeze: existing events include `category=incorrect_finding` and consented `appVersion=proof-local-supervised-2026-09-11`.

## How tester reports will be handled

- Reproduce each issue before changing code. Trace extraction → detection → exclusions → anchoring → UI → export.
- Keep the original missed-error report open until its actual example is tested.
- For each accepted fix: run the relevant regressions, verify the production download, repeat Word checks if export or structure changed, and record the new serving version.
- Do not disable `references.missing_target` or `definitions.undefined_use` wholesale.
- Authentication work stays separate. No invitations are sent by this freeze.
