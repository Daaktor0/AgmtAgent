# Agmt Proof implementation status

**Baseline:** `main` at `a5718aec3facba3f4fba8f49728ff12acaff4986` (30 August 2026 audit)  
**Working branch:** `proof-production-hardening/fnd01-sec01-fnd05`  
**Scope:** repository-side production hardening only. No infrastructure was provisioned, no production database was changed, and no external authentication provider was configured.

## Baseline verification

- `AGENTS.md`: absent from `main` (repository API returned 404); no repository-local agent instructions were available.
- The production blueprint is present at `docs/AGMT_PROOF_PRODUCTION_LAUNCH_BLUEPRINT.md` and was read in full.
- The audited findings are reproducible from the current source: automatic test-workspace access, baked preview OAuth credentials, database-derived deployed auth fallback, build-time migration coupling, synchronous/base64 ingestion, sequential persistence, and PostgreSQL document blobs.
- Current baseline is not launch-ready for confidential documents.

## Package ledger

| Package | Status | Evidence |
|---|---|---|
| FND-01 | Implemented; human approval pending | Added baseline ADRs, supported-document matrix, invariants, non-goals, state boundaries and gate ownership. |
| SEC-01 | Implemented in branch; test execution pending | Removed automatic test-workspace route/UI, removed gate-session and preview-secret source paths, and made deployed auth require explicit `BETTER_AUTH_SECRET`. |
| FND-05 | Implemented in branch; test execution pending | `npm run build` no longer runs migrations; added explicit `db:migrate:release` command, manual release workflow and regression test. |
| FND-02 | Design drafted; blocked on review | Transaction boundary design is recorded below. No migration or production data action was taken. |
| FND-03 | Design drafted; blocked on review | Tenant/FK/RLS migration design is recorded below. No migration was added or run. |

A package is not marked complete until its acceptance tests, security review and definition of done pass.

## FND-02/FND-03 review gate

Before implementing schema changes, a human must approve:

1. the target production data region/provider;
2. whether historical rows and ciphertext are retained, migrated, or declared unrecoverable;
3. the expand/migrate/contract sequence and maintenance/rollback window; and
4. the runtime-role and RLS ownership model.

### Proposed FND-02 transaction design

- Add a small `withTransaction` adapter over the existing PostgreSQL connection interface.
- Acquire one connection, issue `BEGIN`, apply `SET LOCAL` tenant/request context, run the callback, and `COMMIT`; rollback on every exception and release in `finally`.
- Keep PGLite's transaction adapter separate from managed Postgres. Do not make application code depend on provider-specific transaction APIs.
- Move publication of a document generation behind one transaction. Advance `document.current_version_id` last.
- Add fault-injection tests after each publication phase. Readers must observe the prior complete generation or the new complete generation, never a partial generation.
- Keep object-store operations outside the database transaction and use an outbox/reconciler for staged objects. Do not claim distributed atomicity.

### Proposed FND-03 migration design

Expand:

- Add nullable `tenant_id` columns and required supporting indexes to every tenant-owned table.
- Add tenant-scoped state checks and composite unique keys needed by foreign keys.
- Add a migration ledger/checksum and schema version gate; do not rewrite or delete historical document bytes.

Migrate:

- Backfill tenant identity from existing owner/matter relationships in bounded, auditable batches.
- Stop if any row is ambiguous or if a historical ciphertext/key cannot be verified. Produce a metadata-only exception report.
- Add composite foreign keys using `NOT VALID`, validate them, then make new writes require the columns.

Contract:

- Make tenant columns `NOT NULL` only after the backfill and validation gates pass.
- Enable RLS and create policies for web/worker/support roles after runtime context is deployed and tested.
- Remove or restrict owner-level fallbacks only after crossover tests pass.

These steps are intentionally design-only in this batch. No destructive migration, historical ciphertext rewrite, production database change, or external service configuration is authorized by this work item.

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

- FND-02/FND-03 implementation awaits explicit review of the design and historical ciphertext disposition.
- Production use remains blocked until the blueprint's P0, evidence, tenant, export, lifecycle, DR, security and operational gates pass.
