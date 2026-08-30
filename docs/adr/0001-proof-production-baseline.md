# ADR-0001: Proof production baseline and launch boundary

- **Status:** Proposed for human approval
- **Date:** 2026-08-30
- **Decision:** Treat the audited web Proof surface at `a5718aec3facba3f4fba8f49728ff12acaff4986` as the frozen baseline. Production launch means confidential-document readiness, not prototype completeness.

## Invariants

- Every document generation is immutable and pinned to source, parser, canonical, rule and evidence versions.
- Findings are publishable only when canonical text validates through the final span map to exact OOXML source.
- Absence findings require an evaluated-scope inventory; no fallback quote or fabricated anchor is permitted.
- Missing capabilities, failed checks, invalid evidence and stale generations cannot produce a clear result.
- Tenant identity is enforced in application and database paths.
- Source documents remain private, encrypted and unavailable to models unless separately approved.

## State boundaries

`upload_intent -> uploaded -> scanned_clean -> ingest_queued -> parsing -> staged -> published`; terminal rejection/failure states are inaccessible to parser workers.

`proof_run: queued -> running -> completed|failed|suppressed|stale`; only completed runs with all required P0 checks valid may be clear.

`export: requested -> validating -> ready|blocked|failed|expired`; blocked or failed exports are never downloadable.

## Non-goals

Review, LLM semantic checks, broad drafting, clean-copy generation, collaboration, CLM, e-signature, obligation management and Word add-in reintegration are outside this Proof launch programme.

## Consequence

Repository changes proceed in blueprint dependency order. Infrastructure provisioning, production database changes, external provider configuration and historical ciphertext migration require separate authorization and review.
