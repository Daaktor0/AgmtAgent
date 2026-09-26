# ADR 0004: Tenant integrity expand-and-contract sequence

- Status: Proposed — human review required before applying migrations
- Date: 2026-08-30
- Packages: FND-03, FND-04

## Context

The Slice 0 schema filters by owner_user_id but does not carry tenant identity through relationships. Owner-only foreign keys permit a row from one logical tenant to be attached to a parent from another. RLS cannot repair missing composite relationships after the fact.

The current product has no approved collaboration model. The least-assumption v1 model is one tenant per verified user, with a membership row representing ownership. This is a repository design choice, not permission to migrate live data.

## Decision

1. Add agmt_tenant and agmt_tenant_member with the existing user_account principal as the owner.
2. The FND-03 expand migration adds nullable tenant_id columns to tenant-owned tables, supporting indexes, composite parent keys, and tenant-scoped composite foreign keys.
3. Existing tenant identity is backfilled only from an unambiguous owner_user_id or user_id. The principal foreign key fails closed if an owner has no user_account row. Ambiguous ownership blocks the migration.
4. Existing document bytes and ciphertext are not rewritten, decrypted, deleted, or re-keyed by the expand migration. Historical ciphertext/key disposition requires a separate human decision.
5. Composite foreign keys are introduced as NOT VALID during expansion so existing anomalies can be measured without silently changing them. A reviewed contract migration must validate them, make required tenant columns NOT NULL, install RLS policies, and remove owner-only fallbacks.
6. Application/runtime tenant context and role separation must be deployed and tested before the contract step. No migration runs as part of an application build.

## Consequences

The expansion is additive but does perform a bounded metadata backfill if applied. It is not a launch authorization: nullable columns are temporary, RLS is not installed by this migration, and existing rows still require validation before confidential use.

The repository includes an in-memory PGlite rehearsal that proves same-tenant relationships succeed and a cross-tenant document relationship fails.

## Required review decisions

Before applying any schema or data change, approve the target database, maintenance window, historical ciphertext disposition, backfill/validation plan, runtime role model, and rollback/repair procedure. The release migration workflow must be the only production application path.
