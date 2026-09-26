# Agmt Proof Production Launch Blueprint

> **Proof scope supersession — 5 September 2026:** `docs/AGMT_PLATFORM_PROOF_SPEC.md` (repository root) controls the temporary Proof release: Agmt platform, upload → tracked/commented DOCX, immutable two-hour content retention, verified accounts and zero LLM calls. Mandatory Matter/mandate/map steps, Review/Mail, historical vault migration, document backups and legal holds are not prerequisites for this path. Preserve unrelated security and design rules. Current tasks and evidence are in `docs/AGMT_PROOF_IMPLEMENTATION_STATUS.md`. Historical requirements below remain context, not the current Proof launch checklist.

- **Status:** Implementation-ready engineering plan
- **Audit date:** 30 August 2026
- **Audited source:** `main` at `a5718aec3facba3f4fba8f49728ff12acaff4986`
- **Scope:** Agmt Proof web product in `web/`; the root Cloudflare/Python Word add-in is a separate legacy surface

This document is the source of truth for taking the current Agmt Proof prototype to a production launch suitable for confidential legal agreements. It deliberately excludes implementation changes made during the audit.

## 1. Executive verdict

Agmt Proof is approximately **35% launch-ready**. That figure measures launch-critical trust, security and operability, not code volume.

The current product has a coherent prototype: Matter creation, DOCX ingestion, deterministic checks, truthful run states, evidence-shaped findings and a usable UI. Current corpus, checks and image-build CI pass. This is enough for internal demonstrations with synthetic documents, not confidential production agreements.

The five launch blockers are:

1. **Evidence can be wrong while validation passes.** Several rules attach findings to unrelated body text, and validation only establishes that a selected canonical substring exists. Confirmation also persists proposal-era span maps and pre-confirm definition/use indexes.
2. **Untrusted DOCX processing runs synchronously in the web process.** ZIP limits are applied after JSZip begins loading with CRC verification. Base64 upload cannot support the stated 25 MiB maximum because Vercel Functions limit request and response bodies to 4.5 MB.
3. **Ingest and confirmation are not atomic.** Sequential SQL writes expose partial state and rely on best-effort cleanup, without a transaction, durable queue, outbox, lock or robust idempotency boundary.
4. **Production security controls are unfinished.** Current code includes automatic test-workspace login, database/source-derived encryption fallbacks, no database-enforced tenant isolation, weak relational constraints and conditional session-cookie data in logs.
5. **There is no trustworthy Word export, real-document benchmark, purge worker, disaster-recovery proof or production web deployment pipeline.**

**Go/no-go:** no-go for confidential customer documents. Permit only an explicitly labelled internal sandbox using synthetic or non-confidential documents, isolated infrastructure, no accuracy promise and no exported legal work product.

External early use is acceptable only when all P0 rules meet section 18, every finding is source-proven, exports pass Word validation and visual review, tenant isolation is database-tested, deletion and restore drills pass, test access is absent from production, and operational alerts have been exercised.

## 2. Current-state architecture

```text
Browser
  |
  v
TanStack Start / React on Vercel
  | server functions
  +-- Better Auth / verified email
  +-- automatic test-workspace fallback
  +-- base64 DOCX upload
  +-- JSZip + fast-xml-parser in-process
  +-- canonicalisation + deterministic rules in-process
  +-- sequential SQL writes
          |
          v
Managed PostgreSQL
  +-- users, sessions, Matter, mandate
  +-- document/version/status
  +-- encrypted original DOCX in object_blob
  +-- canonical maps and projected text
  +-- provisions, definitions and references
  +-- Proof runs, executions and hits
  +-- audit events
  +-- deletion-job records

Missing:
  object storage, quarantine, malware gate, queue, worker,
  transaction boundary, export service, purge executor,
  metrics/tracing/alerts and DR automation
```

The root Cloudflare Worker/container and Python Word add-in are not the current Agmt Proof web backend and should not be treated as its launch architecture.

### Persistence boundaries

The current flow writes Matter and mandate, encrypted original, document/version, proposed canonical map, proposal entries and capabilities. Confirmation reparses the original and writes another map, projections, provisions, definitions, uses, deal map, Proof run, executions, hits and audit events.

Those writes are separate statements. `current_version_id` can be visible before the remaining version state is complete. Current cleanup improves failure handling but does not make publication atomic.

## 3. Current end-to-end document flow

1. The user opens or creates a Matter and completes mandate information.
2. The browser base64-encodes the DOCX and sends it through a server function.
3. The server authenticates the user, checks Matter ownership, decodes the payload and parses the package.
4. JSZip loads and CRC-checks the package; metadata limits and active-content filename checks follow.
5. The parser extracts body, headers, footers, comments, fields, revision state and a proposed provision structure.
6. The original is AES-GCM encrypted and stored as a PostgreSQL blob.
7. Document, version, capability, proposal-map and proposal-entry rows are written.
8. The user accepts or edits canonical identifiers.
9. Confirmation decrypts and reparses the original.
10. The server applies decisions, runs deterministic rules synchronously and persists projected text, map data, indexes, run executions and hits.
11. Findings are presented as correctness and consistency results.
12. The user can inspect findings and give feedback. There is no production Word export.

Failure handling mixes explicit failed/partial Proof states with best-effort cleanup. It does not guarantee that readers, retries or concurrent confirmations observe a single committed generation.

## 4. Target production architecture

Use a hybrid control-plane/data-plane architecture:

```text
Browser
  |
  +-- HTTPS UI/API
  v
Vercel, Mumbai
  +-- TanStack application
  +-- Better Auth
  +-- Matter/findings APIs
  +-- short-lived S3 upload grants
  +-- Vercel OIDC -> scoped AWS role
          |
          +-------------------+
          v                   v
Supabase Postgres         AWS Mumbai
Mumbai                    +-- S3 quarantine
  +-- metadata            +-- GuardDuty malware scan
  +-- RLS                 +-- EventBridge
  +-- job/outbox          +-- SQS + DLQ
  +-- runs/findings       +-- Lambda container workers
  +-- audit metadata      |     +-- parser/canonicaliser
                          |     +-- Proof engine
                          |     +-- OOXML exporter
                          +-- KMS envelope encryption
                          +-- S3 encrypted vault/exports
                          +-- CloudWatch metrics/logs
                          +-- backup/security archives
```

### Core choices

- **Application/control plane:** Vercel Pro, region `bom1`.
- **Database:** Supabase Postgres Pro in `ap-south-1`, used as standard PostgreSQL rather than as auth or primary document storage.
- **Storage:** private S3 buckets in `ap-south-1`, separated into quarantine, vault, derived output and security archive.
- **Workers:** SQS-triggered Lambda container images. Begin at 2-4 GiB memory, bounded `/tmp`, five-minute timeout and low reserved concurrency. Move only benchmark-proven outliers to Fargate.
- **Queue:** SQS Standard plus DLQ. All handlers are idempotent because delivery is at least once.
- **Malware:** GuardDuty Malware Protection for S3. Only `NO_THREATS_FOUND` proceeds; all other outcomes fail closed.
- **CDN/WAF:** Vercel CDN and Firewall for the application; presigned S3 transfer for private documents. No public document CDN.
- **Secrets:** Vercel OIDC for short-lived AWS access; AWS Secrets Manager for worker secrets.
- **Infrastructure:** Terraform with separate development, staging and production state and accounts/projects.

## 5. Keep, harden, replace, defer and stop

