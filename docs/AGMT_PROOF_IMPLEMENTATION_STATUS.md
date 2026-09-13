# Agmt Proof implementation status

## Proof usefulness recovery — 13 September 2026

Status: **Implemented and Tested on a review branch; not browser-verified, Word-verified, merged or deployed.** This entry does not change the production release or waive the gates below.

- Reproduced the reported zero-tracked-change result using the user-supplied output locally. The file and its text remain outside Git, CI, logs and analytics. Permanent regressions use independently generated synthetic DOCX packages.
- Dictionary spelling now permits a tracked replacement only when the repair is uniquely determined under a bounded edit-distance, word-shape, legal-alternative and context policy. Ambiguous forms, legal near-neighbours, quoted prose, names, defined terms and unsafe OOXML spans remain comments or are withheld. Repeated safe misspellings are corrected at every exact span.
- Agreement-labelled correspondence is deterministically checked with the general-document rule profile. This keeps spelling, punctuation and placeholder checks while suppressing agreement-structure noise that cannot be justified from a cover email. The result carries requested/applied profile and policy-version receipts.
- The result screen previews each new exact finding on-device, distinguishes tracked corrections from Word comments, explains an automatic correspondence profile adjustment, and presents readable coverage instead of raw rule identifiers. No document content is persisted or transmitted by this change.
- Focused engine, worker and user-report tests: 27/27 pass. Full `npm run test:proof`: 232/232 pass. `npm run build:cloudflare` and the post-build `npm run typecheck` pass. The generated browser worker retains the no-server-module guard. A locally generated recovery DOCX passes ZIP/package reconstruction checks and contains one genuine deletion/insertion pair plus the expected new anchored comment; a pre-existing historical comment remains preserved.
- Remaining release gates: a real browser choose/process/preview/download journey against the exact built artifact, Microsoft Word open/no-repair plus accept/reject inspection of the new cross-run correction, and review/CI of the branch. A loopback-only development URL is not reachable from the controlled cloud browser, so no browser or Word claim is made here.
- Constraints unchanged: browser-only, zero LLM, no Hostinger, no Cloudflare Containers, no automatic R2 fallback. The host-agnostic `processProofLocal` seam remains available for a future explicitly enabled authenticated R2 mode; server upload routes remain fail-closed.

## Current temporary Proof release — 5 September 2026

Contract: [AGMT_PLATFORM_PROOF_SPEC.md](AGMT_PLATFORM_PROOF_SPEC.md). This section supersedes the historical package sequence and next-task statements below for new temporary Proof runs. Historical evidence and unresolved security gates remain intact.

### T00 reconciliation evidence

- Remote default branch `main` and branch list inspected using GitHub API; head `18f13fdeae935bd85796d5e80d481acb8bff42fb`. No existing Git checkout or working changes in this task workspace. Older scratch snapshot was not reused. Authenticated API reconstruction verified all 512 blobs, complete tree `c58666a52bdcb2c2299186478a39b6c9e049f3db`, and the signed commit hash. Clean shallow checkout; implementation branch `codex/platform-proof-t00`.
- Applicable instructions: `web/AGENTS.md`; no root or deeper AGENTS.md in remote tree. Read scoped Open Graph skill; `node scripts/brand-check.mjs --placeholder-ok` passes with zero warnings. No brand changes needed.
- Installed pinned lockfile via `npm ci --ignore-scripts --no-audit --no-fund`, Node 24.19.0. `npm test`: 229 script tests plus 115 application tests, all pass. `npm run build`: pass. Initial pre-build typecheck failed only because generated route tree was absent; regenerated using existing build workflow, then typecheck passed. `npm run check:auth` without a running dev server is indeterminate (exit 2), not a live authentication test.
- Actual code has Matter-bound synchronous/base64 ingestion and content writes in `web/src/lib/fn/{agmt,document-upload}.ts`; no temporary product run route or marked-DOCX exporter. `proof/runner.ts::validateHit` currently verifies substring presence only. `proof/checks.ts` uses fallback provision anchors. These cannot publish new Proof markup.
- `agmt/crypto.ts` still contains a legacy deployed test-derived wrapping fallback despite historical hardening wording. New Proof must not import that persistence path. Track removal/route closure in T12 without rewriting historical ciphertext.
- No live environment credentials, provider configuration or current deployed state verified. Historical sandbox receipts are not current live evidence. No migration, historical-data operation, cloud spending or deployment performed.

