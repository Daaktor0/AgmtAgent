# Agmt Proof implementation status

## Proof World Class (PWC) ledger

This section is the controlling implementation ledger for the Proof World Class initiative defined in [AGMT_PROOF_WORLD_CLASS_PLAN.md](AGMT_PROOF_WORLD_CLASS_PLAN.md). Historical T00–T16 and hardening receipts below remain evidence. They are not PWC completion. Do not restart those sequences blindly.

Evidence vocabulary follows the plan: **Existing**, **Implemented**, **Tested**, **Verified**, **Deployed**, **Proposed**, **Blocked**, **Superseded**.

### Workspace and branch

| Item | Value |
|---|---|
| Date (UTC) | 2026-09-09 |
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

### Typecheck evidence — route generation vs `origin/main`

- **Baseline:** `98d6a30724ca0bad47ad5a076c57e2fd82e25d28` (`origin/proof-world-class-implementation` at this session start).
- Isolated main worktree: `D:\AI Agent\agreement-agent-main-pwc-baseline` at `6a7e80d7cdc584f4b1c67f1fce822da0e230dc53`.
- Root lockfile git blob is identical on both trees (`56a704edc1296d29cf3140caf1f79a634480d214`). Disk hash differs only by line endings.

The earlier main-worktree Nitro failure (`Cannot find package '@cloudflare/containers'` from `web/exports.cloudflare.ts` → `src/worker.ts`) was **incomplete root dependency installation**, not a genuine `origin/main` build defect and not a reason to change deployment configuration. `web/exports.cloudflare.ts` still re-exports the legacy `AgmtContainer` class so Cloudflare does not treat it as a delete-class migration. That wiring is unchanged.

Root lockfile install in the isolated worktree (lockfile not modified):

```
cd D:\AI Agent\agreement-agent-main-pwc-baseline
npm ci --ignore-scripts --no-audit --no-fund
```

Result: **exit 0**, 41 packages added, `node_modules/@cloudflare/containers` present, root `package-lock.json` hash unchanged (`A384D410…` before and after).

Normal root build (both trees, after that install):

```
npm run build
```

| Tree | `npm run build` | Lockfile |
|---|---|---|
| Isolated `origin/main` | **exit 127** `[with-app-env] failed to run vite: spawn vite ENOENT` after `npm --prefix web ci` (447 packages). Route tree leftover present; Nitro wrangler missing until the Vite-js equivalent. | Unchanged |
| Implementation `98d6a30` | **exit 127**, same `spawn vite ENOENT` after `npm --prefix web ci` (447 packages). | Unchanged |

This Windows ENOENT is `web/scripts/with-app-env.mjs` spawning `vite` without a shell. It is **identical on both trees** and is not a missing-package defect. The wrapper and wrangler/Nitro deploy config were **not** changed to compensate.

Equivalent Cloudflare build used for post-generation typecheck (same on both trees):

```
cd web
node scripts/with-app-env.mjs node ./node_modules/vite/bin/vite.js build --mode cloudflare
npx tsc --noEmit
```

| Tree | Vite/Nitro (`cloudflare_module`) | `npx tsc --noEmit` |
|---|---|---|
| Isolated `origin/main` after root `npm ci` | Client/SSR/Nitro **exit 0**. Nitro detected `exports.cloudflare.ts`. Generated `.output/server/wrangler.json`. | **exit 0**, 0 errors |
| Implementation `98d6a30` | Client/SSR/Nitro **exit 0** (1902/372/2897 modules vs main 1901/368/2893; extra PWC modules). Same wrangler output. | **exit 0**, 0 errors |

No attributable typecheck or Nitro regression versus `origin/main` once the lockfile install is complete. Deployment configuration was not edited.

### PWC-03 follow-up — section 22 reconciliation

- **Status:** Implemented; Tested (7/7 corpus + typecheck exit 0 after `904d21b`). Word-created fixtures **Blocked** (PWC-13). Release corpus size **outstanding**. Not Deployed.
- “0 labelled misses” applied only to the **24 evaluated positive loci** against the six launch rules at PWC-03 close. After PWC-08, one of those loci is labelled (`employment_typo_split`). It is not a per-rule 100% claim and not a catalogue-wide claim.

#### Current 48 packages satisfy

- Starting representative set: 24 positive + 24 clean twins; family-separated; frozen `manifest.json` (`generatorSeed=pwc-03-synthetic-corpus-v1`).
- Provenance, capability tags, language/profile, SHA-256, supported flag, expected finding IDs.
- Synthetic-only names/authors/comments; identity canary.
- Agreement families: SHA, SSA, SPA, NDA, services, licence, employment, loan, lease, amendment, schedule.
- General families: board paper, policy, report, letter.
- UK/US English, Indian grouping, multilingual excerpt, placeholders, similar parties, nested numbering, reused phrases, tables, tracked revisions, classic comments, repeated text, Latin names, schedule restarts, source-only header story.
- Expected actions authored from specs, not engine output. Clean twins are the negative traps for those loci.

#### Outstanding (not claimed complete)

- Word-created synthetic files and Word protocol: PWC-13 / PWC-35.
- ≥120 packages including ≥60 clean traps before PWC-35 (currently 48 / 24).
- ≥1,000 correction microcases.
- ≥100 positive and ≥100 negative cases **per enabled comment rule**.
- 60/20/20 development/calibration/holdout split by template family.
- Modern-comment fixtures; donated/anonymised non-synthetic fixtures (forbidden without a separate process).
- Adversarial ZIP/XML cases live in PWC-04 tests, not in `corpus/pwc/manifest.json`.

#### Rule-level engine evaluation denominators

Evaluated launch rules (24 positives / 24 clean twins). `ENGINE_BASELINE_MISSES` is no longer empty after PWC-08:

| Rule | Positive packages | Clean twins | Labelled misses | Notes |
|---|---:|---:|---:|---|
| `language.typo_allowlist` | 10 | 10 | 1 | `employment_typo_split` labelled `pwc-08-mixed-format-comment-only`: authored expected action is a correction; Phase A mixed-rPr policy admits a comment. The quote still exists. Includes party-name trap, prior revision, reused phrase, Latin, Indian numbers, header story |
| `language.duplicate_word` | 4 | 4 | 0 | Includes table and multilingual excerpt |
| `completion.placeholder` | 4 | 4 | 0 | `[●]`, `[insert date]`, `[TBD]`, existing classic comment |
| `references.missing_target` | 2 | 2 | 0 | |
| `references.duplicate_number` | 2 | 2 | 0 | Includes schedule restart |
| `definitions.duplicate` | 2 | 2 | 0 | |

Unevaluated (denominator 0 → **not evaluated**, never 100%): `language.spelling_candidate`, `language.missing_word_pattern`, `language.sentence_mechanics`, `punctuation.*`, `spacing.*`, `definitions.case_variant` / `undefined_use` / `unused`, `numbering.sequence_anomaly`, `references.ambiguous_target` / `range` / `bookmark`, `figures.*`, `dates.*`, `parties.*`, `stories.*`, `review.existing_material`, `formatting.run_anomaly`. Comment-rule 100/100 gate is outstanding for every enabled comment rule.

### PWC-05 — Create namespace-aware package capability inventory

- **Baseline commit:** `1cc8748345aedf912f7e825f8d2270693b6e5528`.
- **Change commit:** `e9458a89d7248b66ea763aa32a9c610ff939b326` (shared with PWC-06).
- **Files changed:** `web/src/lib/agmt/package-capabilities.ts`, `web/src/lib/agmt/package-capabilities.test.ts`, `web/src/lib/agmt/docx-v2.ts`, `web/src/lib/agmt/types.ts`, `web/package.json`.
- **Status:** Implemented; Tested (8/8 package-capabilities + 9/9 docx-v2). Word support expansion gated at 13/44; no Word fidelity claim. Not Deployed.
- **Must-not-change held:** unknown/macro parts are refused, not stripped; uploads remain disabled; `scanning` → `processing` still false.

#### Behaviour

- Versioned inventory `proof-package-capabilities-v1` / profile `proof-docx-phase-a-v1`.
- Each part records preserve / read / edit separately. Unknown parts are `unknown` + opaque preserve; the package becomes `limited`, never silently complete.
- Namespace URIs, not prefixes: WML alias is supported; `w` bound to a non-WML URI is `namespace_spoof` refuse.
- Passive `http`/`https`/`mailto` hyperlinks are limited (never fetched). `attachedTemplate`, customXml, modern comments, protection, active content refuse.
- AlternateContent is limited. Empty main body and main-document content-type mismatch refuse.
- `extractDocx` throws on refused inventory; original bytes stay byte-identical.

#### Commands and results

```
cd web
node --experimental-strip-types --test src/lib/agmt/package-capabilities.test.ts src/lib/agmt/docx-v2.test.ts
```

Actual: **8/8 + 9/9 pass**. Combined later run with projection/corpus/launch/export: **47/47**.

### PWC-06 — Implement exact visible-text and story projections

- **Baseline commit:** `904d21bd8deb1daef019b3c42b9ee18e039b1609`.
- **Change commit:** `e9458a89d7248b66ea763aa32a9c610ff939b326`.
- **Files changed:** `web/src/lib/agmt/projection.ts`, `web/src/lib/agmt/projection.test.ts`, `web/src/lib/agmt/source-map.ts`, `web/src/lib/agmt/docx-v2.ts`, `web/src/lib/agmt/types.ts`.
- **Status:** Implemented; Tested (7/7 projection + 4/4 source-map + launch/export regressions). Word-read semantics remain PWC-13. Not Deployed.
- **Must-not-change held:** Latin script is not treated as English; source XML is not normalised.

#### Behaviour

- `proof-projection-v1` final-view projection per part. Deletion, field instructions and vanished runs are skipped and recorded.
- Field stack is carried across paragraphs; leftover begin/end marks the story incomplete.
- Inherited `w:lang` is recorded from pPr/rPr only. Body, table cells, headers, footers and notes stay separate stories; header text is not merged into the main ProofSource.
- Empty cells produce empty table paragraphs; move revisions are disclosed (`complex_revision`) and omitted from visible text.

#### Commands and results

```
cd web
node --experimental-strip-types --test src/lib/agmt/projection.test.ts src/lib/agmt/source-map.test.ts src/lib/agmt/proof/launch.test.ts src/lib/agmt/export/docx.test.ts
```

Actual: **7/7 + 4/4 + 4/4 + 4/4 pass**.

### PWC-17 — Provision temporary R2 boundaries and adapter

- **Baseline commit:** `e9458a89d7248b66ea763aa32a9c610ff939b326`.
- **Change commit:** `03875c18391c7fe9b8062e4d0fd1b40304af0c68`.
- **Files changed:** `web/src/lib/server/proof-objects.ts`, `web/src/lib/server/proof-objects.test.ts`, `infra/proof/storage.md`, `infra/proof/wrangler-broker.jsonc`.
- **Status:** Implemented (adapter + placeholder config); Tested (4/4 local contract tests). Provider verification **Blocked** (no authorized staging buckets). D-02 encryption and D-03 residency **unresolved**. Not Deployed. No production/staging apply.
- **Must-not-change held:** historical envelope/`object_manifest` path untouched; memory provider rejected in deployed mode; uploads remain disabled.

#### Behaviour

- Keys: `proof/v2/<UTC-expiry-minute>/<128-bit-run-token>/<generation>/<attempt>/<kind>-<random-id>`. No filename/tenant text.
- Source → quarantine role; marked/analysis → temporary role.
- Reserve before write; immutable retry; HEAD checksum/size receipt; prefix list pagination; delete; multipart abort.
- Encryption contract recorded as TLS + R2-managed; no `encryptBytes`.

#### Commands and results

```
cd web
node --experimental-strip-types --test src/lib/server/proof-objects.test.ts
```

Actual: **4/4 pass**. Live put/read/delete/HEAD/list/multipart abort under restricted identities: **not run**.

#### Remaining blockers and next eligible tasks

- Founder D-02 / D-03 and authorized bucket provisioning before marking PWC-17 Verified.
- **Next executable (source lane):** PWC-10 — surgical tracked-change and comment export (depends on PWC-09).
- **Critical path (code-eligible, staging blocked):** PWC-18 — transfer reservations and cancellation fencing.
- Do not enable `PROOF_UPLOADS_ENABLED`. Do not apply 0009 to production.

### PWC-07 — Validate exact evidence and absence scopes

