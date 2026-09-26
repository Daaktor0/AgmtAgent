# Agmt — brand and interface system

The design reference for both front ends: `site/` (marketing) and `web/`
(Execute). Brand assets for Execute live in `web/public/brand/`.

## The system in brief

**Colour.** Paper `#F4EFE6` · paper sunk `#EDE7DA` · ink `#1C1917` · hairline
`#D9D2C4` · stone `#6E7478` · oxblood `#6B2B2B` · oxblood pressed `#571F1F`.

Oxblood is the *only* accent: primary action, a problem that needs the
lawyer, the wordmark underline. Stone carries secondary text. No green, and no
second accent.

**Type.** Source Serif 4 for the wordmark, page titles and headings; Archivo
for body, rows, labels and figures. Numbers set tabular.

**Anatomy.** 2px radius, 40px control height, 8px grid. Rows separated by
hairlines — never cards, and never cards on cards. Two type sizes to a screen.
Square corners.

**Explicitly out:** confidence scores, sparkles, prompt boxes, shadows, glass,
gradients, illustrations, chat columns, dashboard charts. Never "AGMT". Never
an exclamation mark.

## Not yet reconciled with `site/`

The marketing site was redesigned separately and does not currently follow
this document. This is a decision to take, not a defect to fix quietly.

| | This document | `site/` today |
|---|---|---|
| Serif | Source Serif 4 | Spectral |
| Sans | Archivo | IBM Plex Sans |
| Paper | `#F4EFE6` | `#f5efe5` |
| Ink | `#1C1917` (warm) | `#171c22` (cool) |
| Accent | `#6B2B2B` | `#9b3028` |
| Accents | oxblood only | oxblood plus `brass #b8894a` |
