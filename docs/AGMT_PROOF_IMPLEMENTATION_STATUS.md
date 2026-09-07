# Agmt Proof implementation status

## Proof World Class (PWC) ledger

This section is the controlling implementation ledger for the Proof World Class initiative defined in [AGMT_PROOF_WORLD_CLASS_PLAN.md](AGMT_PROOF_WORLD_CLASS_PLAN.md). Historical T00–T16 and hardening receipts below remain evidence. They are not PWC completion. Do not restart those sequences blindly.

Evidence vocabulary follows the plan: **Existing**, **Implemented**, **Tested**, **Verified**, **Deployed**, **Proposed**, **Blocked**, **Superseded**.

### Workspace and branch

| Item | Value |
|---|---|
| Date (UTC) | 2026-09-07 |
| Environment | Windows PowerShell; Node v24.11.1; npm 11.7.0 |
| Workspace | `D:\AI Agent\agreement-agent` (normal checkout, not a linked worktree) |
| Implementation branch | `proof-world-class-implementation` |
| Remote | `origin` = `https://github.com/Daaktor0/AgmtAgent.git` |
| Local `main` at session start | `b2d48d6f52bf6afdad33821db5daf70c107f5e5f` (stale vs remote; left untouched) |
| `origin/main` after fetch | `6a7e80d7cdc584f4b1c67f1fce822da0e230dc53` |
| Audit baseline (plan) | `15ad1e8c04533d5152107d614999d9fdc2dd5889` |
| Planning branch / commit | `origin/proof-world-class-plan` / `2016c7a19758f25db2449f222618484155ed5ba5` |
| Plan brought onto this branch | cherry-pick of `2016c7a` → `b7126c712950b1f521a2b1bad832c4922a4b2266` (docs-only; inspected before cherry-pick: one file `docs/AGMT_PROOF_WORLD_CLASS_PLAN.md`) |
| Untracked local paths preserved (not committed) | `.env.txt`; `For developer, with love.txt`; `web/scripts/production-hardening.test.mjs` |
| Applicable AGENTS | `web/AGENTS.md` only. No root or deeper AGENTS.md. |

### Reconciliation since audit baseline `15ad1e8`

`git diff --stat 15ad1e8 origin/main` is confined to `/site` (Open Form / v2 public-website overhaul: `2dae374`, merge `6a7e80d`). No Proof engine, API, migration, Worker or storage files changed on `main` after the audit. `/site` remains out of scope for PWC tasks.

Plan file SHA-256 on this branch: `1A62526A909B0AF7F020ABEDD276CEA725AC781952C15C724D1D8AEE1F819258`.

### Deployment entrypoint (current source)

| Surface | Status |
|---|---|
| Selected deploy | Root `package.json` `deploy` / `.github/workflows/deploy-cloudflare.yml`: `npm run build:web` then `wrangler deploy --config web/.output/server/wrangler.json --keep-vars` |
| Selected build | `web/vite.config.ts` Nitro preset `cloudflare_module` when `mode === "cloudflare"` |
| Bindings in `web/wrangler.jsonc` | R2 `AGMT_OBJECTS` → `agmt-proof-objects`; Hyperdrive `AGMT_APP_DB`, `AGMT_AUTH_DB`; cron `*/5 * * * *` |
| Alternate, not selected | `web/vite.cloudflare.config.ts` (Nitro `node-server`); root `src/worker.ts` + Dockerfile Container web backend |
| Historical Vercel/AWS T07 draft | `infra/proof/README.md` still describes S3/KMS. **Superseded** for new temporary Proof by plan sections 17–20. Existing R2 adapter code is **Existing**; dedicated quarantine/temporary buckets and independent purge Worker are **not Implemented** |

### PWC-00 — Reconcile baseline and create PWC ledger

