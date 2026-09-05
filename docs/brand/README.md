# Agmt — brand and interface system

> **Proof scope supersession — 5 September 2026:** `docs/AGMT_PLATFORM_PROOF_SPEC.md` (repository root) controls the temporary Proof release: Agmt platform, upload → tracked/commented DOCX, immutable two-hour content retention, verified accounts and zero LLM calls. Mandatory Matter/mandate/map steps, Review/Mail, historical vault migration, document backups and legal holds are not prerequisites for this path. Preserve unrelated security and design rules. Current tasks and evidence are in `docs/AGMT_PROOF_IMPLEMENTATION_STATUS.md`. Historical requirements below remain context, not the current Proof launch checklist.

The design reference for both front ends: `site/` (marketing) and `web/` (the
product). It is the source of truth for the wordmark, the colour tokens, the
type scale, component anatomy, and the seven-step user flow.

| File | What it is |
|---|---|
| `Agmt-brand-and-UI-system.pdf` | Read-only reference. Open this first. |
| `canvas/Agmt.dc.html` | The editable canvas the PDF was exported from. |
| `canvas/support.js` | Generated canvas runtime. Do not edit; it must sit beside the `.dc.html` for the file to open. |
| `canvas/.thumbnail` | Canvas preview image, kept so the export stays intact. |

Open the canvas by pointing a browser at `canvas/Agmt.dc.html`. It pulls
Source Serif 4 and Archivo from Google Fonts, so the type is wrong offline.

## The system in brief

**Colour.** Paper `#F4EFE6` · paper sunk `#EDE7DA` · ink `#1C1917` · hairline
`#D9D2C4` · stone `#6E7478` · oxblood `#6B2B2B` · oxblood pressed `#571F1F`.

Oxblood is the *only* accent — primary action, severity-critical, wordmark
underline. Stone carries mechanical Proof output so that Proof and Review do
not visually collapse into each other. Severity reads critical oxblood, high
ink, medium stone, low hairline. No green, and no second accent.

**Type.** Source Serif 4 for the wordmark, page titles and server quotes;
Archivo for body, rows, labels and figures. Clause numbers and money set
tabular.

**Anatomy.** 2px radius, 40px control height, 8px grid. Rows separated by
hairlines — never cards, and never cards on cards. Two type sizes to a screen.
Square corners. Quote the server text rather than paraphrasing it.

**Explicitly out:** confidence scores, sparkles, prompt boxes, shadows, glass,
gradients, illustrations, chat columns, dashboard charts. Never "AGMT". Never
an exclamation mark.

**Flow.** Sign-in → Matter → canonicalisation map → Proof → Key Issues List →
Row → Mail. The map is the only gate before anything is read; only accepted
rows reach Mail.

## Not yet reconciled with `site/`

The marketing site was redesigned separately and does not currently follow
this document. Recorded here as of `234f03d` so the gap is visible rather than
discovered later. This is a decision to take, not a defect to fix quietly.

| | This document | `site/` today |
|---|---|---|
| Tagline | Proof the artefact. Review the deal. | Find what changed. Catch what broke. |
| Serif | Source Serif 4 | Spectral |
| Sans | Archivo | IBM Plex Sans |
| Paper | `#F4EFE6` | `#f5efe5` |
| Ink | `#1C1917` (warm) | `#171c22` (cool) |
| Accent | `#6B2B2B` | `#9b3028` |
| Accents | oxblood only | oxblood plus `brass #b8894a` |

`web/` has not been assessed against this document.