| Decision | Components | Consequence |
|---|---|---|
| Keep | TanStack/React UI, Matter workspace, mandate flow, PostgreSQL schema concepts, rule-runner contract, truthful run-state concept, deterministic-first product principle | Preserve useful product work and minimize rewriting. |
| Harden | Better Auth, audit events, capability ledger, canonical-map UX, rule registry, parser abstractions, Proof result model | Existing concepts are sound, but their security and evidence guarantees are incomplete. |
| Replace | Base64 uploads, PostgreSQL document blobs, derived key wrapping, synchronous parsing, sequential ingest/confirm writes, proposal-era span persistence | These are launch blockers, not final architecture. |
| Defer | LLM checks, broad automated drafting changes, clause generation, large collaboration features, Microsoft 365 add-in reintegration | Avoid enlarging the trust surface before deterministic foundations are proven. |
| Stop | Automatic production test login, legacy upload/confirmation functions, migrations during builds, first-paragraph evidence fallbacks, unmeasured rule releases | Continuing these patterns creates false confidence and migration debt. |

## 6. Infrastructure decision

| Option | Strengths | Weaknesses | Indicative beta baseline |
|---|---|---|---:|
| **A. Vercel + managed Postgres + AWS data plane** | Smallest application rewrite; Mumbai app, DB, storage and workers; strong KMS/IAM/malware tooling | Three vendors and two observability surfaces | **$70-150/month** |
| B. All AWS | Unified IAM, networking, residency and procurement | RDS/ECS baseline cost, more operations and a 4-8 week hosting rewrite | $250-500/month |
| C. Vercel + Supabase-centric storage/functions | Fast setup, Mumbai Postgres and RLS | Weaker isolated worker and GuardDuty/KMS story; database backups do not cover storage objects | $45-120/month |

**Recommendation: Option A.** Preserve the application while moving dangerous and long-running document operations into a purpose-built data plane. Keep the database provider replaceable through standard `pg`, SQL migrations and no Supabase-specific business logic.

### Monthly operating estimates

Assumptions: four 5 MiB source documents per active user per month, 15 MiB retained per document including derivatives, two 2 GiB worker jobs per document, scrubbed telemetry and normal retry rates.

| Usage | Expected monthly range |
|---|---:|
| Internal, 10 users / 40 documents | $50-80 |
| Beta, 50 users / 200 documents | $70-150 |
| 500 active users / 2,000 documents | $180-500 |
| 5,000 active users / 20,000 documents | $800-2,500 |

These estimates exclude taxes, premium support, unusual email/log volume, cross-region warm DR and enterprise contracts.

## 7. Deterministic rule registry

A rule ships only after meeting its target on frozen corpora. Precision and recall are measured per finding with 95% confidence intervals.

| Priority | Family / check | User value | Target P/R | Difficulty | Dependency | False-positive risk |
|---|---|---|---|---|---|---|
| P0 | Broken internal clause reference | Prevents unusable cross-references | 99.5% / 98% | M | Complete clause/bookmark inventory | Medium |
| P0 | Missing schedule/annex reference | Detects absent attachments | 99.5% / 97% | M | Part and heading inventory | Low |
| P0 | Duplicate clause number | Prevents ambiguous references | 99.9% / 99% | S | Stable numbering tree | Low |
| P0 | Numbering gap or illegal child sequence | Finds structural defects | 99.5% / 98% | M | List and outline model | Medium |
| P0 | Unused definition | Reduces stale drafting | 99% / 97% | M | Final definition/use index | Medium |
| P0 | Duplicate/conflicting definition | Prevents term ambiguity | 99.5% / 97% | M | Definition scope model | Low |
| P0 | Defined-term casing/reference mismatch | Finds mechanically broken use | 99% / 96% | M | Token and exception model | Medium |
| P0 | Unfilled placeholder | Prevents incomplete documents | 99.9% / 99% | S | Run-level source positions | Low |
| P0 | Unresolved Word comment | Prevents review debris | 100% / 100% | M | Comment-range parsing | Low |
| P0 | Unresolved/high-risk field | Detects stale automation | 99.5% / 99% | M | Field-code/result ranges | Low |
| P0 | Hidden/control character | Finds invisible corruption | 99.9% / 99% | M | Exact run offsets | Low |
| P0 | Header/footer stale legal name | Finds copied-document remnants | 99% / 95% | M | Matter party map + header evidence | Medium |
| P0 | Explicit signature inventory mismatch | Detects named signatory block mismatch | 99% / 94% | L | Signature block model | High |
| P1 | Undefined candidate term | Useful drafting hygiene | 98% / 90% | L | Legal-term exception dictionary | High |
| P1 | Malformed definition | Finds incomplete defined terms | 98% / 90% | M | Definition grammar | Medium |
| P1 | Money/date/percentage inconsistency | Detects economic conflicts | 99% / 92% | L | Typed values and scope | High |
| P1 | Party-name/address/identifier variation | Prevents identity inconsistency | 99% / 93% | L | Canonical party model | Medium |
| P1 | Signature capacity/name inconsistency | Detects signing mismatch | 98% / 90% | L | Party-role/signature model | High |
| P1 | Table-versus-prose amount conflict | Finds commercial inconsistency | 98% / 88% | L | Table semantics/currency scope | High |
| P1 | Revision/bookmark stale reference | Finds tracked-edit breakage | 99% / 92% | L | Revision/bookmark lineage | Medium |
| P1 | Cross-document Matter consistency | Finds transaction-document conflicts | 98% / 90% | L | Typed deal map/document roles | High |
| P2 | Capitalization/punctuation hygiene | Low-risk cleanup | 98% / 85% | S | Style context | Medium |
| P2 | Formatting consistency | Presentation quality | 98% / 85% | L | Style/numbering fidelity | High |
| P2 | Semantic ambiguity/LLM review | Potential future value | Separately gated | XL | Privacy-approved model path | Very high |

The table/prose amount check remains P1 until it models currency, local scope, tables and equivalent representations. Current comment, field, header, signature and hidden-character checks cannot ship until their evidence attachment is rewritten.

## 8. Secure ingestion pipeline

1. Create an authenticated `upload_intent` containing tenant, Matter, MIME, maximum size, expiry and idempotency key.
2. Return a narrowly scoped multipart S3 upload grant. Document bytes never cross Vercel.
3. Require SSE-KMS, an exact quarantine prefix, object tags, size constraints and content-hash metadata.
4. Scan the completed object with GuardDuty.
5. Commit the EventBridge result idempotently. Any result except `NO_THREATS_FOUND` is inaccessible to workers and users.
6. Publish an SQS ingest job through a database outbox only after the clean result is committed.
7. Download into bounded Lambda scratch space with no public outbound network route by default.
8. Inspect the ZIP central directory before decompression: entry count, duplicate names, traversal, entry/total expansion, ratio, encryption, macros, embeddings, external relationships, DTD/entity use and malformed content types.
9. Create a staging generation pinned to source SHA-256, parser version, revision view and capability manifest.
10. Publish the complete generation in one transaction and advance `current_version_id` last.
11. Reuse an existing generation for the same source/parser key and serialize concurrent attempts.
12. Reconcile expired intents, stale quarantine objects, abandoned rows and orphaned vault objects.

The current `JSZip.loadAsync(...checkCRC32)` path must not run before expansion limits. Parser execution belongs in a constrained worker even after malware scanning.

## 9. Canonicalisation and identifier normalisation

Each identifier contains type, exact OOXML source occurrences, normalized/display values, confidence/reason codes, decision, scope, extractor version and source package digest.

