# ADR 0010: OOXML relationship and capability inventory

- **Status:** Accepted for repository implementation and synthetic regression coverage; differential Word inventory and production security review pending
- **Date:** 30 August 2026
- **Decision owners:** Product/engineering owner and implementation agent
- **Packages:** WRK-03

## Context

A safe ZIP is not sufficient evidence that a DOCX was evaluated. OOXML content is distributed across typed parts and relationship graphs: the main story, headers/footers, comments, footnotes, endnotes, fields, revisions, bookmarks and section properties. External targets and active content can also be present without being visible in the main body.

## Decision

- Validate `[Content_Types].xml` for every non-directory package part and require the standard main-document content type. Macro/ActiveX content types fail closed.
- Parse every relationship part, bind it to an existing source part, require unique relationship IDs, resolve internal targets within the package, and reject missing/escaping targets. External targets are inventoried but never fetched; only HTTP(S) and mailto targets are accepted, and external active-content relationship types fail closed.
- Keep the existing ordered final-view body/header/footer extraction, and add evaluated inventories for content types, relationships, external relationships, active content, comments, revisions, fields, tables, headers/footers, footnotes, endnotes, bookmarks and sections. Footnote/endnote paragraphs participate in the immutable block/source model with story-specific anchors.
- Preserve raw relationship targets in the public inventory while using the resolved target only for validation. Capability states distinguish evaluated presence from evaluated absence; parser failure is never converted into feature absence.

## Security and evidence consequences

- The parser cannot silently ignore a relationship to a missing or outside part, follow an external URL, or treat a macro/active-content package as a normal DOCX.
- Capability reporting is explicit enough for downstream Proof suppression and absence findings. A missing capability due parser failure remains a failed package, not an evaluated absence.
- Relationship and story coverage is a repository contract, not a claim of Word-equivalent support. Differential Open XML SDK/Word inventories and adversarial external-content fixtures are still required before production use.

## Verification

At code head `497854d7afffabb5ae53219195fb3ffbfb6ace26`, Web Proof workflow `33338227000` passed route/build verification, typecheck, DB hardening, production build, Proof golden corpus and full web tests (104/104). Eval workflow `33338227015` passed. Regression coverage includes external relationship inventory, footnote/endnote extraction, bookmarks, section capability and internal relationship traversal rejection.

No migration, Supabase schema change, AWS resource, production database, authentication configuration or external service was changed for this ADR.

## Rollback and stop conditions

- Roll back by stopping the parser artifact and shipping a reviewed forward-fix; do not fall back to unvalidated relationship or story parsing.
- Stop before publishing findings from a package whose content types, relationship graph or required story capability cannot be evaluated.
- Stop before marking WRK-03 complete until differential Word/golden inventories, external/active-content corpus results and worker isolation evidence are reviewed.