- **Baseline commit:** `98d6a30724ca0bad47ad5a076c57e2fd82e25d28`.
- **Change commit:** `01d510be3372895bd1a79331a5184224bc27229c` (shared with PWC-08).
- **Files changed:** `web/src/lib/agmt/proof/evidence.ts`, `web/src/lib/agmt/proof/evidence.test.ts`, `web/src/lib/agmt/proof/contracts.ts`, `web/src/lib/agmt/source-map.ts`, `web/src/lib/agmt/proof/launch.ts`, `web/src/lib/agmt/proof/launch-checks.ts`, `web/package.json`.
- **Status:** Implemented; Tested (5/5 evidence + launch/export/source-map regressions). Browser/Word not applicable until export gate. Not Deployed.
- **Must-not-change held:** legacy `validateHit` substring/fallback validator not reused; metadata DTO still rejects `exactQuote`/findings; uploads remain disabled; `scanning` → `processing` still false.

#### Behaviour

- Section 14 `SpanV2` / `FindingV2` schemas: unknown fields rejected, grapheme-safe half-open offsets, quote bound to UTF-16 length, absence requires `matchCount === 0`.
- Replay order: package hash → registered part → path → projection segments → tree text → quote → exporter capability → absence completeness.
- `mapping_corruption` (hash/version/receipt/unregistered part/tree desync) fails the run. Wrong anchors are `invalid_evidence`. Unknown/imported parts suppress absence (`incomplete_scope`); they are not treated as zero matches.
- Empty numbering labels are not fabricated. Same quote in a header story cannot satisfy a body span.
- Launch findings convert to V2 before plan admission. Public `RunSummaryV2` still rejects evidence fields.

#### Commands and results

```
cd web
node --experimental-strip-types --test src/lib/agmt/proof/evidence.test.ts src/lib/agmt/proof/launch.test.ts src/lib/agmt/source-map.test.ts src/lib/agmt/export/docx.test.ts
npx tsc --noEmit
```

Actual: **5/5 evidence + 4/4 launch + 4/4 source-map + 4/4 export**. `tsc` **exit 0**. Node v24.11.1.

#### Remaining blockers

- Word/SDK reconstruction of published anchors: PWC-13.
- Header/note stories remain unread for absence (excluded regions, not implied complete).

### PWC-08 — Preflight edit capability around existing review material

- **Baseline commit:** `98d6a30724ca0bad47ad5a076c57e2fd82e25d28`.
- **Change commit:** `01d510be3372895bd1a79331a5184224bc27229c` (shared with PWC-07).
- **Files changed:** `web/src/lib/agmt/export/edit-capabilities.ts`, `web/src/lib/agmt/export/edit-capabilities.test.ts`, `web/src/lib/agmt/proof/launch.ts`, `web/src/lib/agmt/proof/launch.test.ts`, `web/src/lib/agmt/export/docx.test.ts`, `web/src/lib/agmt/corpus/pwc/expected.ts`, `web/package.json`.
- **Status:** Implemented; Tested (5/5 edit-capabilities + launch/export/corpus). Word verification remains PWC-13. Not Deployed.
- **Must-not-change held:** modern comments still refused; prior user revisions are not accepted/rejected; uploads remain disabled.

#### Behaviour

- Each exact span is classified correction-safe, comment-safe or unsupported before plan admission.
- Prior `w:ins`/`w:del`, including existing `Agmt Proof` author IDs, cannot receive nested corrections.
- Mixed-rPr replacements are comments unless every overlapping run shares the same `rPr`. No approximate character distribution.
- Empty visible ranges, fields, protected/hyperlink runs and classic comment-reference intersections are unsupported; the finding is suppressed, not moved to a nearby paragraph.
- Split-run launch fixture: typo is a comment; duplicate-word deletion remains a correction when format is uniform enough to export.

#### Corpus labelling (not an expected-action rewrite)

`ENGINE_BASELINE_MISSES["pwc-08-mixed-format-comment-only"]` = `employment_typo_split::language.typo_allowlist::recieve`. Independently authored expected action remains a correction. The engine now publishes a comment at that locus. Clean twins still do not fire.

#### Commands and results

```
cd web
npm run test:proof
npx tsc --noEmit
```

Actual: **94/94 pass**, `tsc` **exit 0**. `canTransitionProductRun("scanning","processing")` **false**.

#### Remaining blockers and next eligible tasks

- Word checks of enabled correction/comment cases: PWC-13.
- **Next executable (source lane):** PWC-10 — surgical tracked-change and comment export.
- **Critical path (code-eligible, staging blocked):** PWC-18.

### PWC-09 — Resolve duplicate and overlapping findings deterministically

- **Baseline commit:** `558c14816b41a35d0d22324e5ea11b4683d5d72b`.
- **Change commit:** `5fc4838a9e1069c25d0a679d90b38381aef48825`.
- **Files changed:** `web/src/lib/agmt/proof/resolve-findings.ts`, `web/src/lib/agmt/proof/resolve-findings.test.ts`, `web/src/lib/agmt/proof/launch.ts`, `web/src/lib/agmt/proof/launch.test.ts`, `web/src/lib/agmt/export/docx.ts`, `web/src/lib/agmt/export/docx.test.ts`, `web/package.json`.
- **Status:** Implemented; Tested (4/4 resolve-findings + launch/export/corpus). Word merge rendering remains PWC-13. Not Deployed.
- **Must-not-change held:** different stories/locations with the same quote are not merged; no silent first-N trim; uploads remain disabled.

#### Behaviour

- Duplicate key: part, path, span, rule/version, quote, action, replacement. Exact duplicates collapse.
- Same-span comments combine reasons into one comment. Overlapping comments union inside one paragraph when ≤300 UTF-16 units and the union is editable.
- Conflicting corrections become one judgment comment; they are not auto-selected.
- Correction/comment overlap downgrades to the combined comment.
- Caps: 100/rule, 500/run, stable order exact-structural → exact-mechanical → bounded-heuristic then part/span/rule. Omitted counts recorded as `rule_budget` / `finding_cap` with limited coverage.

#### Commands and results

```
cd web
npm run test:proof
npx tsc --noEmit
```

Actual: **98/98 pass**, `tsc` **exit 0**.

#### Remaining blockers and next eligible tasks

- Word checks of merged comments: PWC-13.
- **Next executable (source lane):** PWC-10.
- **Critical path (code-eligible, staging blocked):** PWC-18.

### Typecheck evidence — lockfile-complete re-run at `b31a8ee`

- **Baseline:** `b31a8ee3a620c7fce70bb39e140d9462f127fa5f` (`origin/proof-world-class-implementation` at this session start).
- Isolated main worktree: `D:\AI Agent\agreement-agent-main-pwc-baseline` at `6a7e80d7cdc584f4b1c67f1fce822da0e230dc53`.
- Root lockfile was not modified. Isolated-main disk SHA-256 `A384D410B90B6A91CC3F33EF03CCA7DE6183FCF159FF4AF40AB5F23F5EA87B58` before and after `npm ci`. Implementation disk SHA-256 `7F8DB5BEF2E3E82CEDD87F9C92A20B403638EEE04C9BC7AD26DB318DB28AC229` before and after `npm run build` (line-ending difference vs the worktree copy, same git blob as previously recorded).

Root lockfile install in the isolated worktree (lockfile not modified):

```
cd D:\AI Agent\agreement-agent-main-pwc-baseline
npm ci --ignore-scripts --no-audit --no-fund
```

Result: **exit 0**, 41 packages added.

Normal root build (both trees, after that install):

```
npm run build
```

| Tree | `npm run build` | Lockfile |
|---|---|---|
| Isolated `origin/main` `6a7e80d` | **exit 127** `[with-app-env] failed to run vite: spawn vite ENOENT` after `npm --prefix web ci` (447 packages). | Unchanged |
| Implementation `b31a8ee` / this session head | **exit 127**, same `spawn vite ENOENT` after `npm --prefix web ci` (447 packages). | Unchanged |

This Windows ENOENT is `web/scripts/with-app-env.mjs` spawning `vite` without a shell. It is **identical on both trees**. It is recorded separately from the successful direct Vite/Nitro build. The wrapper and wrangler/Nitro deploy config were **not** changed. Track a bounded follow-up to invoke `node ./node_modules/vite/bin/vite.js` (or equivalent PATH resolution) from the wrapper on Windows; do not treat this as a deployment-architecture defect.

Equivalent Cloudflare build used for post-generation typecheck (same on both trees):

```
cd web
node scripts/with-app-env.mjs node ./node_modules/vite/bin/vite.js build --mode cloudflare
npx tsc --noEmit
```

| Tree | Vite/Nitro (`cloudflare_module`) | `npx tsc --noEmit` |
|---|---|---|
| Isolated `origin/main` after root `npm ci` | Client/SSR/Nitro **exit 0** (1901/368/2893 modules). Nitro detected `exports.cloudflare.ts`. Generated `.output/server/wrangler.json`. | **exit 0**, 0 errors |
| Implementation after PWC-10/11/18 | Client/SSR/Nitro **exit 0** (1902/378/2903 modules; extra PWC modules). Same wrangler output. | **exit 0**, 0 errors |

No attributable Nitro or typecheck regression versus `origin/main` once the lockfile install is complete. Deployment configuration was not edited to compensate for the Windows `vite` ENOENT.

### PWC-10 — Extend surgical tracked-change and comment export

- **Baseline commit:** `b31a8ee3a620c7fce70bb39e140d9462f127fa5f`.
- **Change commit:** `39afa292c1001f1103d870be484b572004f38bc7` (shared with PWC-11 and PWC-18).
- **Files changed:** `web/src/lib/agmt/export/docx.ts`, `web/src/lib/agmt/export/ooxml.ts`, `web/src/lib/agmt/export/docx.test.ts`, `web/src/lib/agmt/export/receipt.ts`, `web/src/lib/agmt/export/edit-capabilities.ts`, `web/src/lib/agmt/export/edit-capabilities.test.ts`, `web/src/lib/agmt/corpus/pwc/corpus.test.ts`.
- **Status:** Implemented; Tested (export/edit-capabilities/corpus). Word verification **Blocked** (PWC-13). Not Deployed.
- **Must-not-change held:** no HTML/docx regeneration; modern review structures still refused; uploads remain disabled; `scanning` → `processing` still false.

#### Behaviour

- Safe same-format corrections emit genuine `w:del`/`w:delText` plus one `w:ins` run that copies the original `w:rPr` and `xml:space="preserve"`. Approximate character-count distribution across mixed formatting runs is gone; mixed-format replacements remain comments (PWC-08).
- Existing revisions and classic comments keep their IDs; new IDs are allocated globally and do not reuse 0/7/8 in the prior-review fixture.
- Comment fallback is admitted only when the span’s paragraph children are plain text runs that can carry exact `commentRangeStart`/`End`/reference. Spans inside existing `w:ins`/`w:del` are **unsupported**, suppressed with coverage (`prior_revision` / `prior_agmt_revision`), never nested and never moved.
- Zero-finding complete outputs remain byte-identical and now pass the publication gates. Limited coverage still adds one `document_notice`. Missing `document.xml.rels` refuses with `no_document_rels`.
- Receipt `proof-export-receipt-v1` binds source SHA-256, planned finding IDs, revision IDs, comment IDs, notice IDs and modified parts.

#### `employment_typo_split` (kept open)

| Layer | Result |
|---|---|
| Detection | Rule `language.typo_allowlist` still finds quote `recieve` |
| Anchoring | Span offsets match the authored expected locus |
| Output action | Engine publishes a **comment**, not `track_replace` |
| Authored expectation | Still `track_replace` → `receive` |
| Representable under export contract? | **No.** Mixed rPr has no tested same-format mapping; forcing a tracked change would be approximate distribution. Label `pwc-08-mixed-format-comment-only` retained. Expected action not rewritten. |

#### Commands and results

```
cd web
npm run test:proof
npx tsc --noEmit
```

Actual: **104/104 pass**, `tsc` **exit 0**. Node v24.11.1.

### PWC-11 — Add independent structural/reconstruction validator

- **Baseline commit:** `b31a8ee3a620c7fce70bb39e140d9462f127fa5f`.
- **Change commit:** `39afa292c1001f1103d870be484b572004f38bc7` (shared).
- **Files changed:** `web/src/lib/agmt/validation/structure.ts`, `web/src/lib/agmt/validation/reconstruct.ts`, `web/src/lib/agmt/validation/validation.test.ts`, `web/src/lib/agmt/export/docx.ts`.
- **Status:** Implemented; Tested (1/1 validation + export corpus). Word not substituted. SDK harness is PWC-12. Not Deployed.
- **Must-not-change held:** validator does not import `rewriteParagraph` / `replaceParagraphXml` / `resolveAdded` / `semantic`. Uploads remain disabled.