### Reuse and scope map

| Existing implementation / old packages | New task and treatment |
|---|---|
| `web/src/lib/auth/*`, `db-context.server.ts`, `db-transaction.ts`; SEC-01/FND-02/FND-04 | T05/T06/T12: preserve verified session, tenant context, transactions and RLS; provision/rehearse runtime roles later. |
| `agmt/docx-v2.ts`, `zip-safety.ts`, `numbering.ts`, `types.ts`; WRK-02/03, CAN/EVD | T02: extend existing extraction with exact node mapping and complete scope evidence; no confirmation wizard or anonymising rewrite. |
| `agmt/proof/{registry,checks,runner,product}.ts`; PRF | T01/T03: six-rule pinned launch selection; retain experimental rules/tests without launch promotion. |
| `server/{object-store,direct-upload,malware-gate}.ts`; OBJ | T07/T09: implement real providers through existing boundaries; no filename persistence. |
| `server/{jobs,worker-contract,object-reconciliation}.ts`, migration 0005; JOB/ING/WRK-01 | T06/T08/T10: extend ownership, deadlines, cancellation and outbox; no second job system. |
| `agmt/export/` absent; EXP | T04: real Word revisions/comments and local demonstration before infrastructure. |
| Existing routes/components, `docs/brand`; UX | T05/T11: product run UI, preserve design, remove compulsory Matter/mandate/map for Proof. |
| CRY historical key/vault migration, document backup/legal-hold OPS, Review/Mail | Deferred/out of scope for new Proof; no historical migration or cleanup authorized. SSE-KMS and metadata recovery remain relevant. |
| OPS retention/security/release, TST | T08/T12–T16: independent deletion, content-free metadata, frozen corpus, Word and live retention/release gates. |

### T01 evidence

- Changed `web/src/lib/products/contracts.ts`, `server/retention{,.test}.ts`, `agmt/proof/{contracts,contracts.test,typo-allowlist,registry}.ts`, `agmt/corpus/launch-fixtures.ts` and package test scripts.
- Millisecond clock origin and immutable 15-minute upload, 110-minute processing, 115-minute access and 120-minute purge deadlines; grants floor remaining seconds. Attempts require a full 300-second runtime plus an explicit initial 60-second cleanup budget strictly before processing cutoff. Retry/read helpers never extend clocks.
- Strict source/finding/export schemas reject invalid lengths, unknown fields, absent absence evidence and non-launch rules. Schema acceptance alone is expressly insufficient for source validity (T02).
- Five reproducible synthetic DOCX variants: ordinary body, split styled runs, table, prior anchored comment plus unrelated insertion/deletion, and Recieve party name trap. Exact half-open UTF-16 quote offsets and expected two corrections/two comments are frozen, not yet claimed as engine output.
- `node --experimental-strip-types --test src/lib/server/retention.test.ts src/lib/agmt/proof/contracts.test.ts`: 5/5 pass. `npm run typecheck`: pass. Existing regression suite remains enabled, and new tests included in scripts.
- No new dependency, database, auth, content-storage or cloud change. Next: T02 exact original-package source mapping and scope validation.

### T02 evidence

- Changed `web/src/lib/agmt/docx-v2.ts`, `source-map{,.test}.ts` and test scripts. Extended the current preserve-order parser through an optional memory-only callback; existing durable ingestion receives no new content fields.
- Source maps retain immutable original XML and numeric node paths, reconstruct split-node quotes, distinguish repeated occurrences, preserve exact UTF-16 including astral/combining characters, and record final-view revision/field edit exclusions. Table cells remain independently anchored. The launch lane does not call the historical fallback hit validator.
- Main-body/schedule inventory refuses absence evidence when unsupported text containers, unbalanced fields or complex revisions make it incomplete. Non-main story coverage remains an explicit T03/T13 limitation; no fake body anchor is generated.
- Hardened current bounded XML reads to reject malformed XML and DTD/entity declarations before parsing. Existing ZIP/capability regressions remain unchanged.
- Targeted source-map + docx-v2 suite: 13/13 pass. Full suite: 229 script + 124 application tests pass. Typecheck and production build pass. Source buffers unchanged; original insertions/deletions preserved and deletion text excluded from the new projection.
- Next T03: use these exact nodes and scope inventory for six launch predicates; validate predicate and source together before output. No live infrastructure or Word claims.

