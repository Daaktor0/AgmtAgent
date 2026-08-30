# Agmt Proof implementation status

**Baseline:** current `main` at `b2d48d6f52bf6afdad33821db5daf70c107f5e5f` (30 August 2026)  
**Working branch:** `proof-production-hardening/fnd01-sec01-fnd05`  
**Scope:** repository-side production hardening only. No infrastructure was provisioned, no production database was changed, no migration was applied to Supabase, and no external authentication provider was configured.

## Baseline verification

- `AGENTS.md`: absent from current `main` (repository API returned 404); no repository-local agent instructions were available.
- `docs/AGMT_PROOF_PRODUCTION_LAUNCH_BLUEPRINT.md` is present and was read in full before code changes.
- The audited findings are reproducible from current source: automatic test-workspace access, baked preview OAuth credentials, database-derived deployed auth fallback, build-time migration coupling, synchronous/base64 ingestion, sequential persistence, and PostgreSQL document blobs.
- Current baseline is not launch-ready for confidential documents.
- A user-owned Supabase Free project exists for the future database target. This branch has not connected to it or changed it. No credentials, connection strings, private keys, or production documents are stored in the repository.

## Evidence from the latest code head

At code head `f526f826f81d51743bd85cc5079a680cd27155fa`:

- Web Proof workflow `33325366767`: development build, typecheck, production build, and proof golden corpus passed.
- Eval workflow `33325366801`: Python corpus/evaluation checks passed.
- Focused new checks passed inside the web test command: transaction commit/rollback, additive tenant migration checks, in-memory PGlite cross-tenant rejection, checksum stability, and ledger drift failures.
- The full web test command remains red at 187/205 tests. The 18 failures are existing Grok fixture/app-env/PWA metadata expectations plus a stale migration-directory expectation; they are not treated as a launch waiver. The package ledger below therefore keeps final approval pending.

## Package ledger

| Package | Status | Evidence and remaining work |
|---|---|---|
| FND-01 | Implemented; human approval pending | Added baseline ADR, supported DOCX matrix, invariants, state boundaries, non-goals, gate ownership, and review stop conditions. See ADRs 0001 and 0002. |
| SEC-01 | Repository changes implemented; security review pending | Removed automatic test-workspace access, deleted gate-session/preview-secret source paths, made deployed auth require an explicit secret/provider configuration, and kept sign-in unavailable when unconfigured. Relevant builds and auth checks pass; final full-suite/security review is pending. |
| FND-05 | Implemented repository-side; release rehearsal pending | Builds no longer run migrations; `db:migrate:release` is manual-only; the runner and PGlite ledger store/verify SHA-256 checksums and fail closed on unknown, edited, or legacy unchecksummed rows. No live migration was run. |
| FND-02 | Adapter implemented; publication integration pending | Added provider-neutral `Sql.transaction`, dedicated Postgres connection handling, PGlite transaction mapping, allow-listed isolation, rollback/release behavior, and forced-failure regression tests. Document-generation publication still must move behind this boundary after tenant/runtime context is ready. |
| FND-03 | Expand migration implemented; contract and review pending | Added `0003_tenant_integrity_expand.sql`, tenant/member tables, tenant columns, supporting composite keys, tenant-scoped foreign keys, and a PGlite rehearsal proving cross-tenant document relationships fail. Columns remain temporarily nullable; validation, NOT NULL contract, runtime context, RLS, and historical-data review remain blocked. |
| FND-04 | Blocked by FND-03 contract | RLS/runtime-role implementation has not started. It must follow validated composite tenant constraints and an approved request/worker/support role model. |

A package is not marked complete until its acceptance tests, security considerations, definition of done, and relevant full-suite gates pass.

## FND-02 transaction design

- The provider-neutral adapter exposes `transaction(callback, options)`.
- Managed Postgres acquires one pool client, issues `BEGIN` with an allow-listed isolation level, runs the callback on that same client, commits only after success, rolls back on every exception, and releases in `finally`.
- PGlite delegates to its native transaction callback. Nested transactions are rejected rather than silently misrepresented as savepoints.
- Database publication will persist one complete generation and advance `document.current_version_id` last. A forced failure must leave readers on the prior complete generation.
- Object-store operations remain outside the database transaction and require staged-object reconciliation in the later object/job plane.
- Tenant/request context is deliberately deferred until the FND-04 runtime/RLS package.

See [ADR 0003](adr/0003-atomic-database-transaction-boundary.md).

## FND-03 expand/contract design

Expand:

- Add nullable `tenant_id` columns and indexes to tenant-owned tables.
- Create `agmt_tenant` and `agmt_tenant_member`; v1 identity is one tenant owner per existing verified user because no collaboration model has been approved.
- Backfill only from existing owner/user identity. The principal foreign key fails closed when an owner has no `user_account` row.
- Add composite parent keys and tenant-scoped foreign keys as `NOT VALID`; new non-null relationships cannot cross tenants while existing rows remain measurable.

Contract:

- Review and validate all existing composite relationships.
- Stop on any ambiguous owner, missing principal, tenant mismatch, or unverifiable historical ciphertext/key.
- Make tenant columns `NOT NULL`, install RLS and runtime roles, and remove owner-only fallbacks only after crossover tests pass.

The migration is additive but performs metadata backfill if someone applies it. It does not delete, decrypt, rewrite, re-key, or move document bytes. It has not been applied anywhere.

See [ADR 0004](adr/0004-tenant-integrity-expand-contract.md).

## Gate ownership map

| Gate | Owner | Evidence required |
|---|---|---|
| P0 precision/recall | Proof/rules owner | Frozen corpus report with 95% CIs |
| Evidence validity | Parser/evidence owner | Exact OOXML round-trip and zero fallback anchors |
| Tenant isolation | Security/data owner | SQL/API/object/queue/export crossover matrix |
| Parser safety | Parser/worker owner | Adversarial corpus and bounded-resource results |
| Export fidelity | Export owner | Open XML, LibreOffice and Word matrix |
| DR/deletion | Operations owner | Two restore drills and purge drill |
| CI/CD separation | Release owner | Read-only build and migration rehearsal |

## Remaining stop conditions

- FND-01, FND-02 publication integration, FND-03 contract, and FND-04 require human review of the ADRs and historical ciphertext disposition before any live schema/data action.
- The current full web test command has 18 failures and must be reconciled or explicitly dispositioned; no numerical or security gate is being weakened.
- Production use remains blocked until the blueprint's P0, evidence, tenant, parser, export, lifecycle, DR, security, and operational gates pass.