- **Baseline commit:** `6a7e80d7cdc584f4b1c67f1fce822da0e230dc53` (`origin/main`); plan commit on branch `b7126c712950b1f521a2b1bad832c4922a4b2266`.
- **Change commit:** `5c031b1193aec13082faedbb0dd9f7411c783305`.
- **Files changed:** `docs/AGMT_PROOF_IMPLEMENTATION_STATUS.md` only.
- **Status:** Implemented; Tested (documentation checks); Verified not applicable (no browser/Word/live production claim). Not Deployed.
- **Objective met:** Branch created from latest main; controlling plan present; current defects re-probed; historical receipts preserved; first eligible tasks identified.

#### Contract probe — scanning → processing (re-run, not a completed flow)

Command (from repo root, Node v24.11.1):

```
node --experimental-strip-types --input-type=module -e "import { canTransitionProductRun } from './web/src/lib/server/product-runs.ts'; ..."
```

Actual results:

| Transition | Result |
|---|---|
| `uploading` → `scanning` | true |
| `scanning` → `processing` | **false** |
| `scanning` → `queued` | true |
| `queued` → `processing` | true |
| `processing` → `exporting` | true |
| `exporting` → `ready` | true |
| `failed` → `queued` | false |
| `failed` → `scanning` | false |

Code evidence: `web/src/lib/server/product-runs.ts` transition table still disallows `scanning` → `processing`. `web/src/lib/server/proof-service.ts::uploadAndProcessProof` still calls `transitionProductRun(..., from: scanning.status, to: "processing")` after `scanProofDocx`. **Existing defect.** A valid-file upload that reaches that call cannot complete the documented state machine. This is a code/contract probe, not a live authenticated reproduction. Do not “fix” it by adding `scanning` → `processing` (PWC-01 must-not-change; new queue path is PWC-16/24).

#### Audit findings rechecked against current source

| Finding | Current evidence | Label |
|---|---|---|
| Rejected upload-state transition | Probe above; service still requests the illegal transition | Existing defect |
| Structural screening presented as security gate | `proof-scan.ts` comment says it is not antivirus, but it still runs JSZip CRC load before central-directory safety, inspects private `_data`, refuses all external relationships, and is the only scan before `putBlob`. No ClamAV. Limits 2,000 entries / 100 MiB / 100:1 vs `zip-safety.ts` 4,096 / 150 MiB / 250. `inspectZipCentralDirectory` is used by `docx-v2.ts`, not by `scanProofDocx` | Existing defect / incomplete gate |
| Incomplete deletion verification | `deleteProofRun` calls `deleteBlob` then sets `deletion_verified_at = now()` with no provider HEAD/list absence check. Missing manifests return early in `deleteBlob`. Purge uses `list_due_product_runs($1)` with batch 25, sequential, same-app cron in `web/server/plugins/cloudflare.ts`, which logs the raw error | Existing defect |
| Contradictory availability | Home (`web/src/routes/index.tsx`): “Beta preparation · uploads not yet available”. Proof (`web/src/routes/proof.tsx`): signed-in users can POST `/api/proof/upload`. Catalogue `PRODUCTS.proof.availability = "available"`. No fail-closed readiness switch | Existing defect |
| Bytes before verified-email | `api/proof/$.ts` authenticates `requireUserId` then `request.arrayBuffer()` then `authenticatedProofUpload` → `requireVerified` | Existing defect |
| Source map main-story only | `source-map.ts` hard-codes `partUri: "/word/document.xml"` | Existing |
| Envelope encryption on current Proof path | `blobs.ts` still encrypts via `encryptBytes` / `object_manifest`. Plan supersedes this for *new* temporary runs (R2 managed encryption) without rewriting historical ciphertext | Existing; new lane **Proposed** |

#### Documentation checks (PWC-00 unit tests)

