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

## The house and its products

Agmt (the company, `site/`, agmt.legal) and its products have separate but
related identities. The house is neutral so that each product can bring one
colour of its own.

| | Agmt house (`site/`) | Execute (`web/`) |
|---|---|---|
| Ground | White `#FFFFFF`, desk grey `#F5F6F8` | Paper `#F4EFE6` |
| Ink | `#0E1015` (cool) | `#1C1917` (warm) |
| Accent | Signature blue `#2343D6` (links, focus, the sign-here flag) | Oxblood `#6B2B2B` |
| Display / reading | Newsreader | Source Serif 4 |
| Interface | Instrument Sans; Geist Mono for labels and figures | Archivo |
| Mark | "Agmt" in Newsreader with a blue square full stop | The Execute mark: spine and three leaves, the signed one in oxblood |

Where a product appears on agmt.legal it keeps its own mark and accent (the
Execute mark and oxblood), set inside the house layout. The Execute app keeps
the system described above; nothing in `web/` follows the house style.

Rules shared by both: never "AGMT", never an exclamation mark, numbers set
tabular, no confidence scores, sparkles, prompt boxes or chat columns. The
house allows what a marketing site needs and an app doesn't: a dark band for
contrast, soft shadows under product screenshots, and one orchestrated motion
on the home page (off when the reader prefers reduced motion).

Tokens live in `site/src/styles.css`; social cards and icons are drawn by
`site/scripts/og/render.mjs`.