- Auto-accept only exact, reversible normalisations calibrated to at least 99.9% precision.
- Require review for legal-name merges, ambiguous abbreviations, materially different numeric representations or confidence below threshold.
- Never silently normalize signature names, company identifiers, amounts, dates, percentages or cross-reference targets.
- A user decision creates a new immutable canonical-map generation.
- Confirmation persists newly built final-decision segments; proposal segments are never reused.
- Definitions and uses are built from final projected text.
- Any map edit invalidates dependent Proof runs and exports.

## 10. Deterministic checking engine

Each rule is a versioned registry entry with ID/version, family, priority, capabilities, supported roles, runner, evidence contract, failure policy, evaluation-corpus version, measured metrics and release state.

- Pin source, canonical, parser, registry and rule versions at run creation.
- Execute P0 rules independently.
- Persist `queued -> running -> completed|failed|suppressed` with attempt, latency, error code and worker build.
- Missing capability produces `suppressed`, never clear.
- Invalid evidence produces `failed`; its findings are withheld.
- A document is clear only when every required P0 check completed, none failed or were suppressed, and no valid P0 findings remain.
- Duplicate delivery cannot duplicate executions or findings.
- Output ordering is stable across retries and platforms.
- Finding identity derives from rule/source/evidence versions and normalized issue key.

## 11. Evidence mapping and source validation

Every extracted character needs a stable path:

```text
package_sha256
part_uri
part_sha256
story_kind
paragraph_identity / structural XPath
run-and-node path
source UTF-16 offset range
revision visibility
canonical UTF-16 offset range
```

The final span map is ordered, non-overlapping and reversible for untouched spans. Replacement segments retain old value, new value and decision provenance.

- **Positive evidence:** a concrete source range supports the finding.
- **Absence evidence:** an immutable evaluated-scope inventory proves a required item was not found. It never invents a quote from unrelated text.

For each finding, recalculate the canonical quote digest, resolve the final span map, load the exact OOXML part/node range, reconstruct accepted-view source text, match digests under the declared transformation, verify package/part hashes and confirm capabilities/evaluated scope. Any failure blocks publication.

## 12. Word export architecture

Word export edits a copy of the original package rather than generating from flattened text.

- **Comments:** first launch mode. Add Word comments with rule, explanation, evidence and proposed action without modifying visible text.
- **Tracked changes:** later P0/P1 mode. Apply only explicitly accepted deterministic edits using author `Agmt Proof`, timestamp and stable finding ID.
- **Clean copy:** defer until tracked-change fidelity is proven.

Pipeline:

1. Pin original source, canonical generation, finding set and decisions.
2. Copy the original package into isolated worker storage.
3. Translate accepted canonical ranges to exact OOXML nodes.
4. Split runs only where required while preserving styles, bookmarks, fields, hyperlinks, content controls, tables, sections, comments, notes, headers, footers and relationship IDs.
5. Reject edits crossing unsupported structures.
6. Insert comments or tracked revisions.
7. Run Open XML SDK validation.
8. Reopen with LibreOffice headless and compare page images/structural inventories.
9. Store the encrypted export and issue a short-lived one-use download grant.
10. Persist a manifest containing all source, decision, rule, exporter and validation versions.

Test Microsoft 365 Current Channel on Windows/macOS, Word 2021/2024 on Windows and Word Online. Unsupported constructs block tracked changes and permit comments only where safe.

## 13. Security architecture

### Tenant isolation

- Put `tenant_id` on every tenant-owned table.
- Add composite foreign keys preserving tenant identity across Matter, document, version, map, run, hit, export, job and audit rows.
- Enable PostgreSQL RLS with `SET LOCAL app.tenant_id` inside each user transaction.
- Separate migration, web, worker and read-only support roles; deny table-owner credentials to runtimes.
- Test cross-tenant reads, writes, joins, upload grants, object keys, queues, exports and audit access.

### Encryption and key management

Use separate staging and production customer-managed symmetric KMS keys. For each object, call `GenerateDataKey`, stream-encrypt with AES-256-GCM, bind environment/tenant/Matter/document/version/object-kind/schema as AAD and store only ciphertext. Persist encrypted data key, key ARN, context, nonce/tag, hashes, sizes and envelope version.

Turn on annual KMS rotation and CloudTrail alarms. Rewrap existing data keys explicitly after compromise or policy-driven rotation.

### Legacy-key migration

1. Inventory every encrypted blob/text row without logging decrypted content.
2. Add provider/key/version metadata.
3. Dry-run configured secret, Better Auth secret, database-URL derivation and source-preview fallback paths.
4. Unwrap the old data key, verify GCM/hash and KMS-encrypt the data key without rewriting object ciphertext.
5. Use canaries, temporary dual-read, count/hash comparison and a restore test.
6. Remove legacy derivation code/secrets only after 100% verification.
7. Mark ciphertext unrecoverable for human disposition when the historical wrapping input is unavailable.

### Other controls

- Never log document text, quotes, decrypted keys, tokens, cookies, magic links or presigned URLs.
- Remove session-cookie preview logging.
- Restrict worker egress; use immutable image digests, dependency/image scanning and SBOMs.
- Use least-privilege IAM, MFA-protected break-glass, approval logs and quarterly access review.
- Rate-limit authentication, upload grants, Matter creation, retry, feedback and export.
- Add CSP, HSTS, frame restrictions, MIME protection, Referrer Policy and Permissions Policy.
- Complete an independent penetration test before paid external use.

## 14. Data lifecycle

| Data | Active retention | Deletion | Backup/log consequence |
|---|---|---|---|
| Upload intent | 1 hour | Automatic expiry | Metadata only |
| Quarantine object | Scan completion, max 24 hours | Promote clean; delete failed/unsupported; isolate malicious up to 7 days | No ordinary backup |
| Temporary extraction | Job lifetime, max 24 hours | Remove scratch data | Never backed up |
| Original DOCX versions | Active Matter or contractual period | Immediate revocation; hard purge after configurable 7-day grace | Backup ages out within 35 days |
| Projections/indexes/span maps | Same as source | Cascade with version | Rebuildable but confidential |
| Proof runs/findings | Same as Matter | Cascade unless legal hold | Audit metadata separate |
| Exports | 30 days default | User may delete immediately | No permanent archive by default |
| Product telemetry | 30-90 days | Aggregate/anonymize later | No document content |
| Security/ICT logs | Minimum 180 days in India | Immutable lifecycle expiry | CERT-In-driven |
| Processing/security audit metadata | 1 year | Erase unless another law/hold applies | Controlled archive |
| Database PITR | 14-30 days | Deleted rows age out | Quarterly restore drill |
| Legal hold | Explicit and scoped | Suspends selected purge | Dual approval to create/remove |

Counsel must confirm exact DPDP Act/Rules and CERT-In applicability. Engineering should still implement encryption, access control, processor safeguards, breach response, deletion, one-year processing/security metadata retention and 180-day India-resident ICT logs.

## 15. Production authentication

- Keep Better Auth and remove every non-production path before staging promotion.
- Use 256-bit, hashed, one-time email magic links with ten-minute expiry, neutral responses and per-IP/per-email limits.
- Configure Google and Microsoft OIDC with exact production redirect origins and verified domains.
- Remove automatic anonymous workspace, test-login, preview token and derived-secret behavior.
- Use secure host-only cookies, key versioning, 8-12 hour absolute lifetime, sensitive-action reauthentication and rotation on authentication/privilege change.
- Revoke sessions on identity change, disablement, suspicious activity and user request.
- Separate admin/support roles, require MFA and just-in-time reasoned access, and prevent support from viewing document content.
- Use token/origin CSRF validation; treat Fetch Metadata as defense in depth only.
- Log provider error codes rather than provider bodies or credentials.

