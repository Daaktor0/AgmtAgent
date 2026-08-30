# Agmt Proof implementation status

**Baseline:** current `main` before JOB-01/OBJ-01 at `c75ef227eb0ee8e7745de4d625de2ff5123bfa82` (30 August 2026)  
**Latest merged main:** `0a020084d1ef67beb9e48656bf885386b304be15` via PR #21  
**Latest implementation branch:** `proof-production-hardening/fnd02-reconciliation` at `3b3436d5ae07119a3cb98d8490f548f0bd5ff946` (FND-02 implementation; merged via PR #21)  
**Scope:** repository-side production hardening plus one explicitly authorized schema migration to an empty, non-confidential Supabase Mumbai sandbox. No AWS resources, production database, confidential documents, live authentication provider, or object bytes were changed.

## Baseline verification

- `AGENTS.md`: absent from current `main` (repository API returned 404); no baseline repository-local agent instructions were available. The hardening branch adds scoped guidance at `web/AGENTS.md` for the checked-in web workspace.
- `docs/AGMT_PROOF_PRODUCTION_LAUNCH_BLUEPRINT.md` is present and was read in full before code changes.
- The audited findings are reproducible from current source: automatic test-workspace access, baked preview OAuth credentials, database-derived deployed auth fallback, build-time migration coupling, synchronous/base64 ingestion, sequential persistence, and PostgreSQL document blobs.
- Current baseline is not launch-ready for confidential documents.
- The user-selected Supabase Free project in Mumbai is the current empty integration sandbox. Its schema migration was applied and independently verified; no credentials, connection strings, private keys, or production documents are stored in the repository. It must not receive confidential documents until FND-04 and the remaining launch gates pass.

## Evidence from the latest code head

At verified implementation code head 3b3436d5ae07119a3cb98d8490f548f0bd5ff946 (FND-02 transaction outcome and external-publication reconciliation batch; PR #21 open):

- Web Proof workflow 33339154677: route/build verification, typecheck, DB transaction hardening, production build, Proof golden corpus, and the full web suite all passed.
- The full web test run reported 111/111 tests passed with 0 failures; Eval workflow 33339154680 passed.
- Managed Postgres and PGlite transaction adapters now distinguish confirmed rollback from ambiguous commit/rollback outcomes. The upload path refuses destructive compensation when the outcome is unknown.
- The provider write returns an exact tenant/key/provider/storage/integrity/envelope artifact. Confirmed rollback records an idempotent staged manifest and deletes only after exact ciphertext verification; provider or database failure leaves a durable reconciliation handoff when possible.
- Fault-injection regressions cover rollback confirmation, commit transport uncertainty, record-before-delete ordering, cleanup failure, record-only unknown outcomes, exact-delete fallback, and unresolved dual failure.
- No credentials, connection strings, private keys, production documents or environment files are present in the changed repository paths.

## Package ledger

| Package | Status | Evidence and remaining work |
|---|---|---|
| FND-01 | Implemented; human approval pending | Baseline ADR, supported DOCX matrix, invariants, state boundaries, non-goals, gate ownership and stop conditions are recorded. |
| SEC-01 | Repository changes implemented; security review pending | Test-workspace access, preview secrets and legacy duplicate paths are removed; deployed auth requires explicit configuration. |
| FND-05 | Implemented repository-side; release rehearsal pending | Builds are separated from manual forward-only migrations with SHA-256 ledger validation; least-privilege release credential rehearsal remains open. |
| FND-02 | Repository transaction/reconciliation implemented; production rehearsal pending | Provider-neutral transactions, rollback/release behavior, atomic Matter/document publication, exact external artifacts and fail-closed reconciliation are tested. Managed Supabase/S3 fault rehearsal, worker reconciler and operational orphan scans remain open. |
| FND-03 | Expand migration implemented; contract and historical review pending | Tenant/member tables, nullable tenant columns, composite keys/FKs and empty-sandbox rehearsal pass; validation and NOT NULL contract are intentionally deferred. |
| FND-04 | Repository and empty-sandbox implementation complete; production security review pending | 32/32 public tables are forced-RLS with 108 policies; runtime roles are non-login/non-bypass; PGlite and real synthetic crossover probes pass. Login-role provisioning, managed sandbox probe-membership cleanup and owner review remain open. |
| JOB-01 | Implemented repository-side; empty-sandbox schema verified; production worker review pending | Tenant-bound upload/job/outbox state machines, guarded transitions, leases, idempotency and RLS are implemented and tested. Isolated worker execution and production IAM remain open. |
| OBJ-01 | Implemented repository-side; empty-sandbox schema verified; production object-store review pending | Server-only provider boundary, immutable tenant-hashed keys, integrity checks and metadata-only manifests are implemented and tested. Direct upload, malware quarantine, S3 wiring and KMS remain open. |
| OBJ-02 | Repository contract implemented; live integration pending | Bounded DOCX multipart planning, tenant/Matter ownership binding, short-lived HTTPS grants and exact completion integrity are tested. Live S3 presign/complete/abort wiring remains open. |
| OBJ-03 | Repository contract implemented; live integration pending | Exact clean-result acceptance, fail-closed threat/failure handling and duplicate/conflict behavior are tested. GuardDuty/EventBridge authenticity and quarantine wiring remain open. |
| WRK-01 | Repository contract implemented; live integration pending | Strict metadata-only worker envelope and bounded duplicate/crash/timeout/fatal dispositions are tested. Lambda/SQS/DLQ isolation, IAM, egress and image controls remain open. |
| WRK-02 | Repository-side boundary implemented; worker/resource proof pending | Central-directory preflight, bounded extraction, path/record validation and hostile ZIP regressions are implemented. Isolated-worker CPU/memory proof, adversarial corpus, image and IAM controls remain open. |
| WRK-03 | Repository-side capability inventory implemented; differential review pending | Content types, relationship targets, external-target policy, notes, bookmarks and sections are inventoried with fail-closed parsing. Word/differential golden coverage and broader external/active-content review remain open. |
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

## WRK-02 implementation evidence

- `zip-safety.ts` inspects the EOCD and central directory before `JSZip.loadAsync`; it rejects ZIP64/multi-disk/encrypted/unsupported packages, unsafe or ambiguous paths, duplicate names, symlinks, local-header mismatches, overlapping records and out-of-bounds data.
- Central metadata bounds each entry to 32 MiB, the package to 150 MiB, the central directory to 4 MiB and the compression ratio to 250. Required XML is read only after preflight and must match declared size, CRC and strict UTF-8 decoding.
- Web Proof workflow `33337574208` and Eval workflow `33337574224` passed at the code head above; the full web suite reported 102/102 tests, including the new expansion-bomb, traversal and unsupported-compression regressions.
- WRK-02 is not complete under the blueprint until the isolated worker demonstrates CPU/memory/scratch/timeout bounds against the adversarial corpus and production image/IAM controls are reviewed. No migration or external service changed. See [ADR 0009](adr/0009-pre-expansion-zip-safety.md).

## WRK-03 implementation evidence

- `docx-v2.ts` validates content types and relationship parts before extracting the main story, never follows external targets, resolves internal targets within the package and rejects missing/escaping relationships and active-content types.
- The extracted document now reports evaluated capability states for package metadata, relationships, external relationships, active content, comments, revisions, fields, tables, headers/footers, footnotes, endnotes, bookmarks and sections. Footnote/endnote paragraphs carry story-specific source anchors.
- Web Proof workflow `33338227000` and Eval workflow `33338227015` passed at the code head above; the full web suite reported 104/104 tests. The new regressions cover external relationship inventory, note extraction, bookmarks, sections and relationship traversal.
- WRK-03 remains open under the blueprint until differential Word/golden inventories and the broader external/active-content corpus pass, and until worker isolation/resource controls are reviewed. This batch made no migration or external-service change. See [ADR 0010](adr/0010-ooxml-capability-inventory.md).

## FND-02 transaction and reconciliation evidence

- The provider-neutral adapter exposes transaction callbacks with allow-listed isolation levels. Managed Postgres pins one client, configures tenant context, rolls back confirmed callback/configuration failures, releases in finally, and reports commit/rollback uncertainty instead of pretending it is safe to compensate. PGlite reports the same outcome class for local parity.
- Matter creation publishes its Matter, mandate, active pointer and audit row in one callback. Document upload parses before acquiring a connection, then publishes metadata, document/version, canonicalisation rows, capabilities, current pointer and audit row atomically.
- putBlob carries the exact external publication artifact. The upload catch path records that artifact outside the failed transaction; only a confirmed rollback permits exact provider cleanup. Unknown outcomes are record-only and never delete rows or bytes.
- Web Proof workflow 33339154677 and Eval workflow 33339154680 passed at the code head above; the full web suite reported 111/111 tests.
- This package remains open under the blueprint until the managed Supabase/S3 publication path has injected failure rehearsal, the durable worker reconciler handles staged/unreferenced objects idempotently, and production operational/security review passes. See ADR 0011.

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
- FND-02 repository-side injected-failure and exact object-reconciliation coverage is implemented. It remains a launch blocker until the managed Supabase/S3 path is rehearsed with injected failures and the later worker/object-job reconciler proves idempotent staged-orphan handling.
- FND-03 contract work must stop on any ambiguous owner, missing principal, tenant mismatch or unverifiable historical ciphertext/key. No historical ciphertext migration has been attempted.
- The green `229/229` repository suite closes only the repository/template gate. It does not waive the blueprint P0 precision/recall, exact evidence, parser, export, lifecycle, DR, operational or production-authentication gates.
- WRK-02 and WRK-03 repository-side parser controls are implemented, but worker resource proof, adversarial/differential corpora and production security review remain open. The next dependency lane is ING-01 only after FND-02 transaction/reconciliation review; live OBJ-02/OBJ-03/WRK-01 wiring must still stop for owner-approved AWS/data-plane setup and review.
- Production use remains blocked until the blueprint's P0, evidence, tenant, parser, export, lifecycle, DR, security and operational gates pass.
