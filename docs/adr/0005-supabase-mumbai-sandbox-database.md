# ADR 0005: Supabase Mumbai sandbox database target

- **Status:** Accepted for an empty non-confidential test sandbox; production approval pending
- **Date:** 30 August 2026
- **Decision owners:** Product/engineering owner and implementation agent

## Context

The product owner selected a Supabase Free project in Mumbai for initial testing and explicitly authorized applying the repository schema. The project was independently checked immediately before the write and was healthy with no public tables and no recorded migrations. The blueprint still requires database-enforced tenant isolation before confidential documents are accepted.

## Decision

- Use the selected Supabase Mumbai project as the current empty integration sandbox.
- Apply the repository migrations in filename order: `0001_auth`, `0002_slice0`, `0003_slice2`, and `0003_tenant_integrity_expand`.
- Keep the application database interface provider-neutral: standard PostgreSQL via `pg`, repository SQL migrations, and the application SHA-256 ledger. Do not add Supabase-specific business logic.
- Do not use Supabase Auth, Storage, Edge Functions, or public document access as part of this decision. Those capabilities remain separate design work.
- Do not place a project identifier, connection string, publishable key, service key, password, or document in the repository.
- Treat the project as synthetic/non-confidential only until FND-04 installs and tests RLS/runtime roles and the remaining launch gates pass.

## Migration evidence

The migrations were applied through the authorized Supabase migration interface after the empty-project preflight. Each migration was recorded in both Supabase migration history and the application `_migrations` table with the checksum of the exact repository file:

| Migration | SHA-256 |
|---|---|
| `0001_auth` | `463be3fcafc38a1ca6a10dd558f0a9ba406086901a46a41c0da5596e514de38d` |
| `0002_slice0` | `44e11c36779ecc18dae4b11fd73c89c667043dae71b797a2e2cc80f8dc2f5851` |
| `0003_slice2` | `c761b289c12f4b6da4994b74b1781293a17d32fcae9c2123e7ee879d71b6b01f` |
| `0003_tenant_integrity_expand` | `32627ad1bf43f402cff7d6483df9323c6cd5078b662ec831824bdc82d9566294` |

Post-apply verification found 32 public tables, zero user/document rows, four application-ledger rows, and 65 tenant foreign-key constraints. All public tables currently report RLS disabled; the resulting security-advisor errors are an expected launch blocker tracked by FND-04.

## Consequences

- The app can use a standard Supabase Postgres connection once a secret-managed `DATABASE_URL` is configured by the owner; no credential is needed in this repository.
- There is no historical ciphertext, object, or production data to migrate in this sandbox, so no unrecoverable-data decision was triggered.
- The expand migration remains forward-only and has no repository down migration. Any later contract change must be additive/forward-fix, rehearsed against a copy, and separately approved before non-empty or production use.
- The sandbox is not a production deployment and must not receive confidential agreements while RLS, object storage, malware scanning, worker isolation, evidence validation, export, lifecycle, DR, and operational gates remain incomplete.
- AWS is intentionally not provisioned for this test phase; it remains required for the blueprint's production data plane.
