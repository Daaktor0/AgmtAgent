# Supervised 3–5 lawyer trial — freeze pack

Invitations are **not** sent by this freeze. The founder sends them.

| Item | Value |
|---|---|
| Freeze id | `proof-local-supervised-2026-09-11` |
| Serving commit | `64d88f8` |
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
- Original planted user document still untested.
- Authentication remains separate and broken for sign-in email; local Proof does not require it.
- Remaining unplanted review questions on the held-out synthetics: `Reference Amount`; qualified `Schedule 1`/`Schedule 2`; qualified `Clause 8` on a fragment. These are not treated as proven errors.
- Packed promotion results do not override those observations.

## Feedback storage

| Channel | What | Where | Retention | Receipt |
|---|---|---|---|---|
| `/proof/feedback` | Closed category, optional reason code, optional consented app version/browser | Workers Logs `PROOF_BETA_FEEDBACK` v2 | 7 days, 100% sample | Verified on the previous freeze; extra keys including `note` still rejected |
| Invitation contact | Written observations | Founder’s existing channel | Whatever that channel already uses | Founder-managed; not observability |

No document text, filenames, excerpts or free-text notes in category logs.