#### Behaviour

- Package gate: ZIP central directory + bounded inflation, original entries present, allowed changed parts derived from source+plan (not trusted from `receipt.modifiedParts`).
- Reconstruction: accept/reject visible text from original paragraphs + plan; reject also restores run-level rPr. Existing revision records and original comments must match. New markup counted by receipt IDs, not author name.
- Mutations rejected independently: altered rPr, shifted comment, extra Agmt revision, original comment text, unrelated entry, extra relationship.
- `employment_typo_split` export is validated as a comment document, not rewritten to a correction.

#### Commands and results

```
cd web
node --experimental-strip-types --test src/lib/agmt/validation/validation.test.ts src/lib/agmt/export/docx.test.ts
```

Actual: **1/1 + 8/8 pass** (included in 104/104 `test:proof`).

### PWC-18 — Implement transfer reservations and cancellation fencing

- **Baseline commit:** `b31a8ee3a620c7fce70bb39e140d9462f127fa5f`.
- **Change commit:** `39afa292c1001f1103d870be484b572004f38bc7` (shared).
- **Files changed:** `web/src/lib/server/proof-transfer.ts`, `web/src/lib/server/proof-transfer.test.ts`, `web/src/lib/server/proof-reconciliation.ts`, `web/src/lib/server/proof-reconciliation.test.ts`, `web/package.json`.
- **Status:** Implemented (local ledger + adapter); Tested (3/3 transfer + 1/1 reconciliation). Live provider races **Blocked**. Word not applicable. Not Deployed. No production/staging apply.
- **Must-not-change held:** abort success is never inferred from a timeout; memory store still rejected in deployed mode; uploads remain disabled; migration 0009 not applied to production.

#### Behaviour

- Reserve object key and writer row (`reserved` → `writing`) before provider `put`. Generation and deadlines are checked before and after the network write. No ledger transaction is held during the provider call.
- Cancel commits `deleting` + incremented generation first, then aborts multipart and marks in-flight writers `uncertain`.
- Provider timeout or post-write fence break is `uncertain`. Reconcile HEADs the reserved key, deletes only on exact checksum/size, then clears the writer. Mismatched checksums stay unresolved. `noWriterReceipt` is issued only when no writing/uncertain writers remain and reserved keys are absent.

#### Commands and results

```
cd web
node --experimental-strip-types --test src/lib/server/proof-transfer.test.ts src/lib/server/proof-reconciliation.test.ts
```

Actual: **4/4 pass**. Live R2 put/cancel/orphan drill: **not run**.

#### Remaining blockers and next eligible tasks

- Word/SDK: PWC-12 (Open XML SDK harness; .NET pin after licence review), PWC-13 (Microsoft Word).
- Live transfer races and staging buckets: PWC-17 provider verification, then PWC-18 Verified / PWC-19.
- **Next executable (source lane):** PWC-14 — rule registry, budgets and promotion controls (depends on PWC-07/09).
- **Critical path (code-eligible, staging blocked):** PWC-19 depends on live PWC-18.
- Do not enable `PROOF_UPLOADS_ENABLED`. Do not apply 0009 to production.

### PWC-14 — Create rule registry, budgets and promotion controls

- **Baseline commit:** `cf5c3858212fa87032dbc04e45bd16068a339f19`.
- **Change commit:** `b3755bc5431d478fdeb25fbb61add75907f811bb`.
- **Files changed:** `web/src/lib/agmt/proof/registry.ts`, `web/src/lib/agmt/proof/rule-runtime.ts`, `web/src/lib/agmt/proof/rule-runtime.test.ts`, `web/src/lib/agmt/corpus/pwc/metrics.ts`, `web/package.json`.
- **Status:** Implemented; Tested (4/4 rule-runtime). Browser coverage is PWC-32. Word not required. Not Deployed.
- **Must-not-change held:** historical `CHECKS` remain regression-only and are not default-enabled; heuristic certainty is not a numeric probability; uploads remain disabled; `scanning` → `processing` still false.

#### Behaviour

- Versioned launch specs `proof-rule-registry-v1`: id, version, profile, phase A, defaultEnabled, capabilities, languages, actionPolicy, scope, exclusion policy, span_v2 validator, 2,000-candidate / 2 s budgets, evaluation receipt hash.
- Default-enabled rules require a 64-hex evaluation receipt. The six launch rules keep that receipt; older experimental CHECKS IDs do not overlap and stay off.
- Runtime outcomes: completed_with_findings / completed_zero_findings / not_applicable / suppressed / failed. Missing capability and budget exhaustion are suppressed. Unknown version and thrown rules are failed with zero findings, never a clean result.
- Metrics: precision/recall null when the denominator is 0 (`not_evaluated`). Promotion refuses missing samples and zero denominators.

#### Commands and results

```
cd web
node --experimental-strip-types --test src/lib/agmt/proof/rule-runtime.test.ts src/lib/agmt/proof/launch.test.ts src/lib/agmt/proof/product.test.ts
npx tsc --noEmit
```

Actual: **4/4 runtime + 4/4 launch + 4/4 product pass**. `tsc` **exit 0**. Network instrumentation observed 0 calls.

#### Remaining blockers and next eligible tasks

- Wiring the runtime into `analyzeProof` for published runs can proceed with PWC-15 (tighten six beta rules).
- Per-rule 100/100 comment-rule corpus and 1,000 correction cases remain outstanding.
- **Next executable (source lane):** PWC-15.
- **Critical path (code-eligible, staging blocked):** PWC-19 depends on live PWC-18.
- Do not enable `PROOF_UPLOADS_ENABLED`. Do not apply 0009 to production.

### PWC-18 follow-up — publication vs deletion authority

- **Baseline commit:** `222469a0174ef11c35175ed7d7feac484f22522c`.
- **Change commit:** `db53203ae063005417d19615223a9199a7b35b8c`.
- **Files changed:** `web/src/lib/server/proof-objects.ts`, `web/src/lib/server/proof-transfer.ts`, `web/src/lib/server/proof-transfer.test.ts`, `web/src/lib/server/proof-reconciliation.ts`, `web/src/lib/server/proof-reconciliation.test.ts`.
- **Status:** Implemented; Tested (5/5 transfer + 7/7 reconciliation = 12/12). Live R2 **Blocked** (no authorized staging buckets this session). Word not applicable. Not Deployed.
- **Must-not-change held:** abort success is never inferred from a timeout; user-supplied keys are not deletion authority; uploads remain disabled; `scanning` → `processing` still false.

#### Behaviour

- Publication (`admitPublication`) requires an owned reserved `proof/v2` key, a settled writer, and exact checksum/size. Mismatch, corrupt metadata, partial bytes and unsettled writers cannot publish.
- Deletion uses server-reserved keys in the controlled namespace. Incomplete, corrupt or mismatched owned objects remain deletable after the run is fenced; they are never relocated.
- `inspect` reports absent/present/corrupt/unknown without treating integrity as ownership.
- Missing HEAD cannot prove deletion while status is open or a writer is still `writing`. `noWriterReceipt` requires `deleting`/`deleted`, drained writers, and absent keys.
- Unparseable or foreign keys stay `ownership_uncertain` and are not abandoned.
- Focused tests: mismatched bytes, partial/corrupt writes, late completion after timeout, missing objects, repeated cancellation.

#### Commands and results

```
cd web
node --experimental-strip-types --test src/lib/server/proof-transfer.test.ts src/lib/server/proof-reconciliation.test.ts
```

Actual: **12/12 pass**. Live R2 put/cancel/orphan drill: **not run**.

### PWC-15 — Review and tighten six beta rules

- **Baseline commit:** `db53203ae063005417d19615223a9199a7b35b8c`.
- **Change commit:** `b54fefbb81da225e09f0392c6a306763c0eef5eb` (rules `85c88ba`; denominators this session).
- **Files changed:** `web/src/lib/agmt/proof/launch-checks.ts`, `web/src/lib/agmt/proof/launch.ts`, `web/src/lib/agmt/proof/launch.test.ts`, `web/src/lib/agmt/proof/rule-runtime.ts`, `web/src/lib/agmt/corpus/pwc/beta-rule-cases.ts`, `web/src/lib/agmt/corpus/pwc/beta-rule-cases.test.ts`, `web/src/lib/agmt/corpus/pwc/beta-rule-denominators.ts`, `web/src/lib/agmt/corpus/pwc/beta-rule-denominators.test.ts`.
- **Status:** Implemented; Tested (4/4 beta-rule-cases + 5/5 launch + 4/4 rule-runtime + corpus including employment_typo_split). Word review of action/anchor categories remains PWC-35. Not Deployed.
- **Must-not-change held:** four-typo allowlist unchanged; mixed-format `employment_typo_split` stays labelled `track_replace` expected / comment output-action; uploads remain disabled.

#### Behaviour

- Duplicate-word deletion uses ordinary ASCII spaces only; tabs/alignment are skipped.
- Explicit inherited `w:lang` that is not `en` / `en-*` skips language rules. Unspecified language still uses the Latin-prose heuristic (not treated as English by itself).
- `analyzeProof` runs `executeLaunchRules` against the versioned registry. Incomplete scope is suppressed, not a clean zero.
- Independently labelled cases: 1,000 generated typo IDs, duplicate-word positives, 100/100 generated IDs per comment rule, plus Recieve / that-that / tab traps.
- Detection, anchoring and permitted output-action are asserted separately. Representative positives export.
- Denominators (not independent evidence): 1,000 typo IDs collapse to **80 unique sentences**; duplicate-word **10/10**; comment positives **400 IDs / 9 families**; comment negatives **400 IDs / 7 families**. Packed groups are one execution, not N documents. Held-out labels exist (109 unique families → 64/22/23) but were **not evaluated independently**; engine tests still run every generated ID.
- Mixed-format `employment_typo_split` stays labelled; not rewritten to pass.

#### Failed run and later passing rerun

| Run | Commit / scope | Result |
|---|---|---|
| Failed packed-case execution (~3373 s) | Pre-commit during PWC-15, before `85c88ba`. Packing `references.duplicate_number` and `definitions.duplicate` negatives into one document created false duplicates. | Fail |
| Passing rerun | `85c88ba90ac510f56b80969aa3d99a59fa63d6bc`; negatives for those two rules packed at size 1; 4/4 beta-rule-cases + 5/5 launch + 8/8 corpus | Pass |

#### Commands and results

```
cd web
node --experimental-strip-types --test src/lib/agmt/corpus/pwc/beta-rule-cases.test.ts src/lib/agmt/proof/launch.test.ts src/lib/agmt/corpus/pwc/corpus.test.ts src/lib/agmt/corpus/pwc/beta-rule-denominators.test.ts
```

Actual: **4/4 beta-rule-cases + 5/5 launch + 8/8 corpus + 1/1 denominators pass**. `ENGINE_BASELINE_MISSES` still contains `employment_typo_split::language.typo_allowlist::recieve`. Authored action remains `track_replace`; engine output-action remains comment because mixed rPr is not a safe tracked change.

### PWC-12 — Add Open XML SDK validator harness

- **Baseline commit:** `85c88ba90ac510f56b80969aa3d99a59fa63d6bc`.
- **Change commit:** `49166523ce5056327fa50a06dff37b3d37cf72e4` (harness `7f0ce0a`; local execution this session).
- **Files changed:** `infra/proof/validator/ProofValidator.csproj`, `infra/proof/validator/Program.cs`, `infra/proof/validator/validator.test.mjs`, `web/src/lib/agmt/validation/sdk-contract.ts`, `web/src/lib/agmt/validation/sdk-contract.test.ts`.
- **Status:** Implemented; Tested (1/1 contract + 2/2 harness executed on user-local .NET 8.0.425). Schema validation is not Word fidelity. Word **Blocked** (PWC-13). Not Deployed. Production Container remains outstanding (PWC-23).
- **Must-not-change held:** exporter stays JavaScript; user revisions are not accepted; no bypass environment flag.

#### Behaviour / licence

- Pin **DocumentFormat.OpenXml 3.5.1**, MIT, target `Office2016`. Advisory review date 2026-09-08; no known exploitable critical/high at pin time.
- CLI reads source/output bytes into memory, compares declared SHA-256, emits only `valid` / `code` / `errorCount` / hashes. Unsupported extensions (`doc`/`docm`/`dotx`/`pdf`) refuse. Invalid external `javascript:`/`file:` relationships and `application/javascript` content types return `invalid_package`. No text diagnostics.
- Environment: `dotnet` was not on PATH and not in Program Files. Official user-local SDK installed with `dotnet-install.ps1 -Channel 8.0 -InstallDir %USERPROFILE%\.dotnet -NoPath` → **8.0.425**. Docker was not available. No machine-wide or paid provisioning. Word remains a separate human gate.

