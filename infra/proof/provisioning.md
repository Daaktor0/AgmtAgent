# Proof live-processing provisioning checklist

Spending decision (2026-09-09): no additional charges, upgrades or usage
overage for the first four months of launch. Existing subscriptions may
continue. This file now records that freeze and the controls that enforce it.

Uploads remain disabled until the gates below are green **and** a later
explicit founder action sets `PROOF_UPLOADS_ENABLED=true` on the selected
Worker.

## Exact services

| Service | Name / config | Why | Estimated cost (re-quote at provision) | Founder decision |
|---|---|---|---|---|
| Workers Paid | Existing `app.agmt.legal` web Worker | API, auth, admission | $5 / month Workers Paid base (already in play for the app) | None new |
| R2 quarantine | `agmt-proof-quarantine-staging` then `-production` | Original DOCX; private; no public access | Storage + Class A/B ops. At beta volume typically well under $5 / month | **D-02** managed encryption; **D-03** residency disclosure |
| R2 temporary | `agmt-proof-temporary-staging` then `-production` | Marked DOCX; private | Same as quarantine | D-02 / D-03 |
| Transfer broker Worker | Placeholder `infra/proof/wrangler-broker.jsonc` | Put/abort under reserved prefix only | Included in Workers usage | None after D-01 |
| Cloudflare Queues | `agmt-proof-jobs` + DLQ | Metadata-only envelopes | Queues are billed per million operations; beta volume is small | **D-01** |
| Isolated Container | Image from `infra/proof/compute/Dockerfile` | ClamAV scan + engine/validator; no secrets; no egress | Dominant cost. Plan envelope **$25–50 / month** operating, hard ceiling **$50** unless founder raises it. Need ≥4 GiB class after RSS measurement | **D-01** budget and account quota |
| Daily signature image | `.github/workflows/proof-scan-image.yml` (not yet live) | Fresh ClamAV signatures; close admissions if >24 h stale | Container registry + Actions minutes | D-01 |
| Independent purge Worker | `infra/proof/purge/` | List/delete/abort only; 1-minute schedule | Workers + R2 Class A list/delete | D-01 |
| Hyperdrive | Existing `AGMT_APP_DB` / `AGMT_AUTH_DB` | Metadata only | Existing | None |
| Resend | Existing auth email | Verification mail | Existing plan | None |
| Open XML SDK | User-local .NET 8 already used for PWC-12 | Schema validation in compute image | SDK is MIT; Container CPU time is the cost | **D-04** Word reviewers remain human |

One-day R2 lifecycle is an orphan backstop only. It does **not** implement the two-hour clock (**D-05**).

## Configuration that can be prepared now (no apply)

- Bucket names and key contract: `infra/proof/storage.md`
- Broker placeholder: `infra/proof/wrangler-broker.jsonc`
- Scan/compute image recipe: `infra/proof/compute/Dockerfile`
- Fail-closed scan entry: `infra/proof/compute/scan.mjs`
- Purge algorithm: `infra/proof/purge/worker.ts`
- Upload switch: unset / not `true`
- Migration `0009` exists in repo and is **not** applied to production

## Spending freeze (D-01 settled)

No Cloudflare Containers, Queues, extra R2 buckets, plan upgrades or
usage overage. Cloudflare does **not** hard-stop Container billing at the
included 25 GiB-hour / 375 vCPU-minute allotment. A `standard-1` instance
that fails to sleep exceeds included memory in about seven hours. Health
pings can keep it warm. Billing alerts cannot prevent that. The compute
image and Worker remain in-repo and **must not be deployed**.

Workable $0 alternative (not provisioned): run ClamAV on the existing
Hostinger KVM 2 only if the founder later accepts documents leaving
Cloudflare onto a VPS that already runs n8n, Traefik and Hermes. That is
an isolation/residency choice (D-03), not a spend choice. Until then
scanner health stays stale and uploads stay paused.

Admission now fail-closes on a persisted budget ledger plus conservative
caps (3/owner/day, 10 global/day, 80 global/month, 1 concurrent compute).
Each admit reserves worst-case Worker CPU and R2 class A/B for process,
download and verified deletion. Cron/purge capacity for the rest of the
month is held back. Missing or exhausted budget pauses new uploads only.

## Founder decision request still required before uploads are enabled

Existing approved resources: Workers Paid (`agmt`), R2 `agmt-proof-objects`,
Hyperdrive `AGMT_APP_DB` / `AGMT_AUTH_DB`, Resend, Hostinger KVM 2 (already
paid through 2027-10-26). Independent purge Worker is already deployed.

| Decision | Recommendation | Consequence if accepted | Incremental cost |
|---|---|---|---|
| **D-02** encryption | Accept TLS + Cloudflare-managed R2 encryption for new 2-hour objects. Do not introduce customer-managed keys at launch. Historical envelope keys stay untouched. | New Proof objects are written without `encryptBytes` / `object_manifest`. | $0 |
| **D-03** residency | Do not claim India-only storage. Launch only for users whose policies permit Cloudflare’s disclosed locations. Hostinger ClamAV is a separate later choice. | Copy and contracts stay honest. | $0 |

I will not set `PROOF_UPLOADS_ENABLED` until D-02/D-03 are accepted **and**
ClamAV health, purge health, validator health and budget health are actually
fresh on production. D-01 is settled as **no Container overage**.

## Founder decisions still open

1. **D-01** — **Settled:** no additional spend / no Cloudflare Container provisioning for four months.
2. **D-02** — confirm TLS + private R2 managed encryption is acceptable (no customer-managed key for launch).
3. **D-03** — no India-only residency claim; launch only for users whose policies permit disclosed locations.
4. **D-04** — name Windows and Mac Word reviewers.
5. **D-05** — keep the two-hour deletion target; disclose provider-outage limits accurately.
6. **D-06** — Agreement + UK defaults (already the UI default).
7. **D-07** — public-site claims stay in the separate site initiative.

## Explicitly not done by this branch

- Paid provisioning, bucket creation, DNS, custom-domain cutover
- Production or staging `wrangler deploy`
- Applying migrations
- Setting `PROOF_UPLOADS_ENABLED`
- Merging to `main`