### T03 evidence

- Added `web/src/lib/agmt/proof/{launch-checks,launch,launch.test}.ts`; kept historical registry/checks/runner callers and tests intact. New launch orchestration uses existing `docx-v2` and `resolveExtractedNumbering`, with no Matter, mandate, anonymisation or page-count gate.
- Four demonstration variants each yield exactly the frozen four findings. Six launch rules report actual outcomes; missing/ambiguous numbering or definition scope is suppressed. Exact validator can replay a predicate to reject tampered comment/action/scope evidence. More than 500 findings explicitly fails.
- Negatives cover Recieve party names, valid `that that`/`had had`, quotes, URL/email tokens, external statute references, valid brackets, existing comments, and schedules restarting numbering/definitions. Existing tracked text is comment-only when safe; complex review structures/protection refuse.
- Network-instrumented engine test blocks fetch, net connect/createConnection and HTTP(S) request; observed calls 0. No LLM/provider dependency introduced. Four focused tests pass; full suite 229 script + 128 application tests, typecheck and production build pass.
- Remaining corpus limitations are explicit: non-main stories produce limited coverage; more sophisticated scope/language boundaries and native numbering/export corpus remain T13 gates. No public accuracy claim or real-file deployment made. Next T04: real marked DOCX and automated structural/accept-reject validation.

### T04 evidence and reviewable Word fixtures

- Added `web/src/lib/agmt/export/{docx,docx.test,ooxml}.ts`, `web/scripts/proof-demo.ts`, generated synthetic `web/src/lib/agmt/corpus/launch-demo/*` and test/demo scripts.
- `npm run proof:demo` generates original/marked pairs and SHA-256 evidence for body, styled split runs, table, prior review and party-name cases. Each positive output has two logical corrections (three revision elements) and two exact anchored comments. Party-name negative output equals the original byte-for-byte.
- Planner deduplicates identical findings and blocks conflicting/overlapping edits. Minimal paragraph replacements retain untouched document XML bytes and untouched ZIP entries. Original run formatting is preserved through split deletions and insertions; IDs are allocated without collision and previous authors' review is not accepted/rejected.
- Every marked output reopens, validates XML/package relationships, checks exact comment text/range and revision identifiers, compares untouched parts, reconstructs rejected Agmt-only edits against original semantic XML, and compares accepted text to the exact plan. Negative tests corrupt anchors/comment text/untouched entries/source binding and fail validation. Coverage gaps create a persistent explicit document notice; clean zero-findings output stays unchanged.
- Focused exporter suite 4/4 passes. Full suite 229 script + 132 application tests; typecheck and production build pass. `proof:demo` passes all five variants. Generated evidence records Word/SDK as `not_run`.
- Microsoft Word, LibreOffice and dotnet/Open XML SDK are absent locally. Microsoft documentation for comment records/ranges/references and w:ins/w:del was checked; that is implementation guidance, not fidelity validation. Word no-repair/All Markup checks and SDK validation remain release blockers. Existing tracked-text correction intersections currently fail export when exact safe markup is unavailable; expanded support remains T13, not a claimed capability.
- Next independent task: T05 product shell. No live DOCX processing, cloud spending, production-data change or two-hour storage deletion verified.

### T05 evidence

- Added product registry/guard, server handler map, pure run-view states, `/proof` selection screen and typed result component. Existing `Shell` and visual tokens reused; former home Matter UI moved to `/matters` without changing its functions. Home now introduces Agmt and links to Proof. Planned/unknown/disabled products cannot resolve a handler.
- Login return path accepts only `/proof` or `/`; provider callback and post-login navigation use the validated value. No guest, test-workspace or auth bypass added. Proof rejects dev-fallback identity for its sign-in copy and does not issue any upload grant.
- Local file selection validates extension and 25 MiB cap, preserves name only in component memory, exposes a disabled Proofread button and explicitly states beta upload is unavailable. Result component prioritizes download, carries coverage/deadline copy, and never says files deleted without a verification timestamp. Fixture data is confined to tests, not fake server jobs.
- Product/state tests 2/2 pass, including all ten states, expired download denial, unsafe redirects, invalid files and planned/disabled handler rejection. Full suite 229 script + 134 application tests; production build and typecheck pass.
- Dev server requires explicit localhost binding in this container (wildcard binding raised `uv_interface_addresses`); no auth/configuration override was used. Browser phone/desktop verification pending Chromium availability; no visual pass claimed. Existing auth-invariant can be tested against the localhost server. T06 metadata work is independent of that visual gate.