## 16. Observability

Every request, upload, job, generation, run, execution and export carries `request_id`, `trace_id`, hashed tenant ID, Matter/document IDs, job/attempt, worker build, component versions, state transition, duration and error code. Names, document text, quotes, emails, object keys, tokens, cookies and URLs are excluded.

Required metrics cover uploads, malware outcomes, queue age/depth/DLQ, parser latency/memory/failures, atomic publication/reconciliation, rule latency/suppression/invalid evidence, export validation, authentication/rate limits, RLS denials, deletion backlog, backups and KMS errors.

Initial SLOs:

- 99.9% monthly API availability.
- P95 Matter read/write below 500 ms.
- P95 clean 25 MiB document to completed Proof below 120 seconds; P99 below 300 seconds.
- 99% of jobs start within 30 seconds.
- No unresolved DLQ message older than 15 minutes.
- Deletion completes within 24 hours after grace expiry.
- RPO 15 minutes and RTO 4 hours.
- Any cross-tenant success, invalid-evidence publication or KMS anomaly pages immediately.

Store required security logs in AWS Mumbai for 180 days. Sentry may receive scrubbed application errors; CloudWatch and S3 remain the operational/security records.

## 17. Testing strategy

### Corpora

- **Synthetic golden:** positive, negative, exception and boundary fixtures per rule.
- **Public/licensed agreements:** diverse transaction documents with provenance and redistribution rights.
- **Customer pilot:** explicit opt-in, separate encryption/access controls and no model training.
- **Adversarial DOCX:** ZIP bombs, duplicate entries, traversal, malformed relationships, external targets, DTD/entity payloads, macros, ActiveX, embeddings, encrypted packages, huge XML, pathological tables and Unicode edge cases.
- **Export:** fields, bookmarks, comments, notes, tracked changes, content controls, tables, sections, numbering, images, hyperlinks and digital-signature detection.

Test layers include deterministic unit tests, parser/span-map properties, golden package inventories, precision/recall evaluation, transaction/FK/RLS/concurrency tests, IAM policy tests, worker duplicate/DLQ tests, real-auth browser E2E, Open XML validation, Word/LibreOffice structural and image comparison, load, soak, restore, deletion, incident and rotation drills.

All tests use synthetic secrets and isolated environments. Production documents never enter development or CI.

## 18. Quality gates

| Gate | Launch threshold |
|---|---|
| P0 precision | Each rule lower 95% CI >=99%; combined >=99.5% |
| P0 recall | Each rule lower 95% CI >=95%; combined >=97% |
| Evidence validity | 100% source-proven; zero fabricated fallback anchors |
| Determinism | Identical hashes across 100 repeats and supported platforms |
| Parser safety | 100% adversarial fixtures fail safely; no limit bypass or escape |
| Tenant isolation | Zero successful cross-tenant operations in automated/external testing |
| Export schema | 100% Open XML validation except approved harmless original defects |
| Export fidelity | No unexplained structural loss; unchanged-page SSIM >=0.995 |
| Performance | P95 <=120 s and P99 <=300 s for 25 MiB/80-page supported documents |
| Reliability | >=99.5% successful jobs excluding intentional rejection |
| Idempotency | Zero duplicate versions, findings, jobs or exports under duplicate delivery |
| Deletion | 100% purge within 24 hours after grace; zero accessible deleted objects |
| Backup/DR | Two successful restore drills; RPO <=15 min, RTO <=4 h |
| Security | No open critical/high findings; explicit owner/date for accepted medium risk |
| Operations | Alerts, runbooks, on-call, incident and key-compromise tabletop completed |
| CI/CD | Reproducible build, signed artifacts, migration rehearsal, canary and rollback passed |

One failed P0 gate blocks external launch.

## 19. Failure-mode matrix

| Failure | Detection | User behavior | Recovery | Consistency/alert |
|---|---|---|---|---|
| Upload interrupted | Intent expiry | Retry message | Multipart abort/new intent | No document row |
| Size/hash mismatch | Completion validation | Upload rejected | Delete quarantine object | Security metric if repeated |
| Malware detected | GuardDuty result | Safe rejection | Isolate then purge | No parser access; page |
| Scan failed/unsupported | Terminal scan status | Security scan unavailable | Retry/re-upload | Fail closed; threshold alert |
| Queue duplicate | Idempotency key | No duplicate UI | Return prior result | One generation |
| Queue delay | Age/depth alarm | Delayed status | Scale/reserve capacity | Page at SLO breach |
| Worker crash/OOM | Attempt/termination | Retrying status | Retry then DLQ | Staging unpublished |
| Parser rejection | Typed error | Supported-file guidance | User re-uploads | No partial version |
| DB commit failure | Transaction rollback | Retry message | Idempotent retry | Old state remains current |
| Concurrent confirm | Lock/version conflict | Refresh/review | Rebase decision | No mixed generation |
| Evidence invalid | Validator | Check failed; finding hidden | Fix/re-run | Run cannot be clear; page |
| Capability absent | Capability ledger | Check unavailable | Add parser support later | Suppressed, not passed |
| KMS unavailable | SDK/CloudWatch error | Temporary failure | Backoff/retry | Ciphertext safe; page |
| Legacy key missing | Migration dry run | Historical file unavailable | Restore secret/re-upload | Never overwrite ciphertext |
| Export mapping conflict | Edit planner | Comments-only/blocked | Change decision | Original unchanged |
| Export schema failure | Open XML validator | Export withheld | Retry/investigate | Corrupt file unavailable |
| Presigned link theft/reuse | Expiry/use/anomaly | Link expires | Revoke grant | Short TTL; anomaly alert |
| Tenant-policy defect | RLS/canary | Authorization denial | Roll back | Any crossover pages |
| Purge failure | Deletion-age metric | Matter inaccessible | Retry/reconcile | Page after 24 h |
| Restore failure | Scheduled drill | No ordinary impact | Repair backup chain | Launch/rollout blocked |
| Provider outage | Health/dependency errors | Read-only/queued state | Provider runbook | Never fail open |
| Migration regression | Canary/schema gate | Deployment halted | App rollback/forward fix | Never migrate in build |

## 20. Engineering work packages

Notation: **O/W** objective and why; **D/A** dependencies and repository areas; **I** implementation; **A/T** acceptance and tests; **S/DoD** security and completion; **P/C** safe parallelism and complexity. Each package is intended to fit one to three engineering days.

### Foundation and data plane

