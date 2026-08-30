# Supabase sandbox setup

This repository uses Supabase as standard managed PostgreSQL for the current
Mumbai test sandbox. It does not use Supabase Auth, Storage, Edge Functions or
the browser Supabase client. Document bytes remain outside PostgreSQL in the
planned AWS data plane; that data plane is not provisioned yet.

The sandbox is not approved for confidential documents. The current schema has
RLS disabled on its public tables while FND-04 is pending.

## Required configuration

Get connection details from the Supabase Dashboard **Connect** panel. Keep the
connection string in a secret manager or an ignored local environment store; do
not commit it or paste it into chat.

The server-side application accepts:

- `DATABASE_URL` (preferred), or `POSTGRES_URL` / `POSTGRES_PRISMA_URL`
  as compatibility names.
- `BETTER_AUTH_SECRET` with at least 256 bits of random entropy in deployed
  environments.
- `GROK_AUTH_CLIENT_ID` and `GROK_AUTH_CLIENT_SECRET` when Grok-brokered
  OAuth is enabled.
- `GROK_AUTH_ISSUER`, `BETTER_AUTH_URL` and `AGMT_PUBLIC_URL` only when
  their non-default values are required.

Use the Supabase connection mode appropriate to the process. Supabase documents
direct or session-capable connections for migration/long-lived work and its
pooler transaction mode for short-lived serverless traffic. Keep SSL enabled;
use the strongest certificate-verifying mode that the deployment can support.
See the [Supabase Postgres connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres).

## Apply or verify the schema

Migrations are forward-only and are deliberately separate from application
builds. The release command is:

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

The empty sandbox was migrated and verified under
[ADR 0005](adr/0005-supabase-mumbai-sandbox-database.md). No user rows,
document rows, ciphertext or object bytes were present at that time.

## Safe testing boundary

Until FND-04 and the blueprint launch gates pass:

- Use synthetic fixtures only.
- Do not upload client, employee, health, financial or other confidential
  documents.
- Do not configure live OAuth providers or put production secrets in this
  project.
- Do not treat the Supabase URL, an anon key or a service-role key as a
  substitute for the server-side database secret.

No AWS account or AWS resource is needed for this sandbox schema test. AWS
becomes necessary only when the later object-storage, malware quarantine,
worker, KMS and queue packages are explicitly approved and implemented.
