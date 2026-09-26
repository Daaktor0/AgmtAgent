# ADR 0007: durable job plane and metadata-only object manifests

- **Status:** Accepted for repository implementation and empty-sandbox rehearsal; direct upload, malware, worker, KMS and production security review pending
- **Date:** 30 August 2026
- **Decision owners:** Product/engineering owner and implementation agent
- **Packages:** JOB-01, OBJ-01

## Context

The FND-04 runtime boundary now requires every application write to carry a server-derived tenant context and every public table to be protected by forced RLS. The prior object path stored encrypted document bytes in PostgreSQL and had no durable upload/job state or safe retry boundary. The blueprint requires immutable object identities, tenant-scoped idempotency, leases, outbox state and a clean-result gate before parsing or Proof.

## Decision

- Add `object_manifest`, `upload_intent`, `ingest_job` and `job_outbox` in one additive forward-only migration. Every row is tenant-bound, member-bound where applicable, and protected by composite tenant constraints and forced RLS.
- Use guarded state transitions, tenant-scoped idempotency keys, transactional job/outbox creation, worker-only leases and expected-lease-token completion. Application, worker and support policies are separate; support is read-only and ticket-scoped.
- Put bytes behind a server-only `ObjectStore` interface. Storage keys hash the tenant identifier and include only the immutable object key; put/get paths verify byte size and SHA-256, reject changed retries and tombstone deleted keys.
- Keep the memory provider for local synthetic tests only. The S3 implementation is an injected adapter boundary; no AWS SDK credential, bucket, KMS key or live service is configured by this ADR. Deployed runtimes fail closed when an explicit provider is not installed.
- Store only provider/key/state/hash/size and envelope metadata in `object_manifest`. The migration does not alter, copy, decrypt, delete, re-key or rewrite legacy `object_blob` rows. Historical ciphertext and key disposition require a separate human decision.

## Sandbox evidence

The exact `0005_job_object_plane.sql` was applied to the explicitly authorized empty Supabase sandbox after preflight. Verification found 36 public tables, four new JOB/OBJ tables, 16 policies for those tables, forced RLS on all four, zero users/documents/object bytes/job rows, and only the intentional release-only `_migrations` no-policy security INFO. The application migration ledger was normalized to exact `.sql` basenames and contains the new file checksum.

## Consequences

- Existing server ingestion now has a metadata-only relational publication boundary and clean-state reads; it is not a claim that direct multipart upload, malware scanning or worker isolation is complete.
- External object writes can outlive a rolled-back relational transaction, so reconciliation and safe orphan cleanup remain required before production use.
- There is no down migration. On a defect, stop the affected artifact, preserve the prior release and ship a reviewed forward-fix. Do not delete or rewrite historical ciphertext as a rollback shortcut.
- OBJ-02, OBJ-03 and WRK-01 require an owner-approved AWS/data-plane setup and restricted IAM design. This repository may implement/test their boundaries without provisioning live resources.

## Stop conditions

- Do not place confidential documents in the sandbox or memory provider.
- Stop before applying this migration to a non-empty environment until tenant, ciphertext/key and recovery review passes.
- Stop before any historical decrypt/rewrap/delete operation; it may make data unrecoverable.
- Stop before live S3, malware, KMS or queue wiring when external credentials or service authority are required.
