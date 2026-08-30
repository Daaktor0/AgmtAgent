# Supabase sandbox runbook

This repository now treats Supabase as the managed PostgreSQL layer for the
AGMT sandbox. The target is the user-created Mumbai Free project. This runbook
contains no project credentials, connection strings, keys or document data.

## Service boundary

- The application connects to PostgreSQL through the standard pg driver.
  Supabase Auth and Supabase Storage are not used by the current web surface.
- The migration runner is a release operation. It is separate from the web
  build and must not run from a build hook.
- The application runtime uses a server-derived database context and
  AGMT_DB_ROLE=agmt_app. The migration identity and the Better Auth identity
  must not be the browser's anon key or a client-side secret.
- object_manifest stores object metadata and envelope metadata only. The
  deployed runtime fails closed until an explicitly installed object-store
  adapter is available. The in-memory provider is for local synthetic tests and
  must never receive confidential documents in a deployed environment.
- No AWS account or resource is needed for local parser tests, schema
  inspection, or synthetic Supabase database tests. A separately approved AWS
  stage account is required before direct S3 upload, malware quarantine and
  isolated worker integration can be enabled.

## Sandbox safety

Use this Free project only with synthetic or disposable documents until FND-04,
FND-02, parser, evidence, export, lifecycle, DR and operational gates are
approved. Do not connect a client's document store, real OAuth provider or
production database to it.

Never commit .env files, connection strings, database passwords, OAuth
secrets, encryption keys or private keys. Never prefix server secrets with
VITE_; Vite variables are client-visible.

## Configure a local persistent connection

In the Supabase dashboard, open the project's Connect panel and copy a
server-side PostgreSQL connection string into your local environment. The
repository does not need the project API URL for its PostgreSQL adapter.

Set the following locally, outside Git:

    DATABASE_URL=<server-side Supabase PostgreSQL connection string>
    AGMT_DB_ROLE=agmt_app

For the one-time sandbox migration, use a release-only connection identity
with the DDL authority required by the migration runner. Do not use that
identity as the web runtime identity. In a controlled deployed environment,
provision a least-privilege login and membership outside this repository; the
checked-in agmt_app, agmt_worker and agmt_support roles are non-login runtime
group roles.

For a deployed Better Auth instance, also provide a separate server-only
connection and secret:

    BETTER_AUTH_DATABASE_URL=<dedicated Better Auth PostgreSQL connection>
    BETTER_AUTH_SECRET=<random secret stored in the host secret manager>

The application encryption key is separate from both database credentials:

    AGMT_ENCRYPTION_KEY=<random encryption secret stored in the host secret manager>

Do not copy these values into a chat message or GitHub issue. The repository
requires the separate Better Auth connection and explicit secret in deployed
environments.

## Apply or verify repository migrations

From web/, run the release migration command only from a controlled release
environment:

    npm ci
    npm run db:migrate:release

The runner reads DATABASE_URL, then applies pending migrations in filename
order. Each migration and its checksum are recorded in _migrations. A failed
migration is rolled back at its transaction boundary; do not manually delete
ledger rows or edit an applied migration. Ship a reviewed forward migration if
a correction is needed.

The current sandbox has the repository migrations through
0005_job_object_plane. The latest additive migration does not copy, decrypt,
rewrite, delete or re-key legacy object_blob bytes.

## Repository gates

Run these commands before using the sandbox for a test session:

    npm test
    npm run typecheck
    npm run build
    npm run check:auth

A local run without DATABASE_URL uses the embedded PGlite test path. A
persistent run with DATABASE_URL uses Supabase PostgreSQL, but the application
still requires an appropriate server runtime role and context. Passing these
commands does not authorize confidential-document use.

## Current launch boundary

The repository-side database, RLS, object metadata, job state, parser safety and
transaction/reconciliation contracts are implemented and tested. The following
remain deliberately blocked:

- live Supabase/S3 publication fault rehearsal and durable orphan reconciliation;
- direct upload, malware-provider authenticity and isolated worker execution;
- historical ciphertext/key disposition and any re-keying operation;
- production authentication/provider configuration and non-empty tenant review.

Do not enable deployed uploads by setting the memory provider. Stop and obtain
the separate infrastructure/security decision before adding AWS resources,
production authentication, live buckets, malware services or worker IAM.

See the Supabase database migrations guide:
https://supabase.com/docs/guides/local-development/database-migrations

See the Supabase regions guide:
https://supabase.com/docs/guides/platform/regions