- Plan headings `### PWC-00` … `### PWC-45` plus `### PWC-33A`: 47/47 present, 0 missing.
- Inspect/create paths named by PWC-00 and the immediately following inspect lists exist (AGENTS, ledger, plan, registry, product-handlers, proof/index routes, proof-service, launch-fixtures, zip-safety, docx-v2, proof-scan, source-map, export/docx, product-runs, retention, object-store, wrangler configs, deploy workflow, cloudflare plugin, migration 0008). Future PWC create paths (e.g. `capabilities.ts`) are targets, not current files.
- Next unused migration number: **0009** (`0008_proof_purge_function.sql` exists).

#### Unresolved production verification (not claimed)

- Authenticated upload → download on `https://app.agmt.legal/proof`: **Blocked** (no authorized test session this session).
- Microsoft Word / Open XML SDK fidelity: **Blocked** (D-04; not run).
- Live R2 absence / two-hour retention drill: **Blocked**.
- Mapping live custom domain to this Git SHA: **Blocked**.
- Founder decisions D-01…D-07: open; do not block PWC-01/PWC-03.

#### Commands and results this task

| Command | Result |
|---|---|
| `git fetch origin --prune` | Updated `origin/main` to `6a7e80d`; discovered `origin/proof-world-class-plan`. No `origin/proof-world-class-implementation` |
| `git checkout -b proof-world-class-implementation origin/main` | Branch created from latest main |
| `git cherry-pick 2016c7a…` | Success; 1 file, 1553 insertions |
| Transition probe | counts above; `scanning→processing` false |
| Task-ID / path resolve | 47/47 headings; listed inspect paths present |
| Runtime unit/integration tests | Not applicable for PWC-00 (documentation task). `npm run test:proof` not required and not claimed |

Fixture hashes: none (no document fixtures generated). Versions: Node 24.11.1, npm 11.7.0, controlling plan as cherry-picked.

#### Remaining blockers and next eligible tasks

- No local blocker for PWC-01 or PWC-03.
- **Next executable task (critical path):** PWC-01 — fail-closed capability and upload gate. Must not add `scanning` → `processing`.
- **Parallel after PWC-00:** PWC-03 — independently generated corpus fixtures.
- PWC-02 depends on PWC-01.

### PWC-01 — Add one fail-closed capability and upload gate

- **Baseline commit:** `a30a0c2` (PWC-00 SHA fill-in; branch head before this task).
- **Change commit:** `112b1d6e19fe51b3917b1b179d68660babb111ee`.
- **Files changed:** `web/src/lib/products/capabilities.ts`, `web/src/lib/products/capabilities.test.ts`, `web/src/lib/server/proof-service.ts`, `web/src/routes/api/proof/$.ts`, `web/src/routes/index.tsx`, `web/src/routes/proof.tsx`, `web/package.json` (test script), `docs/AGMT_PROOF_IMPLEMENTATION_STATUS.md`.
- **Status:** Implemented; Tested (7/7 capabilities tests + 2/2 existing product tests). Browser fixture copy agreement Tested. Live Chromium home/Proof Verified **Blocked** (no browser MCP in this session). Word not applicable. Not Deployed.
- **Must-not-change held:** `canTransitionProductRun("scanning","processing")` remains false; transition table unchanged.

#### Behaviour

`acceptingUploads` is true only when `PROOF_UPLOADS_ENABLED` is explicitly true **and** purge, scanner and validator readiness timestamps are present and fresh (90 s / 24 h / 90 s). Missing, false, unknown, stale or future signals deny. Default production state is paused.

- `GET /api/proof/capabilities` is anonymous and returns the section 18 DTO (`apiVersion: 2`).
- `POST /api/proof/upload` calls `proofUploadAdmissionResponse()` **before** `request.arrayBuffer()`. Direct POST while paused returns 503 `uploads_paused` and does not create a run.
- `GET /api/proof/download/:id` and `DELETE /api/proof/run/:id` are not gated by the upload switch.
- Home and Proof render the same paused copy: “Proof is temporarily unavailable for new uploads.” / “Existing downloads and deletion remain available.”
- Proof submit rechecks capabilities before POST. Proofread stays disabled while paused.
- Current synchronous upload path remains closed until replacement gates (PWC-17–25) report readiness.

