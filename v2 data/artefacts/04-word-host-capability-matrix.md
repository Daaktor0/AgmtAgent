# 04 — Word host capability matrix

Release gate for ingestion claims (plan 1251–1254). A host that
cannot provide a capability must report `false` plus a reason;
the server records a suppressed-check row and must not treat an
absent collection as a successful empty ingest (plan 989–991).

Plan basis: section 9 (904–1006); risk rows “Partial Word
fidelity” and “Word host divergence” (1447, 1455).

## What the add-in calls today

`addin/taskpane.js` is the only Office.js caller. There is no
`ingest.js` / `apply.js` / `selection.js` yet (those are
section 9.2 future splits). Concrete calls:

| Call | Lines | Requirement set used in code |
|---|---|---|
| `Office.onReady`; `info.host !== Office.HostType.Word` | 19–21 | Common API |
| `Office.context.requirements.isSetSupported("WordApi", "1.4")` stored as `CAN_COMMENT` | 24, 88–90, 614 | WordApi 1.4 |
| `isSetSupported("WordApi", ver)` as `apiSet` | 201–203 | WordApi 1.3 / 1.4 / 1.6 |
| `Word.run`; `context.document.body`; `body.paragraphs`; `items/text` | 220–229 | WordApi 1.1 |
| `items/listItemOrNullObject`; `listString`, `level` | 223–227, 231–234, 248–251 | WordApi 1.3, gated |
| `items/uniqueLocalId` | 224–226, 245 | WordApi 1.6, gated |
| `body.getComments()`; `id`, `authorName`, `createdDate`, `content`, `resolved`; `getRange()` | 259–278 | WordApi 1.4, gated + try/catch |
| `body.getTrackedChanges()`; `type`, `author`, `date`, `text`; `getRange()` | 287–312 | WordApi 1.6 **and** `typeof body.getTrackedChanges === "function"`, try/catch |
| `body.tables`; `values`, `rowCount`; `getRange()` | 321–338 | no `apiSet` gate; try/catch only |
| `para.search` / `body.search` with `matchCase`, `matchWildcards: false` | 682–705 | WordApi 1.1 |
| `changeTrackingMode = Word.ChangeTrackingMode.trackAll`; abort if still `off` | 738–746 | WordApi 1.4 |
| `range.insertText(..., Word.InsertLocation.replace)`; `range.delete()`; `range.select()` | 751–757 | WordApi 1.1 |
| `range.insertComment` | 778 | WordApi 1.4, UI-gated by `CAN_COMMENT` |

Not called today: `Section.getHeader` / `getFooter`,
`body.footnotes` / `endnotes`, content-control collections,
`document.getSelection` (selection envelope is future
`selection.js`, plan 942–944), any undo API.

Capability payload today is implicit: `payload()` (355–373)
omits `comments` / `revisions` / `tables` when ingest failed.
`Document.capabilities` (`agent/document.py` 349–363) then
drops those keys, and `run_registered` (`check_registry.py`
120–125) emits a suppressed row. That matches plan 989–991
for comments/revisions/tables; headers/footers/footnotes/
content controls are not ingested at all (future, commit 15).

## Manifests today

`addin/manifest.xml` and `catalog/manifest.xml` are the same
task-pane app (Id `528a23ed-8e75-418e-9e0e-b6cb5e827f41`,
Version `1.1.2.0`, `ReadWriteDocument`).
`VersionOverridesV1_0` / `DesktopFormFactor` only. One Home-tab
button. No `<Requirements>` / `<Sets>` block, no shared
runtime, no `ContextMenuText`, no ExtendedOverrides shortcuts.
Plan 9.1 (908–923) is future: declare a minimum WordApi set,
capability-check the rest, add shared runtime and command
surfaces (commit 19).

## Matrix

Cells: `supported` / `partial` / `unsupported` / `unverified`.
Requirement-set names are Microsoft’s. Host columns assume a
current Microsoft 365 desktop / Word Online build that meets
the minimum listed on the requirement-set page.[^req]

`supported` means the governing API set is documented as
available on that host. It is not a claim that this repository
has run a smoke test on that host — those tests do not exist
yet (plan 1256–1264; artefact 7).