| ID | Package |
|---|---|
| FND-01 | **O/W:** Freeze launch source, supported DOCX matrix and ADRs. **D/A:** none; `web/docs`. **I:** record invariants, non-goals, state machines and gates. **A/T:** architecture review passes; each gate has an owner. **S/DoD:** no secrets/vendor IDs; ADR approved. **P/C:** yes/S. |
| FND-02 | **O/W:** Add PostgreSQL transaction API because ingest/confirm publish partial state. **D/A:** FND-01; `web/src/lib/db.ts`. **I:** callback, isolation, rollback and test adapter. **A/T:** forced failures leave no visible partial rows. **S/DoD:** no owner role; integration suite passes. **P/C:** no/M. |
| FND-03 | **O/W:** Add tenant, FK, CHECK and uniqueness invariants. **D/A:** FND-02; migrations/data model. **I:** tenant columns, enums/checks, composite FKs. **A/T:** cross-tenant/invalid-state inserts fail. **S/DoD:** rehearsal and rollback plan. **P/C:** no/L. |
| FND-04 | **O/W:** Implement RLS and runtime roles. **D/A:** FND-03; migrations/DB context. **I:** policies, `SET LOCAL`, app/worker/support roles. **A/T:** full crossover matrix denied. **S/DoD:** owner credentials absent. **P/C:** no/L. |
| FND-05 | **O/W:** Separate migrations from builds. **D/A:** FND-03; CI/package scripts. **I:** forward-only release job and schema gate. **A/T:** builds are read-only; failures block promotion. **S/DoD:** least-privilege credential/rehearsal. **P/C:** yes/M. |
| JOB-01 | **O/W:** Define durable upload/job/outbox state machines. **D/A:** FND-03; migrations/server. **I:** transitions, keys, leases and outbox. **A/T:** illegal transitions/duplicates reject. **S/DoD:** tenant-scoped audit. **P/C:** yes/L. |
| OBJ-01 | **O/W:** Remove document bytes from PostgreSQL through an object-store abstraction. **D/A:** FND-01; blob interfaces. **I:** S3, immutable keys/manifests. **A/T:** round-trip hashes match; DB stores metadata only. **S/DoD:** private policy tests. **P/C:** yes/M. |
| OBJ-02 | **O/W:** Add direct multipart upload. **D/A:** OBJ-01, JOB-01; API/UI. **I:** scoped presign, complete and abort. **A/T:** 25 MiB bypasses Vercel body path. **S/DoD:** expiry/prefix/size/hash/ownership tests. **P/C:** yes/M. |
| OBJ-03 | **O/W:** Add malware quarantine gate. **D/A:** OBJ-01; IaC/event handler. **I:** GuardDuty, tags, EventBridge, fail-closed transition. **A/T:** only clean objects enqueue. **S/DoD:** malicious/failed/duplicate results tested. **P/C:** yes/M. |
| WRK-01 | **O/W:** Build isolated parser/Proof worker shell. **D/A:** JOB-01, OBJ-01; worker/IaC. **I:** Lambda container, SQS, DLQ, limits/errors. **A/T:** duplicates/crashes/timeouts converge. **S/DoD:** restricted IAM/egress and scanned image. **P/C:** yes/L. |
| WRK-02 | **O/W:** Stop resource attacks before decompression. **D/A:** WRK-01; parser. **I:** central-directory validation and bounded extraction. **A/T:** bomb/traversal fixtures reject pre-expansion. **S/DoD:** memory/CPU bounds proven. **P/C:** no/L. |
| WRK-03 | **O/W:** Complete OOXML relationship/parser capability model. **D/A:** WRK-02; `docx-v2.ts`. **I:** content types, stories, comments, notes, revisions, fields, bookmarks, sections. **A/T:** golden inventories match Word. **S/DoD:** external/active content safe. **P/C:** no/L. |
| ING-01 | **O/W:** Publish ingest generations atomically. **D/A:** FND-02, WRK-03, OBJ-01. **I:** stage, validate, transact, advance current last. **A/T:** fault injection exposes old or new only. **S/DoD:** reconciliation documented. **P/C:** no/L. |
| ING-02 | **O/W:** Make ingest idempotent under retry/concurrency. **D/A:** ING-01. **I:** source/parser uniqueness, locks and reuse. **A/T:** 100 concurrent duplicates make one version. **S/DoD:** no tenant collision. **P/C:** no/M. |
| ING-03 | **O/W:** Reconcile orphaned and stuck work. **D/A:** JOB-01, ING-01. **I:** lease expiry, age scan and safe deletion. **A/T:** abandoned-state injections self-heal. **S/DoD:** dry-run/audit. **P/C:** yes/M. |

### Encryption, canonicalisation and evidence

| ID | Package |
|---|---|
| CRY-01 | **O/W:** Define versioned KMS envelope metadata. **D/A:** OBJ-01; crypto/schema. **I:** key ARN, encrypted data key, context, nonce/tag/version. **A/T:** current/future compatibility tests. **S/DoD:** threat review. **P/C:** yes/M. |
| CRY-02 | **O/W:** Stream-encrypt vault objects. **D/A:** CRY-01. **I:** GenerateDataKey, AES-GCM, AAD, hashes. **A/T:** tamper/context mismatch fails. **S/DoD:** plaintext never persists/logs. **P/C:** no/M. |
| CRY-03 | **O/W:** Inventory legacy ciphertext/wrapping paths. **D/A:** CRY-01; migration tooling. **I:** metadata-only report/decryptability dry run. **A/T:** every row classified without mutation. **S/DoD:** controlled access/no content output. **P/C:** yes/M. |
| CRY-04 | **O/W:** Rewrap legacy data keys under KMS. **D/A:** CRY-02/03. **I:** canary, dual-read, rewrap, verify, checkpoint. **A/T:** 100% hash/decrypt match. **S/DoD:** backup restore/rollback proof. **P/C:** no/L. |
| CRY-05 | **O/W:** Establish key rotation and break-glass. **D/A:** CRY-02. **I:** policies, alarms, rewrap/runbook. **A/T:** non-production rotation/tabletop succeeds. **S/DoD:** MFA/approval/audit. **P/C:** yes/M. |
| CAN-01 | **O/W:** Specify typed identifiers/confidence policy. **D/A:** WRK-03; canonical types/docs. **I:** types, scopes, provenance, thresholds/reasons. **A/T:** calibration meets auto-accept gate. **S/DoD:** material values never silently change. **P/C:** yes/M. |
| CAN-02 | **O/W:** Persist only final projections/indexes. **D/A:** CAN-01, FND-02; canonical/confirm path. **I:** confirmation uses final apply result. **A/T:** all decisions propagate correctly. **S/DoD:** one transaction/generation pin. **P/C:** no/M. |
| CAN-03 | **O/W:** Materialize final span segments with invariants. **D/A:** CAN-02. **I:** segment rows, range checks/digest. **A/T:** property tests prove ordering/gap/overlap/reversibility rules. **S/DoD:** malformed maps block. **P/C:** no/L. |
| EVD-01 | **O/W:** Define positive/absence evidence schemas. **D/A:** CAN-03, WRK-03; schema/types. **I:** source paths, scope manifests, hashes/versions. **A/T:** every P0 type represented without fake anchors. **S/DoD:** immutable provenance. **P/C:** yes/M. |
| EVD-02 | **O/W:** Validate positive evidence to exact OOXML. **D/A:** EVD-01. **I:** canonical-to-source reconstruction/digests. **A/T:** altered range/part/package fails. **S/DoD:** invalid findings never publish. **P/C:** no/L. |
| EVD-03 | **O/W:** Validate absence through evaluated inventories. **D/A:** EVD-01. **I:** scope manifest/zero-count proof. **A/T:** absence requires complete scope. **S/DoD:** fake quote fallbacks removed. **P/C:** yes/L. |

### Proof and export