#### Commands and results

```
cd web
node --experimental-strip-types --test src/lib/products/capabilities.test.ts src/lib/products/products.test.ts
```

Actual: **9/9 pass**, 0 fail. Node v24.11.1.

Fixture hashes: none. Versions: `proof-launch-v1` / `proof-support-matrix-v1`.

#### Remaining blockers and next eligible tasks

- Live browser agreement of home/Proof: Blocked (no browser driver this session).
- Upload remains correctly closed until purge/scanner/validator readiness exists (PWC-22/27) and founder enables the switch.
- **Next executable (critical path):** PWC-02 — strict public and internal contracts.
- **Parallel:** PWC-03 — independently generated corpus fixtures.

### PWC-02 — Define strict public and internal contracts

- **Baseline commit:** `19fcf07` (PWC-01 SHA fill-in).
- **Change commit:** `f4cd8907919159f1ec564712592cd74528543cba`.
- **Files changed:** `web/src/lib/products/contracts.ts`, `web/src/lib/products/api-contracts.ts`, `web/src/lib/products/api-contracts.test.ts`, `web/src/lib/server/proof-worker-contract.ts`, `web/src/lib/server/proof-worker-contract.test.ts`, `web/package.json`, `docs/AGMT_PROOF_IMPLEMENTATION_STATUS.md`.
- **Status:** Implemented; Tested (3/3 api-contracts + 3/3 worker-envelope + 7/7 PWC-01 + 2/2 product tests = 15/15). Browser/Word not applicable. Not Deployed. Current HTTP handlers still return the older `{error: string}` shape until PWC-19/28 wire these schemas.
- **Must-not-change held:** `RunStatus` DB enum list unchanged; `validating` is an API stage only.

#### Behaviour

- `RunSummaryV2` (`apiVersion: 2`): nullable pre-result counts, distinct `noticeCount`, coverage reason enum, retry/download/deletion metadata. Premature zeros and extra fields rejected.
- Error envelope `{error:{code,messageKey,retryable,supportId},serverNow}` with unknown-field rejection.
- Metadata-only queue envelope version 1, ≤2 KiB, no filenames/URLs/findings/bytes/`tenantId`.
- 36 section-9 UI fixtures with frozen copy; content canary never appears in serialized API or queue JSON.
- Content contracts remain in `agmt/proof/contracts.ts` and are not imported by the public/queue modules.

#### Commands and results

```
cd web
node --experimental-strip-types --test src/lib/products/api-contracts.test.ts src/lib/server/proof-worker-contract.test.ts src/lib/products/capabilities.test.ts src/lib/products/products.test.ts
```

Actual: **15/15 pass**, 0 fail. Node v24.11.1.

Fixture hashes: none (JSON fixtures only). Versions: API v2, envelope v1, `proof-launch-v1`.

#### Remaining blockers and next eligible tasks

- Wiring these DTOs onto live routes is PWC-19/28/29, not this task.
- **Next executable (critical path):** PWC-16 (depends on PWC-02). Source lane **PWC-03** is independently eligible.
- **Parallel:** PWC-03, PWC-29 (UI presentation of these DTOs).

### PWC-02 follow-up — typecheck import

- This session re-ran PWC-00–02 tests independently: **17/17 pass** (capabilities 7, products 2, api-contracts 3, worker 3, product-runs 2).
- `npx tsc --noEmit` reported an attributable PWC-02 error: `RunDeadlines` imported from `retention.ts` was type-only there. Fixed by importing `RunDeadlines` from `products/contracts.ts`. Remaining tsc errors are pre-existing (`routeTree.gen` absent without build; `createFileRoute` path types).
- `canTransitionProductRun("scanning","processing")` remains **false**. Upload switch remains fail-closed.

