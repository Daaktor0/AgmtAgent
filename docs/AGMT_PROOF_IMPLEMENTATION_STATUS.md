# Agmt Proof implementation status

**Baseline:** current `main` at `b2d48d6f52bf6afdad33821db5daf70c107f5e5f` (30 August 2026)  
**Working branch:** `proof-production-hardening/fnd01-sec01-fnd05`  
**Scope:** repository-side production hardening plus one explicitly authorized schema migration to an empty, non-confidential Supabase Mumbai sandbox. No infrastructure was provisioned, no production database or documents were changed, and no external authentication provider was configured.

## Baseline verification

- `AGENTS.md`: absent from current `main` (repository API returned 404); no repository-local agent instructions were available.
- `docs/AGMT_PROOF_PRODUCTION_LAUNCH_BLUEPRINT.md` is present and was read in full before code changes.
- The audited findings are reproducible from current source: automatic test-workspace access, baked preview OAuth credentials, database-derived deployed auth fallback, build-time migration coupling, synchronous/base64 ingestion, sequential persistence, and PostgreSQL document blobs.
- Current baseline is not launch-ready for confidential documents.
- The user-selected Supabase Free project in Mumbai is the current empty integration sandbox. Its schema migration was applied and independently verified; no credentials, connection strings, private keys, or production documents are stored in the repository. It must not receive confidential documents until FND-04 and the remaining launch gates pass.

## Evidence from the latest code head

At code head `8c9b4a236d4f713780750f82da774a89250fb42b`:

- Web Proof workflow `33326121240`: development build, typecheck, production build, and proof golden corpus passed.
- Eval workflow `33326121257`: Python corpus/evaluation checks passed.
- The explicit `DB transaction hardening tests` CI step and focused new checks passed: transaction commit/rollback, parser-before-transaction boundary, atomic Matter/document publication source checks, additive tenant migration checks, in-memory PGlite cross-tenant rejection after the existing index-quality migration, checksum stability, and ledger drift failures.
- The full web test command remains red at 190/208 tests. The 18 failures are existing Grok fixture/app-env/PWA metadata expectations plus a stale migration-directory expectation; they are not treated as a launch waiver. The package ledger below therefore keeps final approval pending.

## Package ledger

| Package | Status | Evidence and remaining work |
|---|---|---|
| FND-01 | Implemented; human approval pending | Added baseline ADR, supported DOCX matrix, invariants, state boundaries, non-goals, gate ownership, and review stop conditions. See ADRs 0001 and 0002. |
| SEC-01 | Repository changes implemented; security review pending | Removed automatic test-workspace access, deleted gate-session/preview-secret source paths, made deployed auth require an explicit secret/provider configuration, and kept sign-in unavailable when unconfigured. Relevant builds and auth checks pass; final full-suite/security review is pending. |
| FND-05 | Implemented repository-side; release rehearsal pending | Builds no longer run migrations; `db:migrate:release` is manual-only; managed-Postgres and PGlite ledgers store/verify SHA-256 checksums and fail closed on unknown, edited, or legacy unchecksummed rows. Exact repository SQL was applied to the empty Supabase sandbox and both migration histories were verified; the secret-backed release-job rehearsal is still pending. |
| FND-02 | Relational publication integrated; fault-injection/object reconciliation pending | Added provider-neutral `Sql.transaction`, dedicated Postgres connection handling, PGlite transaction mapping, allow-listed isolation, rollback/release behavior, forced-failure tests, atomic Matter creation, and atomic document publication. Parser work remains outside the transaction; future external object-store writes remain outside it. |
| FND-03 | Expand migration implemented; contract and review pending | Added `0003_tenant_integrity_expand.sql`, tenant/member tables, tenant columns, supporting composite keys, tenant-scoped foreign keys, and a PGlite rehearsal proving cross-tenant document relationships fail. The expand migration is also verified in the empty Supabase sandbox with no user/document rows. Columns remain temporarily nullable; validation, NOT NULL contract, runtime context, RLS, and historical-data review remain blocked. |
| FND-04 | Blocked by FND-03 contract | RLS/runtime-role implementation has not started. It must follow validated composite tenant constraints and an approved request/worker/support role model. |

A package is not marked complete until its acceptance tests, security considerations, definition of done, and relevant full-suite gates pass.

## FND-02 transaction design

- The provider-neutral adapter exposes `transaction(callback, options)`.
- Managed Postgres acquires one pool client, issues `BEGIN` with an allow-listed isolation level, runs the callback on that same client, commits only after success, rolls back on every exception, and releases in `finally`.
- PGlite delegates to its native transaction callback. Nested transactions are rejected rather than silently misrepresented as savepoints.
- Matter creation now publishes its matter, mandate, active pointer, and audit row through one callback.
- Document upload parses before acquiring a connection, then publishes the object metadata, document/version, canonicalisation rows, capabilities, current pointer, and audit row through one callback. A callback failure rolls back the relational publication; the existing compensation path remains as a safety net for legacy/incomplete rows.
- Tenant/request context is deliberately deferred until the FND-04 runtime/RLS package.
- Object-store operations remain outside the database transaction and require staged-object reconciliation in the later object/job plane.

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

The migration is additive but performs metadata backfill if someone applies it. It does not delete, decrypt, rewrite, re-key, or move document bytes. It was applied only to the confirmed empty test sandbox; no historical ciphertext or application rows were present.

See [ADR 0004](adr/0004-tenant-integrity-expand-contract.md).

## Supabase sandbox migration receipt

- Target: the user-selected Supabase Free project in Mumbai; the project identifier and URL are intentionally omitted from repository documentation.
- Preflight: `ACTIVE_HEALTHY`, zero public tables, and zero recorded migrations immediately before the write.
- Applied in order: `0001_auth`, `0002_slice0`, `0003_slice2`, `0003_tenant_integrity_expand`.
- Postflight: Supabase migration history and the application `_migrations` ledger both contain all four entries; 32 public tables, zero user/document rows, four application-ledger rows, and 65 tenant foreign-key constraints were observed.
- Security: all 32 public tables currently report RLS disabled, producing 32 security-advisor errors. This is an explicit FND-04 blocker; the sandbox is for synthetic/non-confidential testing only.
- No AWS resources, external auth providers, storage buckets, or production services were changed.

See [ADR 0005](adr/0005-supabase-mumbai-sandbox-database.md).

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

- FND-01, FND-03 contract, FND-04, and historical ciphertext disposition require human review before any non-empty or production schema/data action.
- FND-02 still needs an injected-failure integration harness around the production publication path and the later object/job-plane reconciliation contract.
- The current full web test command has 18 failures and must be reconciled or explicitly dispositioned; no numerical or security gate is being weakened.
- Production use remains blocked until the blueprint's P0, evidence, tenant, parser, export, lifecycle, DR, security, and operational gates pass.
