# Supabase sandbox setup

This repository uses Supabase as standard managed PostgreSQL for the current
Mumbai test sandbox. It does not use Supabase Auth, Storage, Edge Functions or
the browser Supabase client. Document bytes remain outside PostgreSQL in the
planned AWS data plane; that data plane is not provisioned yet.

The sandbox is not approved for confidential documents. FND-04 RLS is applied
to the empty schema, but production role provisioning, security review and a
small owner-level cleanup of the synthetic probe membership metadata remain
open.

## Required configuration

Get connection details from the Supabase Dashboard Connect panel. Keep the
connection string in a secret manager or an ignored local environment store; do
not commit it or paste it into chat.

The server-side application accepts:

- `DATABASE_URL` (preferred), or `POSTGRES_URL` / `POSTGRES_PRISMA_URL` as
  compatibility names for the application database.
- `AGMT_DB_ROLE=agmt_app` for the web application. Worker and support processes
  must use their explicitly provisioned `agmt_worker` or `agmt_support` role.
  This value is server-only and is never taken from browser input.
- `BETTER_AUTH_DATABASE_URL` (preferred) or `AUTH_DATABASE_URL` pointing to a
  separate least-privilege login/membership for the `agmt_auth` group role.
  Do not reuse the application login. The migration creates only non-login
  group roles; an operator must provision login roles and memberships outside
  the repository without committing credentials.
- `BETTER_AUTH_SECRET` with at least 256 bits of random entropy in deployed
  environments.
- `GROK_AUTH_CLIENT_ID` and `GROK_AUTH_CLIENT_SECRET` when Grok-brokered OAuth
  is enabled.
- `GROK_AUTH_ISSUER`, `BETTER_AUTH_URL` and `AGMT_PUBLIC_URL` only when their
  non-default values are required.

Use the Supabase connection mode appropriate to the process. Supabase documents
direct or session-capable connections for migration/long-lived work and its
pooler transaction mode for short-lived serverless traffic. Keep SSL enabled;
use the strongest certificate-verifying mode that the deployment can support.
See the [Supabase Postgres connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres).

## Apply or verify the schema

Migrations are forward-only and deliberately separate from application builds.
The release command is:

```text
npm run db:migrate:release
```

Run it only against the intended isolated sandbox or an approved release
environment, with `DATABASE_URL` supplied by the secret manager. The runner
records a SHA-256 checksum for every applied file in `_migrations` and fails
closed if an applied file is changed, unknown or legacy-unchecksummed.

The currently reviewed schema files are:

1. `0001_auth.sql`
2. `0002_slice0.sql`
3. `0003_slice2.sql`
4. `0003_tenant_integrity_expand.sql`
5. `0004_rls_runtime.sql`

The empty sandbox has all five application ledger entries. The FND-04
migration leaves all 32 public tables enabled and forced for RLS, with
runtime access granted only to the reviewed non-login role model. The
Supabase security advisor no longer reports RLS-disabled errors; the
release-only `_migrations` table is intentionally not queryable by runtime
roles and may produce an informational no-policy notice.

A synthetic crossover probe passed on the sandbox and left zero probe rows.
The probe temporarily granted two runtime roles to the administrative postgres
role; those memberships have SET and INHERIT false but remain in metadata due
the managed grantor. Do not reproduce this outside a disposable sandbox. An
owner-level cleanup is required before treating the sandbox as fully clean.

## Safe testing boundary

Until FND-04 and the blueprint launch gates pass:

- Use synthetic fixtures only.
- Do not upload client, employee, health, financial or other confidential
  documents.
- Do not configure live OAuth providers or put production secrets in this
  project.
- Do not use a Supabase anon key, service-role key or database-owner
  credential in the web process.
- Do not add login users to the runtime group roles until the security review
  approves the exact connection and membership options.

No AWS account or AWS resource is needed for this sandbox schema test. AWS
becomes necessary only when the later object-storage, malware quarantine,
worker, KMS and queue packages are explicitly approved and implemented.