#### Commands and results

```
cd web
node --experimental-strip-types --test src/lib/agmt/validation/sdk-contract.test.ts
$env:DOTNET_ROOT="$env:USERPROFILE\.dotnet"
node --test ../infra/proof/validator/validator.test.mjs
```

Actual: **1/1 contract pass**. Harness: **2/2 pass** (valid synthetic package, non-package, `.docm`, forbidden relationship, forbidden content type). Word: **not run**.

### PWC-19 — Replace whole-buffer upload with bounded stream API (local)

- **Baseline commit:** `7f0ce0ac002c5aeaec216834b3ed337219a7e330`.
- **Change commit:** `7822bf13566ba58e3cd8d2a29c54d157d61b892a` (contracts `e5cd9d0`; handler wiring this session).
- **Files changed:** `web/src/lib/server/proof-upload.ts`, `web/src/lib/server/proof-upload.test.ts`, `web/src/lib/server/proof-http.ts`, `web/src/lib/server/proof-http.test.ts`, `web/src/lib/products/capabilities.ts`, `web/src/lib/products/capabilities.test.ts`, `web/src/routes/api/proof/$.ts`, `web/package.json`, `web/scripts/with-app-env.mjs`, `web/scripts/with-app-env.test.mjs`.
- **Status:** Implemented (local contracts + handler/catalog wiring); Tested (4/4 upload + handler create/source tests). Live R2/stream staging **Blocked**. Upload journey is **not complete**: the live route’s transfer broker is `null`, so source PUT returns `processing_unavailable` even if admission passed. Browser measured upload later (PWC-31). Not Deployed.
- **Must-not-change held:** uploads remain disabled; legacy POST does not process; no second unfenced path; `scanning` → `processing` still false; deploy architecture unchanged.

#### Behaviour

- Create-run JSON `{sizeBytes, sha256, profile, language}` rejects unknown fields.
- Source PUT requires DOCX MIME and Content-Length; 8 MiB sequential parts, max four, 25 MiB cap, 120 s transfer / 20 s idle; hash mismatch is 409; overflow 413.
- Success shape is 202 with a non-ready summary (no processing inside upload).
- Admission covers `POST /runs` and `PUT /runs/:id/source` as well as legacy `POST /upload`. While paused those return 503 before the body. If the switch were on, legacy POST returns 410 `upgrade_needed` instead of processing.
- `handleProofRequest` now creates a catalog run and, when a transfer broker is injected, streams source bytes then transitions to `scanning` without processing. Live Worker wiring keeps `transfer: null` until R2 is provisioned.
- Windows wrapper follow-up: `spawn("vite")` is resolved to `node node_modules/vite/bin/vite.js` without `shell: true`. Wrangler/Nitro deploy commands are unchanged.

#### Commands and results

```
cd web
node --experimental-strip-types --test src/lib/server/proof-upload.test.ts src/lib/server/proof-http.test.ts src/lib/products/capabilities.test.ts
```

Actual: **4/4 upload + handler create/source/isolation tests pass + 7/7 capabilities**. `canTransitionProductRun("scanning","processing")` **false**. `PROOF_UPLOADS_ENABLED` unset. Live provider: **not run**.

### Wrapper `npm run build` after the vite resolution (recorded on `db76e08`)

- **Commit:** `db76e088e22b13d9f5a88473bd712e78ec6e5da2` (includes wrapper fix from `e5cd9d0`).
- Command: root `npm run build` → `npm --prefix web ci --ignore-scripts --no-audit --no-fund && npm --prefix web run build:cloudflare`.
- Result: **exit 0**. Wrapper spawned Vite through `node ./node_modules/vite/bin/vite.js` (no `spawn vite ENOENT`). Nitro preset `cloudflare-module`. Client 5.62 s, SSR 990 ms, Nitro 2.74 s.
- Follow-up: `npm --prefix web run typecheck` → `tsc --noEmit` **exit 0**. Root `npx tsc --noEmit` only typechecks the Worker `src/` tsconfig and is not the web gate.

### PWC-20 — Verify account, tenant and endpoint isolation (local)

- **Baseline commit:** `db76e088e22b13d9f5a88473bd712e78ec6e5da2`.
- **Change commit:** `7822bf13566ba58e3cd8d2a29c54d157d61b892a`.
- **Files changed:** `web/src/lib/server/proof-authorization.ts`, `web/src/lib/server/proof-authorization.test.ts`, `web/src/lib/server/proof-http.ts`, `web/src/lib/server/proof-http.test.ts`, `web/src/routes/api/proof/$.ts`, `web/src/lib/auth/db-guard.server.ts`, `web/src/lib/auth/db-guard.test.ts`, `web/scripts/proof-isolation.test.mjs`, `web/src/lib/server/product-runs.ts`.
- **Status:** Implemented; Tested (authorization + route-handler + PGlite RLS). Live staging accounts/RLS **Blocked** (no synthetic staging credentials). Browser sign-in later (PWC-32). Not Deployed.
- **Must-not-change held:** no anonymous/test-workspace bypass; verified boundary preserved for create/source/retry/ticket/download; DELETE remains available to an authenticated unverified owner; uploads remain disabled.

#### Behaviour

- Owner and tenant are taken from the server session context. Foreign owner (same tenant), other tenant, missing run and guessed IDs all return **404**, not an existence leak.
- Unverified sessions: download 403 `unverified_email`; delete 202.
- Revoked/expired/missing sessions: 401. Malformed run IDs: 400. Cookie mutations require a trusted Origin.
- Auth DB guard logs only stage, error name and driver code — no raw message, SQL or connection string. Query-timeout clients are released.
- PGlite applies 0001–0009: two owners in `t1` and a second tenant cannot SELECT/UPDATE each other’s `product_run` rows.

#### Commands and results

```
cd web
node --experimental-strip-types --test src/lib/server/proof-authorization.test.ts src/lib/server/proof-http.test.ts src/lib/auth/db-guard.test.ts
node --test scripts/proof-isolation.test.mjs
```

Actual: authorization/handler/db-guard tests pass; PGlite isolation **1/1 pass**. Staging authenticated probes: **not run**.

### PWC-21 — Implement quotas and content-free operational events (local)

- **Baseline commit:** `db76e088e22b13d9f5a88473bd712e78ec6e5da2`.
- **Change commit:** `7822bf13566ba58e3cd8d2a29c54d157d61b892a`; conservative budget follow-up this session.
- **Files changed:** `web/src/lib/server/proof-admission.ts`, `web/src/lib/server/proof-admission.test.ts`, `web/src/lib/server/proof-events.ts`, `web/src/lib/server/proof-events.test.ts`, `web/src/lib/server/proof-budget.ts`, `web/src/lib/server/proof-budget.test.ts`.
- **Status:** Implemented; Tested (quota races, stale health, cost threshold, event canaries). Live provider monitoring **Blocked**. Browser quota UI later (PWC-32). Not Deployed.
- **Must-not-change held:** deletion/download remain ungated by quota; no billing-email control; no content in events.

#### Behaviour

- Launch freeze caps: 1 active processing run/owner, 2 active runs/owner including ready, 3 uploads/owner/UTC day, 10 global/day, 80 global/UTC month, 1 global compute attempt. Daily reset uses UTC midnight Retry-After; monthly reset uses next UTC month.
- Stale purge/scanner/validator/budget health denies admission (503) even if the switch is on. Exhausted included-allotment budget is 429 and does not gate download or deletion.
- Each admit reserves estimated Worker CPU and R2 class A/B for scan/process/download/delete plus remaining-month cron/purge. These are measured controls over ordinary Proof jobs, **not** a Cloudflare billing hard stop (`PROOF_BUDGET_IS_PROVIDER_HARD_CAP = false`). Cloudflare Containers are not authorised. Hostinger scan URLs are refused.
- Events allowlist section 24 names plus size/duration buckets. Filename, body, object key, raw Error and snippets are rejected.

#### Commands and results

```
cd web
node --experimental-strip-types --test src/lib/server/proof-admission.test.ts src/lib/server/proof-events.test.ts
```

Actual: **1/1 admission + 1/1 events pass**. Live cost/health capture: **not run**.

#### Remaining blockers and next eligible tasks

- Live PWC-18/19 R2 races remain Blocked (D-02/D-03). Do not mark the upload journey complete.
- Isolated ClamAV is **not** provisioned: Cloudflare Containers are rejected under the four-month no-overage freeze. Hostinger KVM 2 is **not suitable**. A synthetic in-browser engine prototype is **feasible** but **not launched** and is **not** a ClamAV substitute. Documents were not sent to Hostinger or to Agmt servers.
- PWC-13 Microsoft Word. PWC-12 Word fidelity is not claimed from SDK schema results.
- Staging PWC-20 accounts and live RLS remain Blocked.
- Migration `0011` is in-repo and **not** applied. `0009`/`0010` remain unapplied.
- Do not enable `PROOF_UPLOADS_ENABLED`.
- **PWC-28 is not complete.** Status/list/ticket handlers exist locally, but live publication still needs a clean scan receipt.

### Local start (this session)

From `web/`:

```
npm run dev
```

URLs (host `0.0.0.0`, port **8080**):

| URL | What it is |
|---|---|
| http://127.0.0.1:8080/proof | Live Proof page. Uploads remain paused. File picker, options, sign-in and paused copy are real. |
| http://127.0.0.1:8080/proof/dev | Development-only section 9 fixtures. Banner states they are not live runs. |
| http://127.0.0.1:8080/proof/help | Help copy. |
| http://127.0.0.1:8080/ | Home, same paused availability as Proof. |

`PROOF_UPLOADS_ENABLED` remains unset. A create/source attempt while paused returns 503. A source PUT with the live transfer broker still `null` is `processing_unavailable`, never a simulated ready result.

### PWC-29 — Build pure complete run-state presentation

- **Baseline commit:** `b766c72083a1f4011cafee720d880eb9e2a41111`.
- **Change commit:** `ac064208e2dc240be9d448d90ac47e113c68c0f3` (UI) / `49991d44ca2fd4c85b7b3b866e0c358dbe32c46b` (feedback, compute, Word pairs) / this ledger commit.
- **Files changed:** `web/src/lib/products/proof-state.ts`, `web/src/lib/products/proof-state.test.ts`, `web/src/components/agmt/proof-run.tsx`, `web/src/components/agmt/proof-stage.tsx`, `web/src/components/agmt/proof-coverage.tsx`, `web/src/lib/products/products.test.ts`.
- **Status:** Implemented; Tested (8/8 proof-state + products download/expiry). Browser visual review is local `/proof/dev`. Word not applicable. Not Deployed.
- **Must-not-change held:** no fake deployed runs; no dashboard score; mixed-format discrepancy untouched; uploads disabled; `scanning` → `processing` false.

#### Behaviour

`presentProofRun` maps `RunSummaryV2` plus local overlays onto every section 9 state. Null counts stay null. Zero-finding ready is distinct from limited coverage. Availability uses `summary.serverNow`, not the client clock. Out-of-order polls cannot regress ready/rejected/failed/deleted. Coverage codes render as plain language.

#### Commands and results

```
cd web
node --experimental-strip-types --test src/lib/products/proof-state.test.ts src/lib/products/products.test.ts
```

Actual: **8/8 proof-state + products pass**.

### PWC-30 — Refine Proof layout and accessible components

- **Baseline commit:** `b766c72083a1f4011cafee720d880eb9e2a41111`.
- **Change commit:** `ac064208e2dc240be9d448d90ac47e113c68c0f3`.
- **Status:** Implemented; Tested (selection/drop unit tests). Browser 320/390/768/1440 visual check is the local fixture route; not a live Chromium receipt this session. Word not applicable. Not Deployed.
- **Files:** `proof-intro.tsx`, `proof-file-picker.tsx`, `proof-options.tsx`, `proof-actions.tsx`, `shell.tsx`, `styles.css`, `proof.tsx`, `index.tsx`.
- **Behaviour:** Proof is the primary product nav; Matters sits under Account. 720 px select column / 960 px results. Native file picker plus optional drop; multi-drop keeps the current file. Agreement/General and UK/US radios. 44 px targets. Skip link. No new design library.

### PWC-31 — Wire local selection, verification gate and upload progress

