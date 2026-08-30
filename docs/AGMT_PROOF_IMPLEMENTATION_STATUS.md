# Agmt Proof implementation status

**Baseline:** current `main` before JOB-01/OBJ-01 at `c75ef227eb0ee8e7745de4d625de2ff5123bfa82` (30 August 2026)  
**Latest merged main:** `780503abb38318e24f5d5ec75bc0f194f04b5707` via PR #15  
**Latest implementation branch:** `proof-production-hardening/upload-quarantine-worker-contracts` at `b34872c88093e20dcfafd9dd922e392b863b08fc` (merged via PR #15)  
**Scope:** repository-side production hardening plus one explicitly authorized schema migration to an empty, non-confidential Supabase Mumbai sandbox. No AWS resources, production database, confidential documents, live authentication provider, or object bytes were changed.

## Baseline verification

- `AGENTS.md`: absent from current `main` (repository API returned 404); no baseline repository-local agent instructions were available. The hardening branch adds scoped guidance at `web/AGENTS.md` for the checked-in web workspace.
- `docs/AGMT_PROOF_PRODUCTION_LAUNCH_BLUEPRINT.md` is present and was read in full before code changes.
- The audited findings are reproducible from current source: automatic test-workspace access, baked preview OAuth credentials, database-derived deployed auth fallback, build-time migration coupling, synchronous/base64 ingestion, sequential persistence, and PostgreSQL document blobs.
- Current baseline is not launch-ready for confidential documents.
- The user-selected Supabase Free project in Mumbai is the current empty integration sandbox. Its schema migration was applied and independently verified; no credentials, connection strings, private keys, or production documents are stored in the repository. It must not receive confidential documents until FND-04 and the remaining launch gates pass.

## Evidence from the latest code head

At verified implementation code head `b34872c88093e20dcfafd9dd922e392b863b08fc` (merged into `main` via PR #15; repository contract batch):

- Web Proof workflow `33336709469`: route/build verification, typecheck, DB transaction hardening, production build, Proof golden corpus, and the full web suite all passed (99/99 full-suite tests).
- Eval workflow `33336709477` passed. The full web suite includes the JOB-01/OBJ-01 object-store, job-state, RLS and migration regression tests.
- The deterministic DOCX fixture now uses fixed entry metadata and uncompressed ZIP entries, so byte hashes are stable across repeated CI runs.
- FND-04 tenant-bound write repairs cover the existing Matter/document/audit paths required by forced RLS; the static regression test rejects any tenant-owned insert that omits `tenant_id`.
- JOB-01/OBJ-01 tests cover immutable object keys, tenant-hashed storage paths, byte/hash integrity, S3 adapter boundaries, job transitions, lease expiry, idempotency, additive migration safety, and PGlite RLS crossover behavior.
- No credentials, connection strings, private keys, production documents or environment files are present in the changed repository paths.
## Package ledger

| Package | Status | Evidence and remaining work |
|---|---|---|
| FND-01 | Implemented; human approval pending | Baseline ADR, supported DOCX matrix, invariants, state boundaries, non-goals, gate ownership and stop conditions are recorded. |
| SEC-01 | Repository changes implemented; security review pending | Test-workspace access, preview secrets and legacy duplicate paths are removed; deployed auth requires explicit configuration. |
| FND-05 | Implemented repository-side; release rehearsal pending | Builds are separated from manual forward-only migrations with SHA-256 ledger validation; least-privilege release credential rehearsal remains open. |
| FND-02 | Relational publication integrated; fault-injection/object reconciliation pending | Provider-neutral transactions, rollback/release behavior, atomic Matter/document publication and parser-before-transaction boundaries are tested. |
| FND-03 | Expand migration implemented; contract and historical review pending | Tenant/member tables, nullable tenant columns, composite keys/FKs and empty-sandbox rehearsal pass; validation and NOT NULL contract are intentionally deferred. |
| FND-04 | Repository and empty-sandbox implementation complete; production security review pending | 32/32 public tables are forced-RLS with 108 policies; runtime roles are non-login/non-bypass; PGlite and real synthetic crossover probes pass. Login-role provisioning, managed sandbox probe-membership cleanup and owner review remain open. |
| JOB-01 | Implemented repository-side; empty-sandbox schema verified; production worker review pending | Tenant-bound upload/job/outbox state machines, guarded transitions, leases, idempotency and RLS are implemented and tested. Isolated worker execution and production IAM remain open. |
| OBJ-01 | Implemented repository-side; empty-sandbox schema verified; production object-store review pending | Server-only provider boundary, immutable tenant-hashed keys, integrity checks and metadata-only manifests are implemented and tested. Direct upload, malware quarantine, S3 wiring and KMS remain open. |
| OBJ-02 | Repository contract implemented; live integration pending | Bounded DOCX multipart planning, tenant/Matter ownership binding, short-lived HTTPS grants and exact completion integrity are tested. Live S3 presign/complete/abort wiring remains open. |
| OBJ-03 | Repository contract implemented; live integration pending | Exact clean-result acceptance, fail-closed threat/failure handling and duplicate/conflict behavior are tested. GuardDuty/EventBridge authenticity and quarantine wiring remain open. |
| WRK-01 | Repository contract implemented; live integration pending | Strict metadata-only worker envelope and bounded duplicate/crash/timeout/fatal dispositions are tested. Lambda/SQS/DLQ isolation, IAM, egress and image controls remain open. |
| WRK-02 | Not started; depends on WRK-01 | Pre-decompression central-directory and bounded extraction controls are not implemented. |
| WRK-03 | Not started; depends on WRK-02 | Full OOXML relationship/capability model is not implemented. |
| ING-01 | Not started; depends on FND-02/WRK-03/OBJ-01 | Generation staging, validation, atomic publication and reconciliation are not implemented. |
| ING-02 | Not started; depends on ING-01 | Concurrent source/parser uniqueness, locking and idempotent reuse are not implemented. |
| ING-03 | Not started; depends on JOB-01/ING-01 | Lease expiry, age scans and safe orphan/stuck-work reconciliation are not implemented. |
| CRY-01 | Not started; depends on OBJ-01 | Versioned KMS envelope metadata and schema are not implemented. |
| CRY-02 | Not started; depends on CRY-01 | Streaming AES-256-GCM/KMS data-key encryption is not implemented. |
| CRY-03 | Not started; depends on CRY-01 | Legacy ciphertext inventory and decryptability dry-run are not implemented. |
| CRY-04 | Blocked by human decision | Rewrapping historical ciphertext cannot begin without explicit recovery/key-disposition approval. |
| CRY-05 | Not started; depends on CRY-02 | Rotation, break-glass, MFA approval and audit controls are not implemented. |
| CAN-01 | Not started; depends on WRK-03 | Typed identifiers, confidence policy and provenance thresholds are not implemented. |
| CAN-02 | Not started; depends on CAN-01/FND-02 | Final projection/index persistence and confirmation propagation are not implemented. |
| CAN-03 | Not started; depends on CAN-02 | Span-segment invariants, digest checks and reversibility properties are not implemented. |
| EVD-01 | Not started; depends on CAN-03/WRK-03 | Positive/absence evidence schemas and immutable scope manifests are not implemented. |
| EVD-02 | Not started; depends on EVD-01 | Canonical-to-exact-OOXML reconstruction validation is not implemented. |
| EVD-03 | Not started; depends on EVD-01 | Evaluated-scope absence inventory and zero-count proof are not implemented. |
| PRF-01 | Not started; depends on EVD-01 | Signed rule-registry release contract is not implemented. |
| PRF-02 | Not started; depends on PRF-01/EVD-02 | Cross-reference/numbering P0 rules are not rebuilt against final evidence. |
| PRF-03 | Not started; depends on CAN-02/PRF-01 | Definition/use P0 rules are not rebuilt against final indexes. |
| PRF-04 | Not started; depends on WRK-03/EVD-02 | Comments/fields/placeholders/hidden-character P0 rules are not rebuilt. |
| PRF-05 | Not started; depends on EVD-03/CAN-01 | Header/party/signature P0 rules are not rebuilt. |
| PRF-06 | Not started; depends on WRK-01/PRF-01 | Asynchronous truthful/stale-aware Proof execution is not implemented. |
| EXP-01 | Not started; depends on CAN-03/EVD-02 | Canonical-to-OOXML edit planner is not implemented. |
| EXP-02 | Not started; depends on EXP-01 | Comments-only export is not implemented. |
| EXP-03 | Not started; depends on EXP-01 | Accepted tracked-change export is not implemented. |
| EXP-04 | Not started; depends on EXP-02 | Schema, structural, visual and LibreOffice/Word export gates are not implemented. |
| SEC-02 | Not started; depends on SEC-01 | Production email/Google/Microsoft provider configuration is intentionally not performed. |
| SEC-03 | Not started; depends on SEC-02 | Session, CSRF, throttling and recovery hardening remains open. |
| SEC-04 | Not started; depends on SEC-01/WRK-01 | Headers, WAF, SBOM and dependency/image controls remain open. |
| OPS-01 | Not started; depends on FND-01 | Scrubbed telemetry and privacy review remain open. |
| OPS-02 | Not started; depends on OPS-01 | Dashboards, alerts and runbooks remain open. |
| OPS-03 | Not started; depends on FND-03/OBJ-01 | Retention, purge and legal-hold executor remain open. |
| OPS-04 | Not started; depends on OBJ-01/FND-03 | PITR, manifests and two restore drills remain open. |
| OPS-05 | Not started; depends on FND-05/WRK-01 | Environment promotion, signed builds and clean-room recreation remain open. |
| TST-01 | Not started; depends on PRF-01 | Corpus provenance, labels, manifests and licensing/privacy approval remain open. |
| TST-02 | Not started; depends on WRK-02 | Adversarial parser/security corpus remains open. |
| TST-03 | Not started; depends on TST-01/PRF-01 | Precision/recall confidence reporting remains open. |
| TST-04 | Not started; depends on ING-02/FND-04/PRF-06 | Tenant/concurrency/load/E2E release suite remains open. |
| UX-01 | Not started; depends on JOB-01/PRF-06 | Upload/scan/parse/Proof progress and typed failures remain open. |
| UX-02 | Not started; depends on CAN-01 | Risk-based canonical review remains open. |
| UX-03 | Not started; depends on EVD-02/PRF-06 | Explainable/actionable finding workflow remains open. |
| UX-04 | Not started; depends on EXP-02/EXP-04 | Safe export selection/download remains open. |

A package is not marked complete until its acceptance tests, security considerations, definition of done, and relevant full-suite gates pass.

## JOB-01 / OBJ-01 implementation evidence

- `0005_job_object_plane.sql` is additive: it creates `object_manifest`, `upload_intent`, `ingest_job` and `job_outbox` with tenant-bound composite references, idempotency constraints, guarded state fields, lease metadata and forced RLS. It does not alter, copy, decrypt, delete or rewrite `object_blob`.
- `object_manifest` stores provider/key/state/hash/size/envelope metadata only; document bytes are not stored in the new relational plane. The local memory provider is synthetic-data-only, and deployed runtimes fail closed until an explicit S3 adapter is installed.
- The existing server ingestion path now uses the object-store boundary and records a staged manifest; reads require a clean manifest and verify ciphertext and plaintext integrity. The direct multipart upload, malware clean-result and isolated worker gates remain intentionally unfinished.
- Rollback is forward-only: stop the affected artifact, preserve the prior release, and ship a reviewed forward-fix. There is no destructive down migration and no historical ciphertext migration. External orphan reconciliation is a later package requirement.
- The authorized empty Supabase sandbox was migrated and verified at the schema level: 36 public tables, four new JOB/OBJ tables, 16 new package policies, all four new tables RLS-enabled and forced, zero users/documents/object bytes/job rows, and no security-advisor errors beyond the intentional `_migrations` INFO.

## OBJ-02 / OBJ-03 / WRK-01 repository contract evidence

- `direct-upload.ts` enforces supported DOCX type/name, the 25 MiB byte cap, SHA-256 input, bounded expiry, server-derived opaque/quarantine keys, exact tenant/owner/Matter ownership, exact multipart part counts, HTTPS-only grants and exact provider completion hash/size.
- `malware-gate.ts` accepts only `NO_THREATS_FOUND`; threats, failed, unsupported, unknown and malformed results are inaccessible and cannot enqueue ingest. Same-event duplicates are idempotent; conflicting duplicates fail closed.
- `worker-contract.ts` accepts only the versioned metadata envelope, rejects bytes/presigned URLs/unknown fields and bounds retries so duplicate success acknowledges while fatal or exhausted failures dead-letter.
- Web Proof workflow `33336709469` and Eval workflow `33336709477` passed at the code head above; the full web suite reported 99/99 tests. The package rows remain open because live data-plane integration and restricted production security controls are not present.
- This batch made no migration and changed no Supabase schema, external service, production database, authentication configuration or object bytes. See [ADR 0008](adr/0008-upload-quarantine-worker-contracts.md).

## FND-02 transaction design

- The provider-neutral adapter exposes transaction(callback, options) with allow-listed isolation levels.
- Managed Postgres pins one client, begins, runs all relational writes on that client, commits only after success, rolls back on every exception and releases in finally. PGlite uses its native transaction callback; nested transactions are rejected.
- Matter creation publishes its matter, mandate, active pointer and audit row in one callback.
- Document upload parses before acquiring a connection, then publishes metadata, document/version, canonicalisation rows, capabilities, current pointer and audit row atomically. External object writes remain outside the relational transaction and require later reconciliation.
- Fault-injection/object reconciliation coverage remains a prerequisite for closing FND-02.

See [ADR 0003](adr/0003-atomic-database-transaction-boundary.md).

## FND-03 expand/contract design

Expand:

- Add nullable tenant_id columns and indexes to tenant-owned tables.
- Create agmt_tenant and agmt_tenant_member; current bootstrap identity is one tenant owner per verified user.
- Backfill only from existing owner/user identity and fail closed when a principal is missing.
- Add composite parent keys and tenant-scoped foreign keys as NOT VALID so new non-null relationships cannot cross tenants while historical rows remain measurable.

Contract:

- Validate every existing composite relationship and stop on ambiguous owner, missing principal, tenant mismatch or unverifiable historical ciphertext/key.
- Make tenant columns NOT NULL and remove owner-only fallbacks only after the runtime/RLS crossover matrix, historical review and security approval pass.

The expand migration is additive and was applied only to the empty sandbox. It did not delete, decrypt, rewrite, re-key or move document bytes.

See [ADR 0004](adr/0004-tenant-integrity-expand-contract.md).

## Supabase sandbox migration receipt

- Target: the user-selected Supabase Free project in Mumbai; its identifier and URL are intentionally omitted from repository documentation.
- Preflight before 0005: project healthy, five application migrations recorded, 32 public tables, five ledger rows, and zero users, accounts or documents.
- Applied `0004_rls_runtime` from the exact repository file. The application ledger contains checksum `5d4001ff724b6d687486517337485424740d91c1a7a9ff86777e82f71d2f7e69` for `0004_rls_runtime.sql`.
- Applied the exact `0005_job_object_plane.sql` file with checksum `fc9bdb2c863f0002598ee3d43715998270472cc1`. The existing five ledger rows were normalized to the release runner’s exact `.sql` basenames in one metadata-only transaction, and the sixth row was inserted after the DDL succeeded.
- Postflight: 36/36 public tables have RLS enabled and forced; the four new tables have 16 package policies; the four runtime roles remain non-login, non-superuser, non-createdb, non-createrole, non-inherit, non-replication and non-bypassrls; application user/document/object/job counts remain zero.
- The synthetic Supabase crossover probe passed same-tenant visibility, cross-tenant write denial, missing-context denial and support read-only behavior. Probe rows were rolled back.
- The probe required temporary membership grants to the administrative postgres role. Those grants were non-effective because SET and INHERIT were false, but the managed grantor prevents the ordinary SQL channel from revoking them. A one-off sandbox cleanup record exists in Supabase management history; owner-level cleanup is still required and no application ledger row was added.
- The security advisor no longer reports the prior RLS-disabled errors. It reports only an INFO for the intentionally release-only `_migrations` table having no policy. The performance advisor reports existing/indexing and multiple-policy follow-ups; they are not security or launch waivers.
- No AWS resources, external auth providers, storage buckets, production services, ciphertext or object bytes were changed.

See [ADR 0005](adr/0005-supabase-mumbai-sandbox-database.md), [ADR 0006](adr/0006-tenant-rls-runtime-context.md) and [ADR 0007](adr/0007-job-object-plane.md).

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

- Do not treat the Supabase sandbox as clean until the two temporary postgres role-membership rows are removed by an owner-level managed-admin action. Do not grant runtime roles to a shared administrator in a test or production environment.
- FND-04 remains pending production role provisioning, connection-role review, non-empty crossover review and explicit security approval.
- FND-02 still needs injected-failure integration coverage around the production publication path and the later object/job-plane reconciliation contract.
- FND-03 contract work must stop on any ambiguous owner, missing principal, tenant mismatch or unverifiable historical ciphertext/key. No historical ciphertext migration has been attempted.
- The green `229/229` repository suite closes only the repository/template gate. It does not waive the blueprint P0 precision/recall, exact evidence, parser, export, lifecycle, DR, operational or production-authentication gates.
- The next dependency-ready repository lane is direct upload/quarantine and isolated worker controls (OBJ-02, OBJ-03, WRK-01). Their production S3/malware/IAM authority is not present and no AWS resource was provisioned; repository interfaces may proceed, but live wiring must stop for owner setup/review.
- Production use remains blocked until the blueprint's P0, evidence, tenant, parser, export, lifecycle, DR, security and operational gates pass.