| Capability | Word Windows desktop | Word Mac desktop | Word Online |
|---|---|---|---|
| Tracked changes / revisions — **read** (`Body.getTrackedChanges`, `TrackedChange.type/author/date/text`) | supported (WordApi 1.6)[^1.6] | supported (WordApi 1.6)[^1.6] | supported (WordApi 1.6; web listed as Supported)[^req] — host completeness of `format` / `move` and before/current text is **unverified** |
| Tracked changes — **write** (`Document.changeTrackingMode = trackAll`, then `insertText` / `delete`) | supported (WordApi 1.4)[^1.4] | supported (WordApi 1.4)[^1.4] | partial (WordApi 1.4 is listed Supported on web;[^req] whether `trackAll` actually sticks, which `taskpane.js` 742–746 already tests at runtime, is **unverified**) |
| Comments and comment threads — **read** (`getComments`, `replies`) | supported (WordApi 1.4)[^1.4] | supported (WordApi 1.4)[^1.4] | supported (WordApi 1.4)[^1.4] |
| Comments — **write** (`Range.insertComment`) | supported (WordApi 1.4)[^1.4] | supported (WordApi 1.4)[^1.4] | supported (WordApi 1.4)[^1.4] |
| Tables and table-cell anchors (`body.tables`, `values`, range of first cell) | supported (WordApi 1.3 tables;[^req] cell-adjacent `uniqueLocalId` is WordApi 1.6) | supported (same) | supported (same). Merged-cell coordinate fidelity is **unverified** |
| Headers and footers (`Section.getHeader` / `getFooter`) | supported (WordApi 1.1)[^hdr] | supported (WordApi 1.1)[^hdr] | supported (WordApi 1.1; web listed as Supported)[^req] — first-page / even-pages / field-code expansion is **unverified** |
| Footnotes and endnotes (`Body.footnotes` / `endnotes`, `Document.getFootnoteBody`) | supported (WordApi 1.5)[^1.5] | supported (WordApi 1.5)[^1.5] | supported (WordApi 1.5; web listed as Supported)[^req] — note-body paragraph indexing is **unverified** |
| Content controls (`insertContentControl` 1.1; typed collection + events 1.5) | supported (WordApi 1.1 / 1.5)[^1.5] | supported (WordApi 1.1 / 1.5)[^1.5] | partial (APIs listed Supported; repeating-section / picture / group types and event delivery on web are **unverified**) |
| Additional stories (header/footer/footnote/endnote `Body` objects as distinct stories) | supported (header/footer WordApi 1.1;[^hdr] footnote/endnote WordApi 1.5;[^1.5] `Body.type` documents those story kinds) | supported (same) | partial (same API sets listed Supported on web; whether a header `Body.search` sees the same text a lawyer sees is **unverified**) |
| Selection anchoring (`document.getSelection`, paragraph `uniqueLocalId`) | supported (selection WordApi 1.1; `uniqueLocalId` WordApi 1.6)[^1.6] | supported (same) | partial (`uniqueLocalId` is session-scoped per Microsoft; persistence across pane reload on web is **unverified**) |
| Document-wide search (`Body.search` / `Range.search`) | supported (WordApi 1.1) | supported (WordApi 1.1) | supported (WordApi 1.1). Smart-quote / tracked-hidden-text match behaviour is **unverified** |
| Undo after an add-in write | partial — `Document.undo` is WordApiDesktop 1.4 (programmatic; not WordApi 1.1–1.6).[^undo] Native Ctrl+Z of `insertText` / `delete` is **unverified**. `taskpane.js` does not call undo | partial (same WordApiDesktop 1.4; native stack **unverified**) | **unverified** — WordApiDesktop is not applicable on web; Word Online undo of Office.js writes is not documented on the requirement-set pages below |

`WordApiDesktop 1.1` is not applicable on Word Online and is
not required for any row above.[^desk] Do not declare it in the
XML manifest `Set` element (Microsoft: desktop-only sets are
invalid there).[^desk]

## Degradation policy

Capability names match `Document.capabilities`
(`agent/document.py` 349–363) and the ingest snapshot in plan
972–979. A missing capability suppresses the registry rows
whose `requires` tuple names it (`check_registry.py` 79–90,
120–125). Suppression is not a pass.

When a capability is `unsupported`, `partial` and the runtime
probe failed, or `unverified` and the probe threw, the add-in
sends `capabilities.<name> = false` with a reason. The task
pane must show a durable degraded banner — not a green
“no mechanical defects” empty state
(`taskpane.js` 429–431 currently does exactly that if
`findings` is empty, which is the failure mode the risk row
warns about).