- **Status:** Implemented (local UI + hash/idempotency); Tested (5/5 use-proof-run). Live create→source→scan **Blocked** (uploads paused; ClamAV health missing). Transfer broker is no longer `null` when `AGMT_OBJECTS` is bound. Not a completed upload journey.
- **Behaviour:** Local extension/size/one-file checks; SHA-256 of selected bytes; stable idempotency per hash+profile+language. Session memory stores run ID/options/idempotency/hash only — no filename or bytes. Create then measured XHR PUT. Paused switch prevents submit. `processing_unavailable` is shown as disconnected processing, never as ready. Sign-in return path allows `/proof?run=<id>`.

### PWC-32 / PWC-28 — not complete

HMAC tickets, owner status/list and R2 download streaming are wired. **PWC-28 remains incomplete**: live publication of a validated output still requires a clean ClamAV receipt and applied 0009/0010. Independent purge Worker is deployed (see PWC-27) but does not by itself complete downloads. **PWC-32 remains incomplete** because it depends on PWC-28. `/proof/dev` stays `import.meta.env.DEV` only.

### PWC-33A — Metadata-only feedback endpoint

- **Status:** Implemented; Tested (schema/cap/extra-key + HTTP 204/400/404). Browser optional interaction later in PWC-33. Not Deployed.
- **Behaviour:** Strict `{ruleId,category,verdict}`; extra keys and bodies over 1 KiB rejected; 20/run and 100/owner/UTC day; 404 other owner; 410 after metadata gone. No free text. Does not extend deletion.

### PWC-19 live transfer (this session)

- Live `POST /api/proof/runs` + `PUT /runs/:id/source` now inject `createLiveProofRuntime` against the existing `AGMT_OBJECTS` → `agmt-proof-objects` bucket. `transfer: null` only when the binding is missing.
- Source PUT still returns 202 `scanning` and does not process inside the request. `waitUntil` plus the 1-minute cron dispatch the pipeline.
- Journey is **not complete**: ClamAV is unprovisioned, so the pipeline records `scanner_unavailable` and never marks ready. Uploads remain fail-closed.
- Migrations `0009` and `0010` are **not applied** to production.

### PWC-22–27 — live wiring started; ClamAV still Blocked on D-01

| Task | Local | Live |
|---|---|---|
| PWC-22 antivirus | Implemented/Tested: EICAR infected; missing ClamAV is `scanner_unavailable`, never clean | Compute Worker/Container prepared (`infra/proof/compute`). **Not deployed** (four-month no-overage freeze; Cloudflare Containers have no hard stop). Workflow `.github/workflows/deploy-proof-compute.yml` is `workflow_dispatch` and now fail-closed |
| PWC-23 compute | Implemented/Tested: launch `body` fixture publishes validated output after a **clean** test receipt | Engine runs after a clean AV receipt only. No production bypass |
| PWC-24 dispatch | Implemented/Tested: scanning→processing throws; cron `* * * * *` + `list_active_proof_jobs` | Outbox/cron path coded; Cloudflare Queues product not added (existing Worker cron used) |
| PWC-25 publication | Implemented/Tested in pipeline: `admitPublication` + HEAD before ready | Blocked until a clean scan exists |
| PWC-26 deletion | Implemented/Tested: HEAD absence required | Wired to live R2 when the binding exists; not a production retention drill |
| PWC-27 purge | Algorithm Tested | **Deployed** Worker `agmt-proof-purge` version `e5ded90a-2d09-432c-b98f-bc9d2dd09f1c`, cron `* * * * *`, R2 `agmt-proof-objects`. `GET https://agmt-proof-purge.dexterinlab.workers.dev/` → **200** `agmt-proof-purge` |

Merging `main` **automatically deploys** the web Worker (`.github/workflows/deploy-cloudflare.yml` `on.push.branches: main`). Migrations stay `workflow_dispatch` only. This branch was **not** merged.

### Founder spending decision (D-01 settled this session)

No additional spend, upgrades or overage for four months. **Cloudflare Containers will not be provisioned:** the product has no hard included-allotment stop. A stuck `standard-1` instance exceeds 25 GiB-hours in about seven hours. Billing alerts are not a cap. `deploy-proof-compute.yml` now refuses unless `PROOF_CONTAINERS_SPEND_APPROVED=true`.

Included usage observed 2026-09-01..09 (GraphQL, not a bill): Worker `agmt` 3,377 requests, CPU p50 2.7 ms; R2 PutObject 61, ListObjects 61, storage peak 69 bytes. Remaining included Workers/R2 capacity is effectively the full monthly allotment.

Hostinger KVM 2 (`srv1086106.hstgr.cloud`, Mumbai, paid through 2027-10-26) was inspected read-only. It has spare CPU and disk but is **not suitable** for Proof files: public n8n and Hermes, Traefik with the Docker socket, no firewall, weekly full-disk backups in Kuala Lumpur. A Docker container on that host would not isolate documents or meet two-hour deletion. Documents were not sent. `PROOF_HOSTINGER_COMPUTE_ALLOWED` is false.

See `infra/proof/provisioning.md`. Remaining before enabling uploads: **D-02** and **D-03**, plus an isolated scanner that is neither Cloudflare Containers nor this VPS. Conservative admission is implemented and is not described as an overage guarantee. I will not set `PROOF_UPLOADS_ENABLED`. Phase A is not complete.

### Synthetic Word pairs — Word desktop verification (this session)

Generated earlier into `docs/proof/word-review/`. Checklist: `docs/proof/word-review/CHECKLIST.md`.

Command: `powershell -NoProfile -ExecutionPolicy Bypass -File web\scripts\proof-word-verify.ps1`

Word: `C:\Program Files\Microsoft Office\root\Office16\WINWORD.EXE` (COM automation, visible=false).

| Fixture | Word revisions | Word comments | Result |
|---|---|---|---|
| body | 3 | 2 | PASS (expected ≥2 / ≥2) |
| table | 3 | 2 | PASS |
| prior_review | 5 | 3 | PASS |
| party_name | 0 | 0 | PASS |
| split_runs | not opened (mixed-format labelled) | | left labelled |

This is Word-opened markup on the synthetic exporter pairs. It is **not** a live upload→download Word receipt from `app.agmt.legal`.

### Commands this session (live wiring)

```
cd web
node --experimental-strip-types --test src/lib/server/proof-pipeline.test.ts src/lib/server/proof-antivirus.test.ts src/lib/server/proof-health.test.ts src/lib/products/capabilities.test.ts
npm run typecheck
node --test scripts/pwc-migration.test.mjs
npx wrangler deploy --config infra/proof/purge/wrangler.jsonc
curl.exe https://agmt-proof-purge.dexterinlab.workers.dev/
```

Actual: pipeline/antivirus/health/capabilities **pass**; typecheck **exit 0**; PGlite 0001–0010 **pass**; `scanning→processing` **false**; purge Worker **200**. `PROOF_UPLOADS_ENABLED` unset.

Change commit: `916cd5a1` (feat live transfer/pipeline/purge).

Untracked preserved: `.env.txt`; `For developer, with love.txt`; `web/scripts/production-hardening.test.mjs`.

### Commands this session (UI + local processing)

```
cd web
node --experimental-strip-types --test src/lib/products/proof-state.test.ts src/lib/products/use-proof-run.test.ts src/lib/products/products.test.ts src/lib/server/proof-feedback.test.ts src/lib/server/proof-download.test.ts src/lib/server/proof-queue.test.ts src/lib/server/proof-delete.test.ts src/lib/server/proof-scan-receipt.test.ts src/lib/server/proof-http.test.ts src/lib/server/proof-compute.test.ts
node --test ../infra/proof/compute/scan.test.mjs
node --experimental-strip-types --test ../infra/proof/purge/worker.test.ts
npm run typecheck
node --experimental-strip-types --input-type=module -e "import { canTransitionProductRun } from './src/lib/server/product-runs.ts'; ..."
```

Actual: focused suites pass as recorded above; typecheck **exit 0**; `scanning→processing` **false**.

Untracked preserved: `.env.txt`; `For developer, with love.txt`; `web/scripts/production-hardening.test.mjs`.

### Commands this session (spending freeze / conservative admission)

```
cd web
node --experimental-strip-types --test src/lib/server/proof-budget.test.ts src/lib/server/proof-admission.test.ts src/lib/products/capabilities.test.ts src/lib/server/proof-http.test.ts src/lib/server/proof-health.test.ts
node --test scripts/pwc-migration.test.mjs
npm run typecheck
```

Actual: budget/admission/capabilities/http/health **15/15 pass**; PGlite 0001–0011 **3/3 pass**; typecheck **exit 0**; `scanning→processing` **false**. `PROOF_UPLOADS_ENABLED` unset. Cloudflare Containers **not** deployed. Migration `0011` **not** applied to production.

Untracked preserved: `.env.txt`; `For developer, with love.txt`; `web/scripts/production-hardening.test.mjs`.

### Hostinger VPS assessment (read-only, this session)

Inspected VM 1086106 without installing software or sending documents. Recommendation recorded in `infra/proof/provisioning.md`: **not suitable**. Scan URLs on that host now resolve to unprovisioned antivirus. Budget module states `PROOF_BUDGET_IS_PROVIDER_HARD_CAP = false`.

```
cd web
node --experimental-strip-types --test src/lib/server/proof-antivirus.test.ts src/lib/server/proof-budget.test.ts src/lib/server/proof-admission.test.ts src/lib/products/capabilities.test.ts src/lib/server/proof-health.test.ts src/lib/server/proof-http.test.ts src/lib/server/proof-pipeline.test.ts
npm run typecheck
```

Actual: **19/19 pass**; typecheck **exit 0**; `scanning→processing` **false**. Uploads remain disabled. Cloudflare Containers **not** provisioned. Hostinger VPS **not** given documents.

### Browser-only launch architecture (founder-approved)

Founder approved browser-only Proof as the launch architecture on 2026-09-09. The controlling plan section 0 supersedes server-upload, R2 document storage, Cloudflare Containers, Hostinger scanning and two-hour Agmt content deletion for this release. Hostinger remains excluded. Containers remain unprovisioned. Spending freeze unchanged. Existing engine, ZIP safety, mapping, tracked-change export, JS validators and tests are retained.

- **Status:** Implemented and Tested locally. Deployed. Chromium Verified on the live anonymous `/proof` journey (explicit control waits, not `networkidle`). Signed-in live Proofread → download **outstanding**. Open XML SDK and Word COM Tested on lab browser-generated outputs (regression oracles), not on a live signed-in download this session. Not a silent substitute for ClamAV. Engine/browser split: `processProofLocal` is the host-agnostic adapter; the engine under `web/src/lib/agmt/` does not import `proof-local`. Cancel now rejects the worker job instead of leaving the promise hanging. Worker-graph forbid checks now follow engine modules, not only `proof-local` importers.
- **Must-not-change held:** zero LLM; `scanning` → `processing` still false; `PROOF_UPLOADS_ENABLED` unset; Hostinger compute false; Containers not provisioned; no document bytes sent to Agmt servers.

User-facing promises now in force:

- Documents are processed on the user’s device and are not sent to Agmt.
- No Agmt virus-scan claim. Local model is ZIP/XML/active-content/EICAR; ClamAV cannot run in the browser and is not recorded as clean.
- Independent JavaScript output validation runs on every document.
- Open XML SDK and Word remain release/regression tests, not per-document production checks.
- Refreshing or closing the page loses the current run.
- No promise of secure erasure from browser memory or deletion of downloaded copies.
- Measured cap: **1 MiB** source / 16 MiB expanded / 30 s. 25 MiB is not claimed.

Production path: `web/src/lib/proof-local/*` worker + `processProofLocal` (admit → analyze/export → JS `validateProofExport`). Node shims live in `web/src/lib/platform/*` and are applied only to the client/worker graph. Envelope `crypto.ts` is redirected to hashing-only `envelope-forbidden.ts`. Cloudflare build emits `.output/public/assets/proof.worker-*.js` (391 kB). Bundle inspection: no `createCipheriv`, `ClamAV`, `hstgr.cloud` or `runtime-env.server`.

Checks that cannot run in the browser (not removed): Open XML SDK, Microsoft Word COM, ClamAV. Local admission is never a clean antivirus receipt.

Browsers: Chromium Tested/Verified. Firefox executable not installed this session. Safari and physical iOS not run — labelled untested.

```
cd web
node --experimental-strip-types --test src/lib/platform/platform.test.ts src/lib/proof-local/admit.test.ts src/lib/proof-local/pipeline.test.ts
npm run typecheck
npm run proof:local-release
npm run build:cloudflare
node --test scripts/proof-local-build.test.mjs
```

