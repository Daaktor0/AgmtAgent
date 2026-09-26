# ADR 0009: pre-expansion ZIP safety boundary

- **Status:** Accepted for repository implementation and synthetic regression coverage; isolated-worker resource proof and production security review pending
- **Date:** 30 August 2026
- **Decision owners:** Product/engineering owner and implementation agent
- **Packages:** WRK-02

## Context

The DOCX extractor used JSZip with post-load metadata checks. That left path sanitisation, central-directory claims, duplicate records, unsupported compression, local-header consistency and archive overlap outside an explicit pre-expansion contract. The blueprint requires hostile DOCX packages to be rejected before decompression and requires bounded extraction rather than truncation or best-effort parsing.

## Decision

- Add `zip-safety.ts` as a byte-level central-directory inspector that runs after the 25 MiB input check and before `JSZip.loadAsync`.
- Require one single-disk non-ZIP64 archive with a bounded central directory and at most 4,096 unique entries. Accept only stored or deflated entries, reject encrypted entries and symbolic links, and reject ambiguous/non-UTF-8 names, absolute paths, drive paths, traversal/dot segments, control characters and duplicate paths.
- Validate every central record against its local header, including the raw filename, flags, compression method, declared sizes and local data bounds. Reject overlapping local records and central-directory claims that exceed the per-entry 32 MiB, package 150 MiB or compression-ratio 250 limits.
- After preflight, extract only required XML parts. Each extraction is checked against the declared uncompressed size, the per-entry bound, CRC32 and strict UTF-8 decoding before XML parsing. Invalid or inconsistent packages fail closed with a typed safety code.

## Security and privacy consequences

- ZIP path traversal, symlink and duplicate-name ambiguity cannot select a different OOXML part after a library normalises paths. Resource limits are evaluated from attacker-controlled central metadata before the library is asked to inflate content.
- The parser does not recover from malformed structures, silently truncate data, or claim capability absence when package evaluation failed. No document bytes are logged or persisted by this boundary.
- This is a parser boundary, not an isolation claim. Production still requires the parser/Proof worker to run in a restricted container/Lambda with CPU, memory, scratch, timeout, egress, image and IAM controls.

## Verification

At code head `f76e646e1a6fbfa57a7779af3b580eaac4074b33`, Web Proof workflow `33337574208` passed typecheck, DB hardening, production build, Proof golden corpus and the full web suite with 102/102 tests. Eval workflow `33337574224` passed. Regression fixtures cover declared expansion bombs, traversal paths and unsupported compression methods.

No migration, Supabase schema change, AWS resource, production database, authentication configuration or external service was changed for this ADR.

## Rollback and stop conditions

- Roll back by stopping the affected parser artifact and shipping a reviewed forward-fix; do not re-enable post-expansion-only validation.
- Stop before accepting a package if central metadata is missing, ambiguous or inconsistent, or if actual output exceeds declared bounds.
- Stop before marking WRK-02 complete until isolated-worker CPU/memory bounds are measured against an adversarial corpus and production image/IAM controls are reviewed.
