# ADR 0006: server-derived tenant RLS runtime context

- **Status:** Accepted for repository implementation and empty-sandbox rehearsal; production role provisioning and security review pending
- **Date:** 30 August 2026
- **Decision owners:** Product/engineering owner and implementation agent

## Context

FND-03 adds tenant columns and composite relationships but leaves them nullable for
an expand phase. The application still needs a request boundary that cannot take
tenant identity from browser input and cannot accidentally run tenant queries
without a database-enforced context. Better Auth identity tables also need a
separate connection boundary from application data.

## Decision

- The auth middleware resolves the user only from the verified Better Auth
  session (or the explicitly bounded local synthetic identity) and calls the
  authenticated database-context helper.
- The context helper inspects all memberships with tenant_id initially null,
  bootstraps one identity-owned tenant on first use, and fails closed for
  multiple, suspended, deleted or unsupported memberships.
- The application Postgres adapter accepts only the allow-listed
  AGMT_DB_ROLE values agmt_app, agmt_worker and agmt_support, sets that role on
  each acquired client, and starts a transaction whenever a request context
  exists.
- Transaction-local settings carry only server-derived user, tenant, support
  ticket and narrowly scoped authentication-operation values. RLS policies use
  invoker-safe functions over those settings.
- Better Auth receives a separate BETTER_AUTH_DATABASE_URL (or
  AUTH_DATABASE_URL) for the agmt_auth role boundary. The application role
  receives no grant on the Better Auth core tables.
- Support is read-only and requires an explicit tenant plus a non-empty ticket
  in the trusted server context. It has no application write policy.
- Supabase Auth, browser database access and service-role credentials are not
  part of this design.

## Consequences

- A deployment needs separate, least-privileged database login roles/membership
  provisioned by an operator; this repository does not create login users or
  store credentials.
- Existing application handlers can keep using getSql() because the adapter
  inherits the AsyncLocalStorage context; direct application access without a
  context is denied by RLS.
- First-use account bootstrap is a two-phase relational operation: create the
  identity account, create the tenant/member rows, then create the tenant-bound
  entitlement. The membership sequence is transactional.
- The migration enables and forces RLS on all current public tables, including
  Better Auth core and operational metadata. Core access is granted only to the
  separate auth role; _migrations remains release-process-only.
- This does not complete object isolation, worker execution, encryption-key
  migration, parser isolation, evidence correctness, export fidelity, lifecycle,
  DR or launch approval.

## Rollback and stop conditions

- There is no destructive down migration. If a policy defect appears, stop
  application traffic, preserve the prior signed application artifact and ship
  a reviewed forward-fix migration.
- Do not apply this migration to a non-empty environment until historical
  tenant/ciphertext review and an explicit security review pass.
- Do not configure a web process with a database-owner credential or a shared
  auth/application login.