Actual: platform/admit/pipeline pass; typecheck exit 0; Chromium desktop+mobile harness pass; SDK ok on five browser outputs; Word COM PASS on body/table/prior_review/party_name; worker present in client build. Evidence: `web/src/lib/proof-local/evidence.json`.

### Production verification of deployed browser-only Proof (this session)

Deployed artifact:

| Item | Value |
|---|---|
| Source commit | `ca5e934816f008e097e8572399013cebfaac462c` (`chore(web): pin lru-cache so Cloudflare CI npm ci succeeds`) |
| Includes | merge `fc44f12` of `8d10a13` (browser-only `/proof`) plus the lockfile pin |
| Worker `agmt` 100% version | `bf26652f-b240-4c2b-b96d-bdfd3df89d91` (GitHub Actions `wrangler-action` at 2026-09-09T15:00:10Z). Reconfirmed 2026-09-10 via `wrangler deployments list`: still 100%. Later version uploads (`3e70a1fc`, `e417e32f`, `056f9138`) are not 100% traffic. |
| Previous manual deploy | `5edda3a5-4df2-423f-a3f5-f8994c0f510e` (superseded) |
| Live worker asset | `/assets/proof.worker-BKKWjkIl.js` (391,402 bytes): `network_forbidden` and `cannot_run_in_browser` present; `createCipheriv`, `ClamAV`, `hstgr.cloud`, `runtime-env.server` absent |

GitHub Actions `Deploy Cloudflare` run 40 for `ca5e934` built, `npm ci`'d and wrangler-deployed, then failed the custom-domain **HTTP** smoke: `https://app.agmt.legal/login` returned **403** from GitHub runners. Direct browser and curl from this workstation received **200**. That HTTP check is not a substitute for the Proof journey.

Live Chromium against `https://app.agmt.legal/proof` (explicit waits for “Choose a Word document”, “Proofread document”, “Processing happens on this device.”, oversized copy; **not** `networkidle`):

| Check | Result |
|---|---|
| On-device copy; no upload / two-hour / virus-scan-claim copy | Pass |
| Oversized input (>1 MiB) | Pass (“This file exceeds the 1 MiB limit.”) |
| Signed-out Proofread disabled after file select | Pass |
| Document bytes / filenames / snippets in requests | None. No `POST /api/proof/upload` |
| Persistent storage (localStorage, sessionStorage, IndexedDB) | Empty |
| Analytics / session replay | None |
| Third-party on the page | Google Fonts; `https://grok.com/grok-app-builder/extensions.js` (platform PWA chrome). No document content in those requests |
| Signed-in process → download → Word | **Not run.** No verified test session in env/`web/.proof-production.env`. Headed Chromium login window waited 10 minutes without a completed sign-in. Chrome Default has no `app.agmt.legal` session cookie |
| Firefox / Safari / physical iOS | Untested (Firefox executable not installed) |

**Verdict:** deployed with end-to-end verification outstanding. The real signed-in production journey has not passed.

Engine specification was **not** on origin in the previous session. It is now on origin; see PEE-00 below. Mixed-format `employment_typo_split` stays labelled.

Chrome Default and Edge Default have no `agmt.legal` session cookies. No `AGMT_PROOF_TEST_EMAIL` / `AGMT_PROOF_TEST_PASSWORD` / `web/.proof-production.env`. Creating a production session from D1 would be a bypass and was not used.

To finish it: set `AGMT_PROOF_TEST_EMAIL` and `AGMT_PROOF_TEST_PASSWORD` in the environment or gitignored `web/.proof-production.env` (never paste the password in chat), **or** sign in with a verified Agmt account in headed Chromium: from `web/` run `$env:AGMT_PROOF_INTERACTIVE=1; npm run proof:production-journey` and complete sign-in at `https://app.agmt.legal/login?returnTo=%2Fproof`. The script waits for rendered Proof controls and processing states, not `networkidle`. Unattended runs no longer open a login window; they record e2e outstanding (exit 2) after the anonymous checks. Signed-out network/storage is not treated as processing-time privacy evidence. `https://grok.com/grok-app-builder/extensions.js` is classified as a testing-platform injection, not an Agmt application script.

### PEE-00 — Reconcile engine specification and unmerged engine-v2 work (2026-09-10)

- **Spec remote:** `origin/proof-engine-excellence-spec` = `a66df624292892edc8bcc4f12c365fdff68771f5` (`docs(proof): engine excellence specification (PEE-00..31)`, Daaktor0). Authenticated GitHub contents match: one file `docs/AGMT_PROOF_ENGINE_EXCELLENCE_SPEC.md`, 704 lines. Diff vs implementation: that file only.
- **Brought onto this branch:** cherry-pick of `a66df62` → `be5afb8` (docs-only). Spec audit baseline recorded `origin/proof-world-class-implementation` = `ca5e934`; actual implementation HEAD at fetch was `de0fdae`. Newer work was preserved, not reset.
- **engine-v2 lookup:** `web/src/lib/agmt/proof/engine-v2.ts`, `engine-v2.test.ts`, and `docs/PROOF_ENGINE_V2.md` are **absent** from this workspace, `git ls-files`, `git log --all`, and `origin/main` / `origin/proof-world-class-implementation`. **Decision: record-and-supersede.** There is no unmerged engine-v2 work to adopt. PEE-1x proceeds on the existing `launch-checks.ts` → `admitFinding` pipeline. No competing rule architecture was added.
- **Status:** Implemented; Tested (git/GitHub inspection). Not a product behaviour change. Not Deployed as a product change (docs only, on the implementation branch).
- **Must-not-change held:** no Hostinger, no Containers, no R2 provisioning, no uploads, no LLM.

### Cancellation, late-result races, and host adapter (2026-09-10)

Follow-up to `de0fdae` (`fix(proof): reject cancelled jobs and follow worker-graph imports`).

- **Behaviour:** `cancel()` still rejects immediately and terminates the Worker (the only way to stop a synchronous `analyzeProof`/`exportProofDocx` stage). Finish now clears `onmessage`/`onerror` so a late `done` cannot resolve. UI `createProofRunSession()` invalidates the run token on cancel/reset/unmount so a resolved job cannot create an object URL or become downloadable after cancel. A second `processProofInWorker` call still constructs a fresh Worker.
- **Tests:** cancel settle; cancel with no worker response (sync-stage model); late `done` does not resolve; timeout `proof_timeout` + terminate; cancel then second worker succeeds; run-session token invalidation. Pipeline abort between stages unchanged.
- **Remote/R2:** `web/src/lib/proof-local/remote-mode.ts` — `PROOF_REMOTE_MODE_ENABLED = false`; `remoteProofProcessingAllowed()` always false; no R2 clients or credentials. `processProofLocal` remains the host-agnostic adapter (no `localStorage`/`IndexedDB`/`createObjectURL`; `web/src/lib/agmt/` still does not import `proof-local`).
- **Change commit:** `e36b26c` (this package, with PEE-01). Spec cherry-pick `be5afb8`.
- **Status:** Implemented; Tested (job/run-session/remote-mode/pipeline). Lab Word COM on regenerated launch pairs: body/table/prior_review/party_name **PASS**. Live signed-in cancel **Blocked**. Not Deployed until merge.

Commands:

```
cd web
npx tsc --noEmit
npm run test:proof
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\proof-word-verify.ps1 -Root <tmp-word-pee01>
```

Actual: typecheck exit 0; **138/138** `test:proof` pass; Word COM PASS (body revisions=3 comments=2; table 3/2; prior_review 5/3 including prior comment; party_name 0/0). Node v24.11.1.

### PEE-01 — Typos v2, duplicate-word v2, placeholder v2 (2026-09-10)

Maps to PWC-15 extension (PWC-15 itself not redone). Existing `employment_typo_split` labelled miss unchanged (`track_replace` expected / comment output). Duplicate-word expected *locus* changed from deleting `" the"` (separator + second token) to deleting the second token only (`"the"`), per spec §6.2 — authored action remains `track_delete`, not rewritten to pass.

**Enabled user-facing capability (promoted after held-out-style unique-family evaluation):**

| Rule | What it now detects | Action |
|---|---|---|
| `language.typo_allowlist` (`proof-typos-v2`, 40 tokens) | Whole-token misspellings including the original four plus `recieving`, `occurrance`/`occurence`, `untill`, `arguement`, `definately`, `buisness`, `indeminity`, and the rest of the frozen map | Tracked correction |
| `language.duplicate_word` | Adjacent allowlisted function words separated by space, tab, or NBSP (`which` and `is` added; `that` still excluded) | Tracked deletion of the **second token only** |
| `completion.placeholder` | Previous `[●]`/`[TBD]`/`[insert date\|name\|amount\|address]` plus `[…]`, `[insert *]`, `[TBD*]`, `[draft*]`, underscore/em-dash runs ≥4 in prose, `XX.XX`, `‹ ›`, `{insert/TBD/draft/date/name/amount/address}` | Comment only |

**Still silent / excluded:** party names, quotations, URLs/emails, defined-term reuse, `Tehran` vs `teh`, grammatical `that that` / `had had`, signature underscores after `IN WITNESS`, numeric `[12]`, quoted `[optional wording]`. Mixed-format `recieve` remains comment-only.

**Evaluation (unique families, not packed repeats):** 40 typos × 5 families = 200 positives and 200 traps; duplicate-word 180 unique separator/family positives; placeholder 75 unique token/family positives. `canPromote` passed at correction ≥99.5% / comment ≥98% on this labelled set, zero action misses. Rules remain `defaultEnabled: true` (v1 was already enabled; v2 is a superset that met the gates). Dictionary spelling (PEE-20 / PWC-40) is **not** started.

- **Change commit:** `e36b26c`.
- **Status:** Implemented; Tested (pee01-cases, beta-rule-cases, corpus, launch, export, pipeline). Lab Word COM Verified on launch pairs as above. Live production download **Blocked**. Not Deployed until merge.
- **Must-not-change held:** `scanning→processing` false; uploads unset; Hostinger/Containers unprovisioned; no LLM; no dictionary dependency; limits remain 1 MiB / 2 MiB / 16 MiB expanded / 500 entries / 8 MiB / 20:1 / 30 s.

### Production verification (this session)

Still **Blocked**. No `AGMT_PROOF_TEST_EMAIL` / `AGMT_PROOF_TEST_PASSWORD` / `web/.proof-production.env`. Interactive headed login was **not** opened (would require the user at `https://app.agmt.legal/login?returnTo=%2Fproof`). Signed-out anonymous checks from the previous session are not processing-time privacy evidence.

Live serving (unchanged until merge): `origin/main` `ca5e934`; Worker `agmt` 100% `bf26652f-b240-4c2b-b96d-bdfd3df89d91`.

**Next concrete task:** PEE-02 indexes (PWC-39 plus RE-5 party / RE-6 figures) in parallel with PEE-30 measurement when needed; then PEE-10/11/12/13. Production signed-in journey when a verified test account is available.

### Deploy receipt — PEE-01 on main (2026-09-10)

| Item | Value |
|---|---|
| Source commit serving | `2a3100cdad32bb661b7cd3a5a5fc8000d4a904c1` (fast-forward `ca5e934` → `2a3100c` on `main`) |
| Worker `agmt` 100% version | `7065bd66-1e82-42d9-8d70-b374e2ccb659` (GitHub Actions wrangler-action 2026-09-10T09:09:16Z). Previous 100% `bf26652f` superseded. |
| Deploy workflow | run 41 `34458994903`: build, `npm ci`, wrangler **success**. Custom-domain HTTP from GitHub IPs failed (same WAF 403 as before). Local `https://app.agmt.legal/proof` **200**. |
| Web Proof corpus | run 416: typecheck/build/golden corpus **success**; full `npm test` **239/242** — 2 failures are frozen migration-list snapshots vs unapplied 0009–0011 files, not engine/export. Fix follows. |
| Eval checks | run 570 **success** |
| Live signed-in Proofread → download | **Blocked** (no verified test session) |
| Rollback | previous Worker `bf26652f-b240-4c2b-b96d-bdfd3df89d91` remains listed |

User-facing copy on live `/proof` still states on-device processing, 1 MiB, no Agmt virus-scan. Worker script is lazy-loaded until Proofread.

### Capacity policy v2 — image-heavy 100 MiB (2026-09-10)

Maps to PEE spec §9 / plan item 7. Engineering targets were 100 MB source, 150 MB stretch. Those are not unlimited claims.