| ID | Package |
|---|---|
| PRF-01 | **O/W:** Make the rule registry an enforceable release contract. **D/A:** EVD-01; registry/CI. **I:** versions, capabilities, evidence types and release states. **A/T:** unmeasured rules cannot enable in production. **S/DoD:** signed registry manifest. **P/C:** yes/M. |
| PRF-02 | **O/W:** Rebuild cross-reference/numbering P0 rules. **D/A:** PRF-01, EVD-02. **I:** clause tree, bookmarks, schedules and scoped targets. **A/T:** frozen corpus meets gates. **S/DoD:** exact source for each hit. **P/C:** yes/L. |
| PRF-03 | **O/W:** Rebuild definition/use P0 rules from final indexes. **D/A:** CAN-02, PRF-01. **I:** scope, exceptions, typed tokens. **A/T:** corpus meets gates; decisions alter results. **S/DoD:** no proposal index. **P/C:** yes/L. |
| PRF-04 | **O/W:** Rebuild comments, fields, placeholders and hidden-character rules. **D/A:** WRK-03, EVD-02. **I:** node-range evidence. **A/T:** exact round-trip per hit. **S/DoD:** no first-leaf anchors. **P/C:** yes/L. |
| PRF-05 | **O/W:** Rebuild header/party/signature rules. **D/A:** EVD-03, CAN-01. **I:** party map, story scopes, absence inventory. **A/T:** high-risk corpus meets thresholds. **S/DoD:** ambiguity suppresses. **P/C:** yes/L. |
| PRF-06 | **O/W:** Make Proof asynchronous, truthful and stale-aware. **D/A:** WRK-01, PRF-01. **I:** jobs, attempts, pins/invalidation. **A/T:** failed/suppressed/stale runs never clear. **S/DoD:** duplicate jobs converge. **P/C:** no/L. |
| EXP-01 | **O/W:** Build canonical-to-OOXML edit planner. **D/A:** CAN-03, EVD-02. **I:** safe node splits/unsupported boundaries. **A/T:** unchanged inventories match. **S/DoD:** unproven edits rejected. **P/C:** yes/L. |
| EXP-02 | **O/W:** Deliver comments-only export. **D/A:** EXP-01. **I:** comment parts, relationships, finding metadata. **A/T:** Word opens and anchors correctly. **S/DoD:** source immutable. **P/C:** no/L. |
| EXP-03 | **O/W:** Deliver accepted tracked changes. **D/A:** EXP-01. **I:** safe revision markup. **A/T:** Word accept/reject gives expected text. **S/DoD:** ambiguous edits block. **P/C:** yes/L. |
| EXP-04 | **O/W:** Gate schema, structure and visual fidelity. **D/A:** EXP-02. **I:** Open XML SDK, LibreOffice and inventory/image diff. **A/T:** launch corpus meets section 18. **S/DoD:** failed export never downloadable. **P/C:** yes/L. |

### Authentication, operations, testing and UX

| ID | Package |
|---|---|
| SEC-01 | **O/W:** Remove test auth, preview token and duplicate legacy functions. **D/A:** FND-01; auth/agmt routes. **I:** eliminate production reachability/build assertion. **A/T:** anonymous production access impossible. **S/DoD:** external route inventory reviewed. **P/C:** yes/M. |
| SEC-02 | **O/W:** Configure production email, Google and Microsoft auth. **D/A:** SEC-01. **I:** exact origins, providers, verified-email rules. **A/T:** positive/negative E2E passes. **S/DoD:** no fallback secrets. **P/C:** no/M. |
| SEC-03 | **O/W:** Harden sessions, CSRF, throttling and recovery. **D/A:** SEC-02. **I:** rotation, revocation, reauth, limits, neutral responses. **A/T:** replay/fixation/CSRF fail safely. **S/DoD:** no token/cookie logs. **P/C:** yes/L. |
| SEC-04 | **O/W:** Add headers, WAF and dependency/image controls. **D/A:** SEC-01, WRK-01. **I:** policies, SBOM, scanning. **A/T:** security suite/image gate pass. **S/DoD:** no critical/high finding. **P/C:** yes/M. |
| OPS-01 | **O/W:** Define scrubbed telemetry. **D/A:** FND-01; app/worker/audit. **I:** IDs, events/redaction. **A/T:** seeded sensitive strings absent from sinks. **S/DoD:** privacy review. **P/C:** yes/M. |
| OPS-02 | **O/W:** Build dashboards, alerts and runbooks. **D/A:** OPS-01. **I:** metrics, pages, ownership/escalation. **A/T:** synthetic faults fire/resolve. **S/DoD:** security logs remain in India. **P/C:** yes/M. |
| OPS-03 | **O/W:** Implement retention, purge and legal hold. **D/A:** FND-03, OBJ-01. **I:** lifecycle, deletion executor, hold state. **A/T:** full purge drill meets deadline. **S/DoD:** dry-run, dual approval, audit. **P/C:** yes/L. |
| OPS-04 | **O/W:** Implement backups and DR. **D/A:** OBJ-01, FND-03. **I:** PITR, versioning, manifests, restore automation. **A/T:** two drills meet RPO/RTO. **S/DoD:** backup/KMS access separated. **P/C:** yes/L. |
| OPS-05 | **O/W:** Codify environments and release promotion. **D/A:** FND-05, WRK-01; Terraform/CI. **I:** accounts/projects, signed builds, staging/canary. **A/T:** clean-room recreation succeeds. **S/DoD:** no shared prod secrets/state. **P/C:** yes/L. |
| TST-01 | **O/W:** Expand synthetic/licensed corpora. **D/A:** PRF-01; corpus tooling. **I:** provenance, labels, manifests. **A/T:** positive/negative/exception coverage. **S/DoD:** licensing/privacy approved. **P/C:** yes/L. |
| TST-02 | **O/W:** Build adversarial parser/security corpus. **D/A:** WRK-02. **I:** malicious packages and bounded harness. **A/T:** every fixture has stable safe outcome. **S/DoD:** isolated CI. **P/C:** yes/L. |
| TST-03 | **O/W:** Add precision/recall confidence reporting. **D/A:** TST-01, PRF-01. **I:** matching policy, bootstrap CI, regression deltas. **A/T:** release report reproduces. **S/DoD:** no production text. **P/C:** yes/M. |
| TST-04 | **O/W:** Add tenant, concurrency, load and E2E suites. **D/A:** ING-02, FND-04, PRF-06. **I:** parallel jobs, duplicate messages, real auth/browser. **A/T:** section 18 passes. **S/DoD:** isolated synthetic tenants. **P/C:** yes/L. |
| UX-01 | **O/W:** Show upload/scan/parse/Proof progress and typed failures. **D/A:** JOB-01, PRF-06; workspace UI. **I:** status, retry, safe messages. **A/T:** deterministic UI for each state. **S/DoD:** no provider/malware detail leaks. **P/C:** yes/M. |
| UX-02 | **O/W:** Make canonical review risk-based. **D/A:** CAN-01. **I:** auto/review/conflict queues with provenance. **A/T:** material edits require confirmation. **S/DoD:** immutable decision history. **P/C:** yes/M. |
| UX-03 | **O/W:** Make findings explainable/actionable. **D/A:** EVD-02, PRF-06. **I:** source context, state and action workflow. **A/T:** navigation lands on proven source. **S/DoD:** stale findings cannot act. **P/C:** yes/M. |
| UX-04 | **O/W:** Add safe export selection/download. **D/A:** EXP-02, EXP-04. **I:** modes, readiness warnings, one-use link. **A/T:** unsupported export blocked. **S/DoD:** reauth/audit. **P/C:** yes/M. |

## 21. Dependency graph and critical path

