# ADR 0003: Atomic database transaction boundary

- Status: Proposed — human review required
- Date: 2026-08-30
- Packages: FND-02, FND-05

## Context

The current SQL facade issues independent statements. A document publication can therefore leave visible metadata, index rows, or the current-version pointer behind when a later phase fails. PostgreSQL and PGlite also expose different transaction APIs, which must not leak into application code.

Object-store writes cannot share the database transaction. Treating them as if they were distributed-transaction participants would create a false durability guarantee.

## Decision

1. The provider-neutral SQL contract exposes transaction(callback, options).
2. The managed-Postgres adapter acquires one dedicated pool client, issues an allow-listed BEGIN isolation statement, runs the callback against that client, commits only after the callback succeeds, rolls back on every error, and releases the client in finally.
3. The PGlite adapter delegates to its native transaction callback and maps the same SQL contract into it. Nested transactions are rejected rather than silently pretending to provide savepoints.
4. Database publication code will put all metadata/index writes in one callback and advance a current-generation pointer last. A failed callback must leave no visible partial generation.
5. Object writes remain staged outside the database transaction. An outbox/reconciler will reconcile staged objects and database rows in the object/job-plane work packages.
6. Tenant and request context will be added to the transaction before RLS is enabled. No service-role client is exposed to request code.

## Consequences

The application gains one testable commit/rollback boundary, while object-store failure remains an explicitly modeled reconciliation state. A connection is held for the callback duration, so callbacks must remain bounded and must not perform parser or network work.

The current branch includes the adapter and a forced-failure regression test. Generation publication integration is intentionally deferred until tenant/runtime invariants and the object/job plane are ready.

## Rollback

Revert the adapter and its call sites as one branch-level change. Do not run a compensating data delete against a live database. Any deployed migration remains forward-only and requires a separately reviewed repair migration.