| Missing capability | Suppress (registry id / legacy) | Task-pane wording (exact) |
|---|---|---|
| `revisions` | `exec.pending_tracked_change` / `pending_tracked_change` | “Tracked changes could not be read on this Word host (need WordApi 1.6 `getTrackedChanges`). Pending-revision checks are suppressed — this is not a clean bill of health.” |
| `comments` | `exec.unresolved_comment` / `unresolved_comment` | “Comments could not be read on this Word host (need WordApi 1.4 `getComments`). Unresolved-comment checks are suppressed — this is not a clean bill of health.” Also hide the Insert comment button (`CAN_COMMENT` already does this at `taskpane.js` 614). |
| `tables` | no registry check `requires` `tables` today | “Tables could not be read. Table-cell anchors are unavailable; writes that need a cell locus will be refused. This is not a clean bill of health.” |
| `unique_local_ids` | none (anchor quality, not a check) | “Paragraph local IDs are unavailable (need WordApi 1.6). Go-to and apply will use paragraph index and exact text only; a duplicate match will be refused.” |
| headers / footers (future capability key `headers_footers`, plan 977) | no current check `requires` this | “Headers and footers were not ingested. Checks did not see header/footer text. This is not a clean bill of health.” |
| footnotes / endnotes (future key `footnotes`) | no current check `requires` this | “Footnotes and endnotes were not ingested. Checks did not see note text. This is not a clean bill of health.” |
| content controls (future key `content_controls`) | no current check `requires` this | “Content controls were not ingested. Bound fields and structured controls were ignored. This is not a clean bill of health.” |
| `companions` (matter-level, not a Word host bit) | `xdoc.defterm_conflict` / `xdoc_defterm_conflict`; `xdoc.threshold_conflict` / `xdoc_threshold_conflict`; `xdoc.orphan_reference` / `xdoc_orphan_reference`; `xdoc.disclosure_mapping_gap` / `xdoc_disclosure_mapping_gap` | Registry `requires: ("companions",)` (`check_registry.py` 83–90). `Document.capabilities` adds `companions` only when companion docs were ingested (`agent/document.py` 361–362); `run_registered` then emits a suppressed row (`check_registry.py` 120–125). Banner: “Cross-document checks are suppressed — no companion SHA/SSA/disclosure letter was ingested.” |
| `changeTrackingMode` will not stay `trackAll` | no check; **block the write** | Existing string at `taskpane.js` 743–745: “Could not turn on change tracking, so nothing was inserted. Enable Review > Track Changes and try again.” |

Checks with `requires: ()` (`structure.*` except host-fidelity,
`defterm.*`, `amount.*`, `date.*`, `threshold.*`, `party.*`,
`exec.signature_block_mismatch`, `exec.unfilled_placeholder`)
keep running on body paragraphs. They must not be silently
dropped because comments or revisions failed.

Word Online support boundary (plan 1455): local-mode review of
the body, comments (if the 1.4 probe passes), and tables (if
the tables probe passes) is in scope. Claiming header, footnote
or content-control coverage on Word Online before a host smoke
test is out of scope. The native companion (artefact 6) is
Windows-first (plan 1352, 1421); Word Online never hosts it.

[^req]: https://learn.microsoft.com/en-us/javascript/api/requirement-sets/word/word-api-requirement-sets
    WordApi 1.1–1.9 are listed Supported on Office on the web,
    Windows Microsoft 365, and Mac (1.6 minimum: Windows
    Version 2308 Build 16731.20234; Mac 16.76; web Supported).
    Retrieved 2026-08-19.
[^1.4]: https://learn.microsoft.com/en-us/javascript/api/requirement-sets/word/word-api-1-4-requirement-set
    WordApi 1.4: comments, `insertComment`, `changeTrackingMode`,
    `getReviewedText`. Retrieved 2026-08-19.
[^1.5]: https://learn.microsoft.com/en-us/javascript/api/requirement-sets/word/word-api-1-5-requirement-set
    WordApi 1.5: footnotes, endnotes, content-control events /
    typed `getContentControls`. Retrieved 2026-08-19.
[^1.6]: https://learn.microsoft.com/en-us/javascript/api/requirement-sets/word/word-api-1-6-requirement-set
    WordApi 1.6: `getTrackedChanges`, `TrackedChange`,
    `Paragraph.uniqueLocalId`. Retrieved 2026-08-19.
[^hdr]: https://learn.microsoft.com/en-us/javascript/api/word/word.section
    `Section.getHeader` / `getFooter`: WordApi 1.1.
    Retrieved 2026-08-19.
[^desk]: https://learn.microsoft.com/en-us/javascript/api/requirement-sets/word/word-api-desktop-1-1-requirement-set
    WordApiDesktop 1.1 is Windows / Mac / iPad only; not
    applicable on web; must not be used as an XML `Set`
    activation requirement. Retrieved 2026-08-19.
[^undo]: https://learn.microsoft.com/en-us/javascript/api/word/word.document
    `Document.undo` / `Document.redo`: WordApiDesktop 1.4,
    not WordApi 1.1–1.6. Retrieved 2026-08-19.