**Bottleneck found:** the previous ~100× heap ratio was text-heavy XML (two parser trees + JSZip holding every part + export recompressing media). Image-heavy packages were dominated by repeated ZIP inflation and JSZip `generateAsync` of unchanged binary parts.

**Change:** `DocxPackage` inspects/verifies once, caches XML, drops inflated media, and copies unmodified local ZIP records on rewrite. ZIP/XML/time/output-validation gates remain. `extracted_text_limit` (1e6 code points) is unchanged.

**Measured (not extrapolated from the 1 MiB text fixture):**

| Family | Highest ok | Time | Notes |
|---|---|---|---|
| Image-heavy | **150 MiB** Node and Chromium | Node 1.9 s / Chromium 11.9 s at 150; Chromium **5.4 s at 100 MiB** | Media copied as-is |
| Text-heavy | **1.05 MiB** document.xml | 5.3 s Node | 2.1 MiB hits `extracted_text_limit` |
| Tables | **3.4 MiB** | 6 s Node | Next size hits `extracted_text_limit` |
| Revisions | **1.6 MiB** | 0.6 s Node | Next size hits `extracted_text_limit` |
| Adversarial high-ratio | Refused | — | `suspicious_compression_ratio` kept |

**Published policy (`proof-local-limits-v2`):** desktop **100 MiB** source / 150 MiB expanded / 90 s / 1 MiB document.xml; mobile **8 MiB** / 24 MiB expanded / 45 s. Coarse pointer or `deviceMemory` &lt; 4 selects mobile. Missing memory API does not reject. 150 MiB remains a stretch measurement, not the UI cap.

**Status:** Implemented; Tested (147/147 `test:proof`; Node benches; Chromium 8/25/100/150 MiB image-heavy). Word COM Verified on launch `body` and 8 MiB image-heavy (`revisions=3 comments=2`). Firefox/Safari/physical iOS untested. **Superseded** by capacity policy v3 below (1 MiB XML admit gate raised from measurement; device class no longer uses coarse pointer).

**Must-not-change held:** browser-only; zero LLM; no Hostinger; no Cloudflare Containers; no R2 fallback; uploads unset; ZIP ratio/entry/expansion/XML/time/validation still enforced.

Evidence: `web/src/lib/proof-local/capacity-evidence.json`, `capacity-evidence-image_heavy.json`, `capacity-evidence-chromium.json`.

### Capacity policy v3 — complete agreements (2026-09-10)

Maps to PEE spec §9 / plan item 7. Continues the v2 package-memory work. Does **not** add proofreading checks.

**Gates reconciled (not the same number):**

| Gate | What it measures | What it stopped |
|---|---|---|
| `source_too_large` | Compressed ZIP bytes | Files above the published source ceiling (desktop 100 MiB) |
| `package_too_complex` (`maxDocumentXmlBytes`) | Uncompressed `word/document.xml` (and total XML) | The old **1 MiB XML** admit gate would refuse the 150-page-target complete agreement (`document.xml` 1,533,655 bytes). Extracted text there is 376,021 code points. |
| `extracted_text_limit` | Visible Unicode code points after projection | Previous text-heavy 2.1 MiB `document.xml` (almost all visible text). Complete 300-page-target agreements at 749,638 code points stay under 1e6. |
| ZIP ratio / expansion / time | Package safety | Adversarial high-ratio family; unchanged |

Do not confuse compressed file size, XML size, and visible document length. A 100 MiB image-heavy package can have a tiny `document.xml`. A 1.5 MiB complete agreement can be refused by a 1 MiB XML ceiling while remaining well under 1e6 extracted code points.

**Representative complete agreements** (definitions, cross-refs, Schedule 1 table, formatting, existing comment/revisions, small embedded image). Page targets used `PAGE_CHARS_PER_PAGE` (2500); Word `ComputeStatistics(wdStatisticPages)` on the 150-target labelled output was **293 pages**.

| Target pages | Kind | ZIP bytes | document.xml | extracted code points | Node | Chromium | Findings |
|---|---|---|---|---|---|---|---|
| 25 | labelled | 268,836 | 262,518 | 63,094 | 265 ms | 303 ms | planted 4 exact; 2 corrections / 2 comments |
| 25 | clean | 268,848 | 262,530 | 63,108 | 318 ms | 188 ms | 0 / 0 |
| 75 | labelled | 780,564 | 774,246 | 189,028 | 658 ms | 559 ms | planted 4 exact |
| 150 | labelled | 1,539,973 | 1,533,655 | 376,021 | 1.45 s | 1.01 s | planted 4 exact |
| 300 | labelled | 3,057,752 | 3,051,434 | 749,638 | 3.06 s | 2.49 s | planted 4 exact |

Coverage is **limited** because the fixtures contain existing tracked changes (honest, not a new rule). RSS delta at 300-page labelled Node: ~39 MiB. Chromium `performance.memory` reported a constant 10,000,000 and is not treated as a reliable available-memory measurement.

**Published policy (`proof-local-limits-v3`):** desktop **100 MiB** source / 150 MiB expanded / 90 s / **8 MiB document.xml** / 12 MiB total XML / 1e6 extracted code points. Mobile **8 MiB** source / 2 MiB document.xml — phone UA only; **not mobile-verified**. `deviceMemory` is a hint, not a class switch. `pointer: coarse` is not used (touchscreen laptops stay desktop). Runtime ZIP/XML/time/cancellation safeguards apply on every device. 150 MiB remains a stretch measurement, not the UI cap.

**ZIP export path:** Independent tests cover data-descriptor copy of unmodified binary parts and relationships, rewrite cancellation, CRC/duplicate/ZIP64/malformed-offset refusal before rewrite, and a poisoned XML cache that must not make the independent validator accept a mutated original comment. Validators always re-open from original bytes.

**Word COM (this machine, alerts suppressed):** body/table/prior_review PASS; 150-target complete agreement **293 pages, 749 revisions, 4 comments, 1 table, 1 inline shape**; image-heavy **100 MiB** output opened (`revisions=3 comments=2`). No COM error. Repair prompt not observed (DisplayAlerts=0).

**Status:** Implemented; Tested (`test:proof` 156/156; `tsc --noEmit` pass; Node + desktop Chromium complete-agreement families). Word-Verified: launch pairs, 8 MiB and **100 MiB** image-heavy, 293-page complete agreement. Firefox/Safari/physical iOS **untested**. Mobile 8 MiB class **not mobile-verified**. **Deployed** to `main` `bc23b29` (fast-forward). GitHub Actions run 43 (`34473618411`): build, wrangler **success**. Custom-domain smoke from GitHub IPs failed (WAF 403, same as prior). Local `https://app.agmt.legal/proof` **200** with 100 MiB size-limit copy (not 1 MiB). Signed-in Proofread → download **Blocked** (`sign_in_rejected`).

**Must-not-change held:** browser-only; zero LLM; no Hostinger; no Cloudflare Containers; no automatic R2 fallback; uploads unset; ZIP ratio/entry/expansion/XML/time/validation still enforced. No additional proofreading checks were enabled.

Evidence: `web/src/lib/proof-local/capacity-evidence-agreements.json`, `capacity-evidence-chromium-agreements.json`, plus v2 image-heavy files.

### PEE-02 — Scoped numbering, definition, reference, party and figure indexes (2026-09-10)

Maps to PWC-39 wholesale plus RE-5 party / RE-6 figures. **Does not enable new proofreading checks.** Existing six launch rules still use `launch-checks.ts` `labels()` / declaration scans. Indexes are built once per `analyzeProof` run, versioned `proof-index-v1`, and are a pure function of `(source, extracted)`.

**Index surfaces:**

| Index | Distinguishes | Notes |
|---|---|---|
| scopes | `resolved` / `missing` / `ambiguous` | Schedule restart, reserved numbers, native numbering labels, never a boolean guess. Cross-scope same numbers stay missing locally and record `otherScopeHits`. |
| definitions | local vs imported declarations | `"X" means` / `shall mean` / `has the meaning given in`; parent link when a schedule re-declares a main-body term. |
| references | single / range / coordinated / relative / external | Range stores both endpoints; statutes and other instruments are `external`. |
| parties | declared short name + legal name | Keyed on quoted/defined labels, not string similarity. |
| figures | date / amount / percentage | `03/04/2026` is `ambiguous`; `23 April 2026` parses; no global dd/mm vs mm/dd guess. |

**Tests:** 5/5 `indexes.test.ts` (in-process + cross-process digest identity; labelled cases; ambiguous duplicates; native numbering; launch findings unchanged). `test:proof` **161/161**. `npx tsc --noEmit` exit 0.

**Word COM:** launch-demo body/table/prior_review/party_name **PASS**. Additional capacity Word (alerts suppressed): 300-page-target labelled output **584 pages, 1497 revisions, 4 comments, 1 table, 1 inline shape**; table-heavy 24 KiB family opened (`tables=1`). Repair prompt not observed (`DisplayAlerts=0`). 100 MiB image-heavy remains the advertised-capacity Word receipt from v3.

**Status:** Implemented; Tested; Word preservation Verified on launch pairs. Firefox/Safari/physical iOS **untested**. **Deployed** to `main` `6964535` (fast-forward). GitHub Actions Deploy Cloudflare run 45 (`34476536440`): build, wrangler **success**. Custom-domain smoke from GitHub IPs failed (WAF 403, same as prior). Web Proof corpus run 423 **success**. Eval checks run 579 **success**. Local `https://app.agmt.legal/proof` **200** with 100 MiB size-limit copy. Signed-in Proofread → download **Blocked** (`sign_in_rejected`).

**Must-not-change held:** browser-only; zero LLM; no Hostinger; no Cloudflare Containers; no automatic R2 fallback; uploads unset; no new published findings. `scanning→processing` not touched.

**Next concrete task:** PEE-10 reference rules v2 (PWC-41 references half), then PEE-11 definitions v2. Do not promote index-backed rules on this increment.

### PEE-10 / PEE-11 — Index-backed reference and definition rules (2026-09-10)

Maps to PWC-41. Uses PEE-02 indexes. Comment-only. Incomplete inventories suppress absence claims. Ambiguity is never converted into a correction.

**Held-out promotion** (precision ≥98%, recall ≥90%, minSamples 100; unique families across SHA/SSA/NDA/employment/letter):

| Rule | Held-out TP/FP/FN | Precision / recall | Gate | defaultEnabled |
|---|---|---|---|---|
| `references.missing_target` v2 | 152 / 0 / 0 | 100% / 100% | pass | true (was already on; now singles, range-both-missing, coordinated missing endpoints) |
| `references.duplicate_number` | 113 / 0 / 0 | 100% / 100% | pass | true |
| `references.scope_confusion` | 141 / 0 / 0 | 100% / 100% | pass | **true (new)** |
| `references.ambiguous_target` | 122 / 0 / 0 | 100% / 100% | pass | **true (new)** |
| `definitions.duplicate` | 149 / 0 / 0 | 100% / 100% | pass | true |
| `definitions.scope_redefinition` | 125 / 0 / 0 | 100% / 100% | pass | **true (new)** |
| `definitions.case_variant` | 121 / 0 / 0 | 100% / 100% | pass | **true (new)** |
| `definitions.undefined_use` | 134 / 0 / 0 | 100% / 100% | pass | **true (new)** |
| `definitions.unused` | 124 / 0 / 0 | 100% / 100% | numeric pass; spec §6.5 requires lawyer adjudication | **false** |

Detection, exact anchoring and comment action were scored separately. Capacity-corpus planted four errors were not used as the promotion set.

**Examples users can now catch:** missing `Clause 99.2`; `Clauses 90.1 to 91.1` when both ends are missing; `Clause 1 and 92.1` when 92.1 is missing; `Clause 3` that exists only in a schedule; a number that appears twice in the same scope; a schedule re-definition of a main-body term with different text; `confidential information` where `Confidential Information` is defined; `Secret Project Sha1` written like a defined term with no definition.

**Remaining exclusions:** external statutes/other agreements; relative `this Clause`; quoted references; reserved gaps unless referenced; identical scoped re-definitions; generic nouns `agreement`/`notice`/etc.; unused definitions (off); party-name and words-and-figures (PEE-12/13, not in this increment).

**Tests:** `test:proof` **166/166**. `npx tsc --noEmit` exit 0.

**Word:** Visible Word (`Visible=true`, `DisplayAlerts=-1`) opened body output (3 revisions / 2 comments), a new-rule structural output (0 revisions / 3 comments: missing, duplicate number, case-variant), and the 300-page-target labelled output (**584 pages**, 1497 revisions, 4 comments, 1 table, 1 inline shape) without a COM error or hung repair dialog. **100 MiB image-heavy Word: Blocked** (no browser-generated 100 MiB output in this workspace). Previous COM runs with alerts suppressed are not treated as absence-of-repair evidence.