### T06 evidence

- Added forward-only `web/migrations/0006_product_runs.sql` with independent `product_run` and `product_artifact` metadata tables. The temporary Proof plane stores tenant/owner, immutable server-derived deadlines, pinned parser/rule/exporter versions, idempotency and integrity metadata plus opaque storage keys; it has no filename, document text, comment text, source bytes, ciphertext or Matter/document/object-blob foreign key.
- Deadlines are database checks and an update trigger: retention is exactly upload + 2 hours, access is 5 minutes earlier, processing is 10 minutes earlier, and the upload grant is capped at 15 minutes. Both tables use forced RLS with app-owner, worker-tenant and support-ticket read policies. The app role cannot see another tenant and cross-tenant writes fail closed.
- Added `web/src/lib/server/product-runs.ts`: server-context-only input validation, executable-product guard, 25 MiB/integrity checks, idempotent creation, immutable deadline hydration, explicit uploading→scanning→…→deleted state transitions and cancellation-generation fencing. It never accepts client deadlines, bytes, filenames or legacy Matter identifiers.
- Focused checks: migration static + PGlite constraint/RLS rehearsal 2/2; product-run validation/transition tests 2/2. Full suite now reports 231 script + 136 application tests, all passing; typecheck and production build pass. The PGlite rehearsal is synthetic only; no live migration, production data, cloud spending, deployment or two-hour deletion claim was made.
- Matter compatibility decision: legacy Matter-bound `upload_intent` and `proof_run` remain untouched for historical workflows. Temporary Proof uses the independent product-run plane and creates no empty Matter, mandate or map. Next: T07 concrete storage/provider plan and bounded upload seam.

### T07 progress

- Added reviewable, no-credentials `infra/proof/README.md` defining separate private quarantine/temporary buckets, per-environment SSE-KMS, least-privilege scan/worker/purge boundaries, checksum-aware multipart behavior, opaque key rules, queue/DLQ separation, fail-closed configuration and a $70–150/month planning allowance. No provider, billing account, bucket, queue, KMS key or secret was created.
- Existing `S3ObjectStore` synthetic tests already cover put/get/delete, immutable keys and integrity checks. T07 is not complete: current AWS API/pricing verification, concrete SDK client wiring, list/abort tests, Terraform plan and synthetic-account IAM rehearsal remain pending. Uploads stay disabled.

### Current Cloudflare deployment evidence — 5 September 2026

- The Cloudflare device authorization completed after the earlier unauthenticated check. `wrangler whoami` reports the authorized `dexterinlab@protonmail.com` session for the Dexters Lab account. Four server-only secrets were installed with `wrangler secret put` without printing their values; `AGMT_DB_ROLE=agmt_app` and `AGMT_PUBLIC_URL=https://agmt.dexterinlab.workers.dev` were supplied as deployment variables.
- Cloudflare request-environment support is now lazy and server-only: `AGMT_APP_DB` and `AGMT_AUTH_DB` Hyperdrive bindings take precedence over the application and Better Auth URL secrets, and Better Auth initialization waits until Nitro has populated `globalThis.__env__`. The same resolver covers the auth-email, gate-identity, connector and object-store server paths. No credentials are committed.
- `npm run typecheck` passes; `npm run test` passes 232 script tests and 138 application tests; `npm run build` produces the Cloudflare artifact. The exact artifact was deployed with `wrangler deploy --config web/.output/server/wrangler.json --keep-vars`; Cloudflare returned version `09444c32-19d8-417e-9c06-1fe31e95e4a8`.
- Fresh live checks after that deployment returned root HTTP 200 with the current Agmt/Proof markup, `/proof` HTTP 200 with the current Proof screen, and `/taskpane.html` HTTP 302 to `/`. These checks prove the current UI is live; they do not prove upload, authentication, Word fidelity, database migration or two-hour deletion.
- Hyperdrive creation was authorized but remains blocked in this workspace by the Cloudflare API network-approval layer before a response is returned. No Hyperdrive config or binding was created; the generated deployment config currently lists only `ASSETS` plus the two public variables. The direct URL secrets are therefore only a fallback for the current UI, and database-backed routes remain unverified.
- Next acceptance: create two Cloudflare Hyperdrive configs from the generated least-privilege Supabase logins with SQL-response caching disabled, attach them as `AGMT_APP_DB` and `AGMT_AUTH_DB`, add their opaque IDs to `web/wrangler.jsonc`, rebuild/deploy, then verify `/api/auth/get-session` and a synthetic database transaction before progressing T07–T12.