```text
FND-01
  +-- FND-02 -> FND-03 -> FND-04
  +-- OBJ-01 -> OBJ-02 -> OBJ-03
  +-- JOB-01 -------------------+
  +-- CRY-01 -> CRY-02          |
                                v
WRK-01 -> WRK-02 -> WRK-03 -> ING-01 -> ING-02
                                    |
CAN-01 -> CAN-02 -> CAN-03 ---------+
                                    v
                       EVD-01 -> EVD-02/EVD-03
                                    |
                                    v
                       PRF-01 -> P0 rule packages
                                    |
                                    v
                                 PRF-06
                                    |
                                    v
                       EXP-01 -> EXP-02/03 -> EXP-04
                                    |
                                    v
                          TST-03/04 + quality gates
                                    |
                                  Launch
```

The critical path is parser safety -> atomic ingestion -> final span map -> source-proof evidence -> P0 rules -> asynchronous Proof -> export validation -> measured gates. Auth, observability, lifecycle, DR, infrastructure and corpora proceed in parallel but are all launch dependencies.

## 22. Parallelisation strategy

For four engineers or agents:

- **Lane A - data plane:** FND-02 through ING-03.
- **Lane B - parser/evidence:** WRK-02/03, CAN and EVD packages.
- **Lane C - security/operations:** SEC, CRY, OPS and IaC.
- **Lane D - rules/export/quality:** PRF, EXP, TST and UX.

Serialize migrations/`db.ts` through one owner, parser core through one owner, registry contract before family runners, auth-route removal before provider configuration and export skeleton before comments/tracked-change branches. Rule families, fixture directories, Terraform modules, dashboards and UI feature components are safe parallel areas. Each integration batch has one named integrator and frozen interfaces.

## 23. Recommended implementation sequence

1. Freeze baseline, architecture, supported documents, P0 list and gates.
2. Remove test auth, cookie preview, duplicate legacy endpoints and build-time migrations.
3. Add transaction layer, tenant constraints, RLS and runtime roles.
4. Build S3 direct upload, malware gate, SQS and isolated worker.
5. Harden ZIP/OOXML parsing and capability reporting.
6. Make ingest immutable, atomic, idempotent and reconcilable.
7. Implement KMS envelopes and migrate legacy keys through canary/dual-read.
8. Repair final canonical maps, indexes and positive/absence source evidence.
9. Rebuild P0 rules and truthful async Proof.
10. Deliver comments export, then tracked changes, with structural/visual gates.
11. Complete telemetry, alerts, lifecycle, backup and incident/restore drills.
12. Run real/adversarial corpora, external security review and performance campaign.
13. Pilot internally, then with consented non-critical documents.
14. Canary 5, 25 and 50 users with a full observation window before each promotion.

Every package adds a failing test first, a permanent golden regression and metric comparison. Parser, canonical, evidence and export changes rerun the full corpus.

Application rollback selects a prior signed artifact. Schema follows expand/migrate/contract and forward-fix. Worker jobs are versioned so incompatible worker generations do not share messages. Canonical, Proof and export generations are immutable, so rollback selects a prior generation.

## 24. Tooling and service shopping list

| Need | Recommendation | Region/account/secrets | Why / alternative | Indicative cost |
|---|---|---|---|---|
| Web hosting | Vercel Pro | Production team; `bom1` | Preserve current app; alternative all AWS | About $20/user/month plus use |
| Database | Supabase Pro Postgres | Mumbai; separate stage/prod | Standard Postgres/RLS; alternative Neon Singapore or RDS | From $25/month |
| AWS organization | Separate stage/prod accounts | Mumbai primary | IAM/KMS/S3/SQS/Lambda | Pay as used; apply for Activate but do not depend on it |
| Storage | Private Amazon S3 | Quarantine/vault/derived/log buckets | Native KMS/lifecycle/GuardDuty | Low at beta scale |
| Keys | Customer-managed AWS KMS | Separate stage/prod aliases | Envelope encryption/audited use | About $1/key/month plus calls; verify calculator |
| Malware | GuardDuty Malware Protection for S3 | Quarantine prefixes | Managed event-driven gate | Monthly free allowance then usage |
| Queue | SQS Standard + DLQ | Separate ingest/Proof/export | Reliable at-least-once jobs | First 1M requests/month free |
| Workers | Lambda container images | Mumbai; immutable ECR digest | Pay-per-job isolation; Fargate for proven outliers | Near free internally |
| Auth email | Resend, later SES if useful | Verified production domain | Current integration is close | Usage based |
| OAuth | Google Cloud + Microsoft Entra registrations | Exact stage/prod redirects | Required login options | Usually no direct fee |
| Error tracking | Sentry or equivalent | Scrubbed/restricted | Fast diagnosis; CloudWatch for workers | Free internally, then usage |
| Operational logs | CloudWatch + S3 archive | Mumbai, 180-day lifecycle | India-resident security records | Usage based |
| Infrastructure | Terraform + locked remote state | State per environment | Reproducible/reviewable | Tool free; backend minimal |
| CI/CD | GitHub Actions with OIDC | Environment approvals/signing | Fits repository | Existing plan/usage |
| Office validation | Open XML SDK + LibreOffice + licensed Word VMs | Isolated test environment | Schema and real-client fidelity | Licence/VM cost |
| Security review | Independent application/infra test | Synthetic staging clone | Required before confidential use | Obtain scoped quotes |

Vercel must access AWS through short-lived OIDC credentials, not stored AWS access keys. Budget production using paid-plan assumptions rather than credits.

## 25. Ranked human decisions

1. Launch claim: internal aid or client-facing legal-quality product.
2. Data region: India-only primary processing or permitted Singapore/global processing.
3. Retention: deletion grace, original-version life, export expiry and legal-hold authority.
4. Legacy encryption: availability of every historical wrapping secret and disposition of unrecoverable rows.
5. P0 scope: commercially essential rules without forcing high-risk heuristics into launch.
6. Export: comments-only first or tracked changes at first external release.
7. Database: Supabase Mumbai or continued Neon Singapore for migration speed.
8. Authentication: required providers, tenant restrictions and consumer-account policy.
9. Pilot corpus: authorization, contract and retention for real agreements.
10. Incident ownership: CERT-In contact, privacy contact, on-call, counsel and customer communications.
11. Support access: whether any human support workflow may decrypt documents.
12. External assurance: penetration tester, Word matrix and launch sign-off authority.
13. Commercial limits: file/page limits, SLA, liability language and pricing.
14. DR: single-region launch with backups or immediate warm cross-region recovery.

## 26. Launch-readiness checklist

### Functional

- [ ] Direct 25 MiB DOCX upload works without application proxying.
- [ ] Malware scan gates every upload.
- [ ] Supported/unsupported OOXML features report truthfully.
- [ ] Ingest, confirmation, Proof and export are immutable/idempotent.
- [ ] P0 rules meet individual/combined quality gates.
- [ ] Every finding navigates to exact source evidence.
- [ ] Absence findings have complete evaluated-scope evidence.
- [ ] Comments export passes Word validation.
- [ ] Enabled tracked changes survive accept/reject in supported Word.
- [ ] Failed or suppressed checks prevent clear status.

### Security

- [ ] Test access and duplicate legacy endpoints are absent.
- [ ] No runtime uses database-owner credentials.
- [ ] RLS and composite tenant FKs cover every tenant table.
- [ ] Cross-tenant API, SQL, object, queue and export tests pass.
- [ ] S3 is private, KMS-encrypted and least-privileged.
- [ ] Legacy key migration is verified complete.
- [ ] Tokens, cookies, text and presigned URLs are absent from logs.
- [ ] Rate limits, CSRF, headers, WAF and dependency gates pass.
- [ ] No open critical/high penetration-test finding.

### Privacy and lifecycle