### PWC-03 — Build independently generated corpus fixtures

- **Baseline commit:** `cc8f797b918d50d92ff6546ee5e5426125b84441` (PWC-02 SHA fill-in; branch head at session start). Type-fix `ac4c420e072c8742527da54aed90e245776c9e53`.
- **Change commit:** `5379aa1b740524ea9122c50a1835d45a3c30736f`.
- **Files changed:** `web/src/lib/agmt/corpus/pwc/generate.ts`, `web/src/lib/agmt/corpus/pwc/expected.ts`, `web/src/lib/agmt/corpus/pwc/manifest.json`, `web/src/lib/agmt/corpus/pwc/corpus.test.ts`, `web/package.json`, `docs/AGMT_PROOF_IMPLEMENTATION_STATUS.md`.
- **Status:** Implemented; Tested (7/7 corpus tests). Word-created independent files **Blocked** (deferred to PWC-13; this task does not fabricate Word receipts). Browser not applicable. Not Deployed.
- **Must-not-change held:** expected actions authored from specs, not copied from engine output. `ENGINE_BASELINE_MISSES` is empty after evaluation; misses are labelled, not auto-updated.

#### Behaviour

- 24 representative synthetic packages plus 24 clean twins (48 total). Families: SHA, SSA, SPA, NDA, services, licence, employment, loan, lease, amendment, schedule, board paper, policy, report, letter.
- Capability tags cover split runs, tables, headers, prior revisions, existing comments, nested numbering, schedule restarts, UK/US English, Indian grouping, multilingual excerpt, Latin phrases, similar parties, reused phrases, party-name trap.
- Hand-authored OOXML via deterministic JSZip (`createFolders: false`, frozen DOS date). Synthetic author/reviewer only.
- Frozen SHA-256 values live in `manifest.json` (`generatorSeed=pwc-03-synthetic-corpus-v1`). Example: `sha_typo_body` = `151f328109233dc17e9892c8fc4157dd8351f9cab93f7c2991873371116845fc`.

#### Commands and results

```
cd web
node --experimental-strip-types --test src/lib/agmt/corpus/pwc/corpus.test.ts
```

Actual: **7/7 pass**, 0 fail. Node v24.11.1. Engine evaluation: 0 labelled misses; clean twins silent on the target rule.

#### Remaining blockers and next eligible tasks

- Word-created synthetic files and human Word protocol: PWC-13 / PWC-35.
- Extend to 120 packages before PWC-35.
- **Next executable (source lane):** PWC-04 — unify pre-expansion ZIP and resource limits.
- **Critical path (already unblocked by PWC-02):** PWC-16.

### PWC-16 — Extend metadata schema and owner-safe lifecycle

- **Baseline commit:** `5379aa1b740524ea9122c50a1835d45a3c30736f`.
- **Change commit:** `35a88c8f0d053c9f9017602099c0ec4a7a11c921`.
- **Files changed:** `web/migrations/0009_pwc_run_lifecycle.sql`, `web/src/lib/server/product-runs.ts`, `web/src/lib/server/product-runs.test.ts`, `web/scripts/pwc-migration.test.mjs`, `web/scripts/product-run-migration.test.mjs` (exclude 0009 from the T06 apply-before-0006 list), `docs/AGMT_PROOF_IMPLEMENTATION_STATUS.md`.
- **Status:** Implemented; Tested (4/4 product-runs unit + 2/2 PGlite migration). Staging role matrix Verified **Blocked** (no authorized staging apply). Production apply **not performed**. Not Deployed.
- **Must-not-change held:** 0001–0008 untouched; no Matter rows; `scanning` → `processing` still illegal in app table and SQL trigger; original deadline columns remain immutable; uploads remain disabled.

#### Behaviour