### Cloudflare deployment reconciliation

- The supplied `https://agmt.dexterinlab.workers.dev/taskpane.html` URL was traced to the repository root `src/worker.ts` and Dockerfile, which serve the legacy Python task pane and redirect `/` to `taskpane.html`. It was not serving the current `web/` application.
- Added a Cloudflare Worker build/deploy path: `web` selects Nitro `cloudflare_module` in `cloudflare` mode; root `build:web` installs/builds that app and deploys the generated `.output/server/wrangler.json`; root `wrangler.jsonc` now points at the current web output instead of the legacy Container/Durable Object. Cloudflare runtime detection and the supplied Worker hostname were added to the deployed auth/encryption/database guards. A static deployment-config test passes 1/1, and the Cloudflare build completed locally.
- The earlier redirect-only compatibility patch sent the former `/taskpane.html` bookmark to the current platform root; it did not serve the legacy pane. The earlier live check recorded HTTP 500 with `{"status":500,"unhandled":true,"message":"HTTPError"}` for both `/` and `/taskpane.html`; that historical observation is superseded by the current deployment evidence above. The local and GitHub Actions deploy paths still build the current `web/` output, use the generated Wrangler config and preserve dashboard-managed public variables with `--keep-vars`.

### Current ordered checklist

| Task | Status | Next acceptance / blocker |
|---|---|---|
| T00 | Complete | Reconciliation and baseline above; imported exact supplied contract and marked superseded scope in historical documents. |
| T01 | Complete | 5 targeted tests pass; contracts, deadlines, allowlist and five synthetic fixture variants frozen. |
| T02 | Complete (core body/table mapping) | 13 focused parser/source tests; source/quote reconstruction, UTF-16 and incomplete-scope denial pass. |
| T03 | Implemented; corpus promotion pending T13 | Four focused tests pass across demo, exclusions, duplicates and 501-finding rejection; six pinned execution outcomes. |
| T04 | Repository implementation complete; Word/SDK unverified | Four export tests pass; synthetic marked DOCX files generated and validated. |
| T05 | Repository implementation complete; browser check pending | Product catalogue, local selection and typed run views; upload deliberately disabled pending T08/T09. |
| T06 | Complete | Metadata-only product runs/artifacts, immutable deadlines, RLS and explicit transitions implemented; 2/2 migration checks, 2/2 service checks, full suite/build/typecheck pass. No live migration or retention drill claimed. |
| T07 | In progress (plan drafted) | `infra/proof/README.md` is reviewable and no-spend; provider/API verification, concrete client/list/abort adapter, Terraform and synthetic IAM evidence remain. |
| T08 | Pending | Purge, independent sweep, writer fencing and verified absence. |
| T09 | Pending | Authenticated direct upload and authoritative scanning. |
| T10 | Pending | Isolated async worker and conditional publication. |
| T11 | Pending | Actual download, truthful coverage and verified manual deletion. |
| T12 | Pending | Content marker audit, old route closure, quotas and real auth. |
| T13 | Pending | 24-document corpus, SDK/Word verification. |
| T14 | Pending | Real two-hour drill, delayed writes, outage and recovery evidence. |
| T15 | Pending | Measured capacity and concrete release/rollback evidence. |
| T16 | Pending | Authorized beta release and actual independent tester completion. |

Only one task is active. Unavailable human Word/provider gates must remain explicit; continue independent repository work. No local test constitutes live Word fidelity or two-hour deletion evidence.

---

## Historical hardening ledger (preserved)

