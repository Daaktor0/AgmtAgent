# ADR-0002: Proof supported DOCX matrix

- **Status:** Proposed for human approval
- **Date:** 2026-08-30
- **Decision:** Launch support is limited to OOXML WordprocessingML packages whose structure and evidence can be inspected and round-tripped deterministically.

| Structure | Initial policy | Reason |
|---|---|---|
| Main document, paragraphs, runs, tables and sections | Supported when inventory is complete | Core Proof source surface |
| Headers and footers | Supported only with exact story evidence | Required for stale-name checks |
| Comments and tracked revisions | Supported only when ranges and visibility are resolved | No silent review-debris loss |
| Fields, bookmarks and hyperlinks | Supported only with capability evidence | Anchors must survive parsing |
| Footnotes/endnotes, content controls and complex numbering | Block or suppress the affected check until proven | High mapping risk |
| Macros, ActiveX, embedded/linked objects, external relationships or encrypted packages | Reject/fail closed | Active content or unsupported source |
| Malformed ZIP/XML, duplicate/traversal entries or resource-limit violations | Reject before decompression | Parser safety |
| Digital signatures | Preserve source; block edits/export modes not proven safe | Signature integrity |

Support is a capability decision per document and per check, not a blanket claim that every DOCX is supported.