- Next unused migration number confirmed **0009**.
- Additive run columns: profile, language, versions, coverage_manifest, notice_count, lease, retry_after, deleted_reason, deletion_receipt, options_digest, scan_receipt, authorised_at (existing rows backfilled from `upload_started_at`).
- Artifact: attempt_id, generation, expected_size, provider_etag, write_status, absence_verified_at. Unique `(tenant_id, run_id, generation, attempt_id, kind)`. One published settled `marked_docx` per run. Composite FK `(tenant_id, run_id, owner_user_id)`.
- `createProductRun` authorises with database `now()` (not application timestamps).
- Transitions: queued→failed; failed→scanning/queued; deleting→deleting. Retry does not widen deadlines. Attempt counter increments only on exclusive claim.
- `job_outbox` accepts `aggregate_type = 'product_run'`.

#### Commands and results

```
cd web
node --experimental-strip-types --test src/lib/server/product-runs.test.ts
node --test scripts/pwc-migration.test.mjs
node --test scripts/product-run-migration.test.mjs
```

Actual: **4/4**, **2/2**, **2/2** pass. Node v24.11.1. PGlite: scanning→processing rejected; same-tenant other-owner artifact rejected; retry left 2026-01-01 deadlines unchanged; deleting→deleting restart incremented generation; stale generation updated 0 rows.

#### Remaining blockers and next eligible tasks

- Do not apply 0009 to production without explicit authorization.
- Real staging role matrix: Blocked.
- **Next executable (critical path):** PWC-17 — temporary R2 boundaries and adapter (code can be prepared; provisioning is D-02/D-03 / spend).
- **Source lane after this task:** PWC-04 (completed in this session).

### PWC-04 — Unify pre-expansion ZIP and resource limits

- **Baseline commit:** `6059b692567689aff5dd726e6e4b5e6f7488170d`.
- **Change commit:** `4e8605147fd70da1fac3d960f7c7120ba4e462af`.
- **Files changed:** `web/src/lib/agmt/zip-safety.ts`, `web/src/lib/agmt/zip-safety.test.ts`, `web/src/lib/server/proof-scan.ts`, `web/src/lib/server/proof-scan.test.ts`, `web/package.json`, `docs/AGMT_PROOF_IMPLEMENTATION_STATUS.md`.
- **Status:** Implemented; Tested (4/4 zip-safety + 3/3 proof-scan + 9/9 docx-v2 + 4/4 launch + 7/7 corpus = 27/27 in the combined run). Browser/Word not applicable. Not Deployed.
- **Must-not-change held:** uploads remain disabled; no antivirus claim; `scanning` → `processing` untouched.

#### Behaviour

- Single versioned limits object `proof-zip-limits-v1`: 25 MiB source, 35 MiB output, 2,000 entries, 100 MiB expanded, 32 MiB/entry, 100:1, depth 128.
- `inspectZipCentralDirectory` rejects ZIP64, encrypted entries, exact duplicates, case-colliding paths and over-depth paths.
- `verifyZipInflation` inflates with `maxOutputLength`, compares declared size and CRC-32, aborts on discrepancy. No JSZip `_data`.
- `scanProofDocx` runs central-directory inspection and bounded inflation before any JSZip load (it no longer uses JSZip or `extractDocx`). Cheap DOCTYPE/ENTITY/external-TargetMode substring checks only.

#### Commands and results

```
cd web
node --experimental-strip-types --test src/lib/agmt/zip-safety.test.ts src/lib/server/proof-scan.test.ts src/lib/agmt/docx-v2.test.ts src/lib/agmt/proof/launch.test.ts src/lib/agmt/corpus/pwc/corpus.test.ts
```

Actual: **27/27 pass**, 0 fail. Node v24.11.1.

#### Remaining blockers and next eligible tasks

- Live upload of a zip-bomb through the authenticated API: Blocked (uploads disabled; no authorized session).
- **Next executable (source lane):** PWC-05 — DOCX capability inventory and refuse/coverage map.
- **Critical path:** PWC-17 (provisioning blocked; adapter code eligible).

---

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