**Baseline:** current `main` before JOB-01/OBJ-01 at `c75ef227eb0ee8e7745de4d625de2ff5123bfa82` (30 August 2026)  
**Latest merged main:** `ebe8504b4f9673cc1e36fd9772c7a64e51eff220` via PR #26  
**Latest implementation branch:** `proof-production-hardening/fnd02-adapter-regression` at `367a087fec2ea00397b9fa88249bbc70e42fee94` (FND-02 concrete blob reconciliation adapter regression; PR #24 merged)  
**Scope:** repository-side production hardening plus one explicitly authorized schema migration to an empty, non-confidential Supabase Mumbai sandbox. No AWS resources, production database, confidential documents, live authentication provider, or object bytes were changed.

## Baseline verification

- `AGENTS.md`: absent from current `main` (repository API returned 404); no baseline repository-local agent instructions were available. The hardening branch adds scoped guidance at `web/AGENTS.md` for the checked-in web workspace.
- `docs/AGMT_PROOF_PRODUCTION_LAUNCH_BLUEPRINT.md` is present and was read in full before code changes.
- The audited findings are reproducible from current source: automatic test-workspace access, baked preview OAuth credentials, database-derived deployed auth fallback, build-time migration coupling, synchronous/base64 ingestion, sequential persistence, and PostgreSQL document blobs.
- Current baseline is not launch-ready for confidential documents.
- The user-selected Supabase Free project in Mumbai is the current empty integration sandbox. Its schema migration was applied and independently verified; no credentials, connection strings, private keys, or production documents are stored in the repository. It must not receive confidential documents until FND-04 and the remaining launch gates pass.

## Evidence from the latest code head

At verified implementation code head 367a087fec2ea00397b9fa88249bbc70e42fee94 (FND-02 concrete blob reconciliation adapter regression; PR #24 merged):

- Web Proof workflow 33340354017: route/build verification, typecheck, DB transaction hardening, production build, Proof golden corpus, and the full web suite all passed; Eval workflow 33340354044 passed.
- The full web test run reported 115/115 tests passed with 0 failures.
- `blobs.test.ts` exercises the real manifest/provider reconciliation boundary: confirmed rollback records then deletes the exact object, unknown outcomes record-only and retain bytes, and immutable manifest mismatches remain unresolved without deletion.
- `db.ts` now uses explicit TypeScript module extensions, allowing the server-only adapter boundary to be loaded by the repository’s strip-types test runner without triggering a false local-bootstrap failure.
- The prior WRK-03 story-capability and FND-02 transaction/reconciliation evidence remains recorded below. No credentials, connection strings, private keys, production documents or environment files are present in the changed repository paths.

## Package ledger

| Package | Status | Evidence and remaining work |
|---|---|---|
| FND-01 | Implemented; human approval pending | Baseline ADR, supported DOCX matrix, invariants, state boundaries, non-goals, gate ownership and stop conditions are recorded. |
| SEC-01 | Repository changes implemented; security review pending | Test-workspace access, preview secrets and legacy duplicate paths are removed; deployed auth requires explicit configuration. |
| FND-05 | Implemented repository-side; release rehearsal pending | Builds are separated from manual forward-only migrations with SHA-256 ledger validation; least-privilege release credential rehearsal remains open. |
| FND-02 | Repository transaction/reconciliation implemented; production rehearsal pending | Provider-neutral transactions, rollback/release behavior, atomic Matter/document publication, exact external artifacts and fail-closed reconciliation are tested. The concrete manifest/provider adapter now has rollback, unknown-outcome and mismatch regressions. Managed Supabase/S3 fault rehearsal, worker reconciler and operational orphan scans remain open. |
| FND-03 | Expand migration implemented; contract and historical review pending | Tenant/member tables, nullable tenant columns, composite keys/FKs and empty-sandbox rehearsal pass; validation and NOT NULL contract are intentionally deferred. |
| FND-04 | Repository and empty-sandbox implementation complete; production security review pending | 32/32 public tables are forced-RLS with 108 policies; runtime roles are non-login/non-bypass; PGlite and real synthetic crossover probes pass. Login-role provisioning, managed sandbox probe-membership cleanup and owner review remain open. |
| JOB-01 | Implemented repository-side; empty-sandbox schema verified; production worker review pending | Tenant-bound upload/job/outbox state machines, guarded transitions, leases, idempotency and RLS are implemented and tested. Isolated worker execution and production IAM remain open. |
| OBJ-01 | Implemented repository-side; empty-sandbox schema verified; production object-store review pending | Server-only provider boundary, immutable tenant-hashed keys, integrity checks and metadata-only manifests are implemented and tested. Direct upload, malware quarantine, S3 wiring and KMS remain open. |
| OBJ-02 | Repository contract implemented; live integration pending | Bounded DOCX multipart planning, tenant/Matter ownership binding, short-lived HTTPS grants and exact completion integrity are tested. Live S3 presign/complete/abort wiring remains open. |
| OBJ-03 | Repository contract implemented; live integration pending | Exact clean-result acceptance, fail-closed threat/failure handling and duplicate/conflict behavior are tested. GuardDuty/EventBridge authenticity and quarantine wiring remain open. |
| WRK-01 | Repository contract implemented; live integration pending | Strict metadata-only worker envelope and bounded duplicate/crash/timeout/fatal dispositions are tested. Lambda/SQS/DLQ isolation, IAM, egress and image controls remain open. |
| WRK-02 | Repository-side boundary implemented; worker/resource proof pending | Central-directory preflight, bounded extraction, path/record validation and hostile ZIP regressions are implemented. Isolated-worker CPU/memory proof, adversarial corpus, image and IAM controls remain open. |
| WRK-03 | Repository-side capability inventory expanded; differential review pending | Content types, relationship targets, external-target policy, notes, fields, revisions, bookmarks, sections and non-main stories are inventoried with fail-closed parsing. Word/differential golden coverage and broader external/active-content review remain open. |
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

- docx-v2.ts validates content types and relationship parts before extracting the main story, never follows external targets, resolves internal targets within the package and rejects missing/escaping relationships and active-content types.
- The extracted document reports evaluated capability states for package metadata, relationships, external relationships, active content, comments, revisions, fields, tables, headers/footers, footnotes, endnotes, bookmarks and sections. Fields, revisions and bookmarks are now collected from the main, header/footer and note story objects; footnote/endnote paragraphs carry story-specific source anchors.
- Web Proof workflow 33339789811 and Eval workflow 33339789841 passed at the code head above; the full web suite reported 112/112 tests. Regressions cover external relationship inventory, note extraction, non-main-story fields/revisions/bookmarks, malformed comment identity, bookmarks, sections and relationship traversal.
- WRK-03 remains open under the blueprint until differential Word/golden inventories and the broader external/active-content corpus pass, and until worker isolation/resource controls are reviewed. This batch made no migration or external-service change. See ADR 0010.

## FND-02 transaction and reconciliation evidence

- The provider-neutral adapter exposes transaction callbacks with allow-listed isolation levels. Managed Postgres pins one client, configures tenant context, rolls back confirmed callback/configuration failures, releases in finally, and reports commit/rollback uncertainty instead of pretending it is safe to compensate. PGlite reports the same outcome class for local parity.
- Matter creation publishes its Matter, mandate, active pointer and audit row in one callback. Document upload parses before acquiring a connection, then publishes metadata, document/version, canonicalisation rows, capabilities, current pointer and audit row atomically.
- putBlob carries the exact external publication artifact. The upload catch path records that artifact outside the failed transaction; only a confirmed rollback permits exact provider cleanup. Unknown outcomes are record-only and never delete rows or bytes.
- Web Proof workflow 33340354017 and Eval workflow 33340354044 passed at the adapter-test code head; the full web suite reported 115/115 tests, including concrete provider/manifest reconciliation regressions.
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
- FND-02 repository-side transaction, injected-failure and exact object-reconciliation coverage is implemented, including the concrete manifest/provider adapter boundary. It remains a launch blocker until the managed Supabase/S3 path is rehearsed with injected failures and the later worker/object-job reconciler proves idempotent staged-orphan handling.
- FND-03 contract work must stop on any ambiguous owner, missing principal, tenant mismatch or unverifiable historical ciphertext/key. No historical ciphertext migration has been attempted.
- The green `229/229` repository suite closes only the repository/template gate. It does not waive the blueprint P0 precision/recall, exact evidence, parser, export, lifecycle, DR, operational or production-authentication gates.
- WRK-02 and WRK-03 repository-side parser controls are implemented, but worker resource proof, adversarial/differential corpora and production security review remain open. The next dependency lane is ING-01 only after FND-02 transaction/reconciliation review; live OBJ-02/OBJ-03/WRK-01 wiring must still stop for owner-approved AWS/data-plane setup and review.
- Production use remains blocked until the blueprint's P0, evidence, tenant, parser, export, lifecycle, DR, security and operational gates pass.