**Production journey:** Live `/proof` after auth settle still requires sign-in (`Sign in to Agmt` visible; Proofread disabled). Anonymous local processing is **not** enabled. That matches `web/AGENTS.md` (no anonymous deployed path). The earlier anonymous-profile report is not the current policy. `sign_in_rejected` / CI `INVALID_EMAIL_OR_PASSWORD` was **not** retried. HTTP 200 is not a processing receipt.

**Status:** Implemented; Tested. Word-Verified on body + new-rule structural + 584-page output with alerts on. 100 MiB Word **Blocked**. **Deployed** to `main` `b8f30a6`.

### Deploy receipt — PEE-10/11 on main (2026-09-10)

| Item | Value |
|---|---|
| Source commit serving | `b8f30a64d6ffdbc639ca80e4cfe11244328efb32` (fast-forward `61b0519` → `b8f30a6` on `main`) |
| Worker `agmt` scriptVersion | `fd4c1527-47d1-40ca-8c65-714f011cfab5` (GitHub Actions wrangler-action 2026-09-10T13:32:14Z) |
| Deploy workflow | run 47 `34483154727`: build, `npm ci`, wrangler **success**. Custom-domain smoke from GitHub IPs failed (session GET timeout; wrangler still succeeded). |
| Web Proof corpus | run 425 **success** |
| Eval checks | run 583 **success** |
| Live `/proof` | signed-out: Sign in required, Proofread disabled. New check copy present (ambiguous/cross-scope references, capitalisation, undefined title-case). Help page matches. |
| Live signed-in Proofread → download | **Blocked**. CI auth smoke: `User not found` / `INVALID_EMAIL_OR_PASSWORD`. Not retried. HTTP 200 is not a processing receipt. |

**Must-not-change held:** browser-only; zero LLM; no Hostinger; no Cloudflare Containers; no automatic R2 fallback; uploads unset; no anonymous access added.

**Next concrete task:** PEE-12 party consistency and PEE-13 dates/amounts; production signed-in journey when a verified test account exists in the Auth database.

### Access diagnosis, definition precision, PEE-12/13 (2026-09-10)

**Access defect (not “wrong password”):** signup and sign-in POST on `https://app.agmt.legal` reach the same Worker and `AGMT_AUTH_DB` (Hyperdrive caching disabled). Worker logs show `POST /api/auth/sign-up/email` plus Resend **403 then 422** (`[auth.email] provider rejected`) and Better Auth `Failed to run background task: We could not send the verification email.` Accounts can be written while verification mail never arrives. `AGMT_PUBLIC_URL` on the Worker was still `https://agmt.dexterinlab.workers.dev` (`--keep-vars` preserved the T07 value), so verification links and `__Host-` cookies targeted workers.dev, not `app.agmt.legal`. Signed-out `GET /api/auth/get-session` sometimes hung to the 15 s handler timeout (custom-domain smoke failure). `User not found` / `INVALID_EMAIL_OR_PASSWORD` on the journey script is that lookup against this database; it does not prove signup works.

**Anonymous journey:** launch commit `8d10a13` already required `auth === "verified"` for Proofread. `web/AGENTS.md` forbids anonymous deployed paths. No access-policy change.

**Fixes in this increment:** pin `AGMT_PUBLIC_URL=https://app.agmt.legal` in `web/wrangler.jsonc` and deploy `--var`; cookieless `get-session` returns `null` without AUTH_DB; production mail refuses the Resend test sender; `AUTH_EMAIL_FROM` rotated to the verified `mail.agmt.legal` sender (secret put, value not recorded). Definition rules revised: schedule “for the purposes of this Schedule” / express overrides silent; ordinary lowercase of common collocations silent; title-case phrases need a determiner and are not org/geo/court names. PEE-12 `parties.consistency` and PEE-13 `figures.date_invalid` / `figures.words_figures_mismatch` enabled after held-out point-estimate gates. Wilson 95% lower bound on cloned templates remains below 98% — observed 100% is not 95% confidence that real-world precision exceeds 98%. `definitions.unused` stays off.

**Tests:** `test:proof` 173/173; `tsc --noEmit` 0. Party-name fixture still 0 findings.

**Production download/Word:** still requires a verification-email click on a real inbox after this deploy. 100 MiB Word remains Blocked separately.

### Founder exception — signed-out local Proof (2026-09-10)

**Instruction:** Temporarily remove the account requirement from browser-only Proof so users can use the product. This supersedes `web/AGENTS.md` (as updated) and older specification language that local Proof required a verified account. Authentication is **not** removed across Agmt.

**Scope:**
- Signed-out users at `/proof` can choose DOCX → process on device → download.
- Local Proof does not wait for `get-session` or AUTH_DB before becoming usable.
- Copy: “No account required. Your document is processed on this device and isn’t sent to Agmt.”
- Sign-in remains a secondary header action.
- Accounts, settings, matters, server document endpoints and any future R2 mode stay authenticated. Server uploads remain disabled. No fake sessions. No document content in network, analytics or persistent browser storage.

**Auth remaining (separate):** verification delivery and first-request sign-in timeouts are **not** called fixed. Signup HTTP 200 and a warm retry are not a complete auth receipt.

**100 MiB Word:** still separately labelled Blocked.

### Browser-side processing feasibility (synthetic prototype, retained)

Bounded prototype only. Production architecture was **not** rewritten. Prototype is **not** launch-ready and is **not** wired to `/proof`. Hostinger remains excluded. Cloudflare Containers remain unprovisioned. Uploads remain disabled.

- **Change commit:** this session.
- **Files added:** `web/scripts/browser-proof-prototype/**` (shims, entry, runner, `evidence.json`). `web/package.json` script `proof:browser-prototype` only. Production engine, API, Worker, Hostinger denylist and upload switch **unchanged**.
- **Status:** Prototype Implemented and Tested on synthetic DOCX in Chromium desktop and iPhone-13 viewport emulation. Host-side Open XML SDK and Word COM were run on those outputs (they cannot run *in* the browser). Not Deployed. Not a production path.
- **Must-not-change held:** zero LLM; `scanning` → `processing` still false; `PROOF_UPLOADS_ENABLED` unset; Hostinger compute false; Containers not provisioned; no document bytes sent to Agmt servers.

#### What ran

Existing deterministic engine (`analyzeProof` / `exportProofDocx` / JS package+reconstruction validators / `scanProofDocx`) bundled with browser shims for `node:crypto`, `node:assert/strict`, `node:zlib` (pako already present via JSZip) and `Buffer`. Production `crypto.ts` envelope encryption was excluded from the bundle.

Synthetic fixtures: `body`, `split_runs`, `table`, `prior_review`, `party_name`, plus 108 KiB and 1.02 MiB repeat documents. No client documents.

| Check | Result |
|---|---|
| Parse and map supported synthetics | Pass. Findings match the Node engine, including the four-typo allowlist, duplicate word, missing clause, placeholder, and the party-name trap (zero findings). Mixed-format `split_runs` stays comment-only for the typo. |
| Genuine `w:ins` / `w:del` / anchored comments | Pass. Desktop and mobile markup flags true. Word COM on the browser output: body/table/prior_review/party_name **PASS**. |
| Preserve existing Word structures | Pass on `prior_review` (existing comment and prior revisions retained; Agmt IDs do not reuse 0/7/8). Untouched ZIP entries remain byte-identical via the existing JS validator. |
| Validate output | JS independent validators ran **in the browser**. Open XML SDK 3.5.1 ran **on the host** against those bytes: all five fixtures `ok`, 0 schema errors. SDK **cannot** run in the browser. |
| Downloadable DOCX | Pass. Object URL in page memory; revoked after copy. ~2 KiB fixtures 15–60 ms; 108 KiB in 195 ms; 1.02 MiB in 1.3 s. |
| Document bytes on Agmt servers / analytics / logs | None in the prototype. Page `fetch` / XHR / Beacon / WebSocket tripwires recorded 0 attempts. Playwright allowed only the local HTML and JS. |
| Persistent browser storage | Empty: no localStorage, sessionStorage or IndexedDB keys. Filename/bytes were not stored. |
| Malware | ClamAV **cannot** run in the browser and was **not** treated as a clean scan. Local gate still refuses EICAR, `vbaProject.bin` and XML DTD/entity. Receipt is `structurally_admitted`, not ClamAV `clean`. |

Resources: prototype bundle 1.26 MiB uncompressed. 1.02 MiB synthetic used ~102 MiB extra JS heap (44 MiB → 146 MiB). **25 MiB was not run.** A linear reading of that heap ratio would be multiple gigabytes at 25 MiB, which is not a reasonable mobile budget. iPhone-13 results are Chromium emulation, not a physical iPhone or Safari.

#### Node-only / native dependencies (not silently dropped)

| Dependency | Required check | In browser |
|---|---|---|
| `DocumentFormat.OpenXml` 3.5.1 / `ProofValidator.exe` | PWC-12 schema validation | Cannot run. Host oracle only. |
| ClamAV | PWC-22 authoritative malware scan | Cannot run. Not called “clean”. |
| Microsoft Word COM | PWC-13 fidelity | Cannot run. Host check on prototype output only. |
| `node:zlib` `inflateRawSync` / `crc32` | Bounded ZIP inflation | Shimmed (pako + max output). |
| `node:crypto` `createHash` | SHA-256 | Shimmed (pure JS; matches Node for `"abc"`). |
| `node:assert/strict` | JS validators | Shimmed. |
| Node `Buffer` | Byte handling | Shimmed Uint8Array subclass. |
| `web/src/lib/agmt/crypto.ts` envelope encryption | Server secret | Excluded from bundle. |

#### Recommendation

**Conditional go for local processing. No-go as a silent substitute for the current uploaded-to-Agmt plan, and not launch-ready.**

This is the only freeze-compatible way to run the existing engine without Hostinger or Cloudflare Containers. It is not the current controlling architecture and must not be shipped until the plan and user-facing promises below are changed on purpose.

Exact controlling-plan changes that would be required (not applied):

- §1 / §17–20: drop isolated Container, ClamAV-in-compute, R2 quarantine of **document bytes**, and queue-to-container processing for Proof content. Keep the web Worker for auth, metadata, help and (if still wanted) run records **without** file bytes.
- §7 journey and §9 privacy copy: stop saying the file is uploaded and deleted from Agmt storage within two hours. The honest statement is that Agmt never receives the document.
- Two-hour deletion of Agmt-controlled **content** becomes vacuous for files. It would still apply to any metadata we keep. Device downloads and the user’s own backups are outside Agmt.
- PWC-22: replace “ClamAV clean receipt before parse” with a disclosed local model (ZIP/XML/active-content/EICAR). Missing ClamAV must not be recorded as clean.
- PWC-12: per-run SDK cannot be a publication gate in the browser. Keep SDK/Word as corpus and CI oracles, or do not claim that gate.
- §21 JS budget (≤40 KiB gzip extra) and §23 25 MiB/P95-including-scanner targets: the prototype bundle is 1.26 MiB and 25 MiB in-browser is unproven.
- Resume-after-refresh of an in-flight **document** cannot work without storing bytes. Closing the tab loses unsaved work.

User-facing promise changes (not applied):

- From “your file is uploaded, then deleted within two hours” to “your file stays on this device; Agmt’s servers do not receive it.”
- Do not say the file was virus-scanned by Agmt.
- Do not say an isolated Agmt computer processed it.
- Keep: free, zero LLM, tracked changes and Word comments, limited-coverage honesty, mixed-format typo labelled not auto-corrected.

Remaining risk if this path were later adopted: malicious OOXML can still attack the in-page parser; there is no ClamAV signature set; per-run SDK is absent; 25 MiB is likely too large; browser extensions can read page memory; real iOS Safari was not measured; a future telemetry mistake could leak bytes (the prototype forbids that; production would need the same tripwires).

#### Commands and results

```
cd web
npm run proof:browser-prototype
node --experimental-strip-types --test src/lib/server/proof-antivirus.test.ts src/lib/agmt/proof/launch.test.ts src/lib/agmt/export/docx.test.ts src/lib/server/proof-budget.test.ts
```

Actual: prototype recommendation `conditional_go_local_processing`; Chromium desktop+mobile fixtures pass; SDK host `ok` on five outputs; Word COM PASS on four review pairs; production tests **16/16 pass**. Evidence: `web/scripts/browser-proof-prototype/evidence.json`.

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