- [ ] Processing notice and processor inventory are approved.
- [ ] Data inventory/purpose mapping is complete.
- [ ] Deletion, grace, backup expiry and legal hold work.
- [ ] Rights/grievance channels are published.
- [ ] CERT-In/privacy incidents have named owners.
- [ ] Required security logs remain in India.
- [ ] Production documents never enter development, CI or model training.

### Operations and evaluation

- [ ] Production infrastructure recreates from Terraform.
- [ ] Stage/prod accounts, projects, keys and queues are separate.
- [ ] Signed artifacts and controlled migrations are active.
- [ ] SLO dashboards/alerts pass fault injection.
- [ ] DLQ, KMS, purge, outage and security runbooks are exercised.
- [ ] Two restore drills meet RPO/RTO.
- [ ] Frozen corpus and labels are versioned with provenance.
- [ ] Precision/recall reports reproduce.
- [ ] Adversarial parser suite passes.
- [ ] Determinism, concurrency, performance and export-fidelity gates pass.
- [ ] Engineering, security, product and legal sign-off is recorded.

## 27. First ten implementation actions

1. Pin the audited baseline and approve architecture, supported-document matrix, P0 list and numeric gates.
2. Remove or production-disable automatic test login, preview-token behavior, duplicate legacy upload/auth functions and session-cookie previews.
3. Stop running migrations from `npm run build`; create an explicit migration release job.
4. Add transaction abstraction, tenant schema, composite ownership constraints, RLS and separate runtime roles.
5. Codify isolated staging S3, KMS, GuardDuty, SQS/DLQ, Lambda and Mumbai Postgres through Terraform without provisioning production yet.
6. Replace base64 upload with direct multipart quarantine upload and fail-closed malware states.
7. Move DOCX parsing into the worker and enforce ZIP/package limits before decompression.
8. Make ingest atomic/idempotent with immutable generations and an orphan reconciler.
9. Persist final decision span maps/final indexes and implement positive/absence source validation.
10. Rebuild P0 rules against the evidence contract and frozen corpus before comments-only export.

---

## Appendix A: implementation-agent prompt

```text
You are the principal implementation agent for the Agmt Proof production-hardening programme in this repository.

Read AGENTS.md and docs/AGMT_PROOF_PRODUCTION_LAUNCH_BLUEPRINT.md completely before changing code. Treat the blueprint as the source of truth for architecture, work-package IDs, dependencies, acceptance criteria, security requirements, quality gates and stop conditions. Inspect the current repository and current git state; do not rely on an older summary of the code.

Your objective is to implement the blueprint in dependency order and leave the repository in a tested, reviewable state. Do not attempt a broad rewrite or declare the programme complete after implementing only the happy path.

Working rules:

1. Preserve unrelated user changes and never expose, stage or commit credentials, local environment files, production documents or private keys.
2. Do not deploy, provision cloud resources, alter production databases, rotate real keys, configure live auth providers or mutate external services unless the user explicitly authorizes that action. Repository code, migrations, tests, Terraform and documentation are in scope.
3. Start by mapping current code to the package IDs and recording evidence-backed status in docs/AGMT_PROOF_IMPLEMENTATION_STATUS.md. A package is complete only when its acceptance tests, security considerations and definition of done pass.
4. Follow the critical path and section 23 sequence. Begin with FND-01 and the stop-work security fixes in SEC-01/FND-05, then database integrity, object/job plane, parser safety, atomic ingest, cryptography, canonical/evidence correctness, P0 Proof, export, operations and final gates.
5. Work in small coherent batches. Before each batch, state package IDs, dependencies, files, migration impact, tests and rollback approach. Do not implement a package whose prerequisite is incomplete.
6. For each defect, add a failing regression test first where practical. Run the narrow tests during development and the full relevant suites before marking the package complete.
7. Treat all DOCX content, filenames and metadata as hostile. Fail closed on unsupported structures, malware outcomes, invalid evidence, missing capabilities, tenant ambiguity and key errors.
8. Never publish a finding unless it validates from canonical text through the final span map to exact OOXML source. Absence findings require an evaluated-scope inventory; fabricated fallback anchors are prohibited.
9. Keep migrations forward-only and separate from application builds. Use expand/migrate/contract, transaction boundaries, RLS, composite tenant constraints, immutable generations and idempotent queue handlers.
10. Do not weaken numeric gates to make tests pass. If a P0 precision, recall, evidence, security, export or DR gate cannot be met, keep launch blocked and report the evidence.
11. Use official vendor documentation for decisions that may have changed. Record consequential architectural decisions as ADRs.
12. After each batch, report changed files, migrations, tests and results, security impact, remaining risks, package status and the next dependency-ready batch. Keep the working tree and commits narrowly scoped.

Immediate first batch:

- Verify the audited findings against current main.
- Complete FND-01.
- Implement SEC-01 and FND-05 repository-side changes with regression tests.
- Draft the FND-02/FND-03 migration and transaction design, but stop for explicit review before any destructive or production data migration.
- Run all relevant existing Python and web test, typecheck and build commands.

Stop and request a human decision when the blueprint identifies one, when a migration could make historical ciphertext unrecoverable, when external service authority is required, or when the proposed course would expand scope beyond this repository.
```

## Appendix B: audit evidence and primary references

### Repository evidence at the audited commit

- `web/package.json`: build-time migration coupling and current test/build scripts.
- `web/migrations/0002_slice0.sql`: current tables, weak relationship constraints and deletion-job records.
- `web/src/lib/fn/document-upload.ts`: synchronous base64 upload and best-effort compensation.
- `web/src/lib/fn/agmt.ts`: confirmation persistence, legacy server functions and deletion scheduling.
- `web/src/lib/agmt/docx-v2.ts`: ZIP/package limits and current OOXML capability surface.
- `web/src/lib/agmt/canonicalise.ts`: final-decision segment rebuilding.
- `web/src/lib/agmt/proof/checks.ts`: current evidence-anchor defects.
- `web/src/lib/agmt/proof/runner.ts`: current canonical substring validation.
- `web/src/lib/agmt/crypto.ts`: legacy key derivation/fallback behavior.
- `web/src/lib/auth/test-access.ts` and `web/src/routes/login.tsx`: automatic test-workspace access.
- `web/src/lib/auth/gate-session.server.ts`: conditional session-cookie preview logging.
- `web/SLICE-0.md`, `web/SLICE-1.md`, `web/SLICE-2.md`, `web/docs/SPEC.md` and `web/docs/DATA-MODEL.md`: declared product and slice contracts.

### Official external references

- Vercel Function limits: <https://vercel.com/docs/functions/limitations>
- Vercel direct-upload guidance: <https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions>
- Vercel OIDC federation: <https://vercel.com/docs/oidc>
- Vercel Mumbai/Function pricing: <https://vercel.com/docs/functions/usage-and-pricing>
- Supabase regions: <https://supabase.com/docs/guides/platform/regions>
- Supabase pricing: <https://supabase.com/pricing>
- AWS Lambda limits: <https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html>
- AWS SQS at-least-once delivery: <https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues-at-least-once-delivery.html>
- GuardDuty Malware Protection for S3: <https://docs.aws.amazon.com/guardduty/latest/ug/how-malware-protection-for-s3-gdu-works.html>
- AWS KMS rotation: <https://docs.aws.amazon.com/kms/latest/developerguide/rotate-keys.html>
- Open XML SDK validation: <https://learn.microsoft.com/en-us/office/open-xml/word/how-to-validate-a-word-processing-document>
- CERT-In directions: <https://www.cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf>
- Digital Personal Data Protection Rules, 2025: <https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf>
