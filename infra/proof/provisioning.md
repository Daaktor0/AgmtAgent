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

Hostinger KVM 2 was inspected read-only on 2026-09-09 and **must not**
receive Proof documents. A separate Docker container on that machine would
not isolate them. See the assessment below.

Admission fail-closes on a persisted budget ledger plus conservative caps
(3/owner/day, 10 global/day, 80 global/month, 1 concurrent compute). Each
admit reserves estimated Worker CPU and R2 class A/B for process, download
and verified deletion, and holds remaining-month cron/purge. Those are
**measured controls over ordinary Proof jobs**, not a Cloudflare billing
hard stop. Uncounted account traffic, low estimates, retries, logs, other
Workers or a bug can still be billed. Missing or exhausted budget pauses
new uploads only. Billing alerts are not a cap.

## Hostinger KVM 2 assessment (read-only, 2026-09-09)

Inspected via Hostinger API and anonymous HTTP probes. Nothing was
installed. No documents were sent.

| Fact | Observed |
|---|---|
| Server | id 1086106, `srv1086106.hstgr.cloud`, `31.97.230.149`, Ubuntu 24.04 with Docker and Traefik |
| Plan | KVM 2: 2 CPU / 8 GiB RAM / 100 GiB disk, paid through 2027-10-26, auto-renew off |
| Location | VM geolocates to Mumbai. Weekly disk backups are stored at `node149-my-kul-1-pbs` (Kuala Lumpur) |
| Load (7 days) | CPU avg 1.9% (max 5.6%). RAM ~2.2 of 8 GiB. Disk ~16 of 100 GiB |
| Workloads | n8n (public, 2 months up, ~0.7 GiB), Hermes agent (public, 2 weeks up, ~1.9 GiB), Traefik (host network + Docker socket), `agmtagent` stopped |
| Network | **No Hostinger firewall.** n8n answers on `https://n8n-3ygp.srv1086106.hstgr.cloud` and `http://31.97.230.149:32768`. Hermes answers on its Traefik host and `http://31.97.230.149:32781` |
| Access | Traefik mounts `/var/run/docker.sock`. Compose environment holds plaintext app credentials. Hostinger API can read compose files. Monarx host scanner is present |
| Backups | Weekly full-disk backups (2026-09-01 and 2026-09-08). Snapshot slot empty. Backup copies the whole disk, not a Proof-only volume |
| Temp files | Not inspected inside the guest. Hostinger backups, swap, Docker logs, overlay and Monarx would see any file that lands on disk |

**Recommendation: this server is not suitable for Proof scanning or document processing.** Spare CPU and disk do not make it a safe place for client files.

What would have to change, and still would not meet the two-hour deletion contract:

- Move n8n, Hermes and Traefik off the machine, or accept that they share the kernel, the Docker engine and the disk with Proof.
- Remove Traefik’s Docker socket and stop publishing high ports on `0.0.0.0`.
- Attach a firewall that allows only the Proof control path.
- Disable swap, crash dumps and host malware scanning of Proof paths.
- Stop Hostinger weekly backups while any document can exist — which also removes disaster recovery for n8n.

Even then, documents would leave Cloudflare, sit in Mumbai, and be copied to Malaysia whenever a backup ran. Hostinger staff and the backup store would retain whatever was on disk. A Docker container does not prevent that.

Where documents would be processed if this server were used: on the same Ubuntu guest as n8n, Hermes and Traefik, in Mumbai, with Hostinger taking weekly disk images in Kuala Lumpur.

How other applications and backups would be prevented from accessing or retaining them: **they would not be.** Docker namespaces do not hide files from the host, from Traefik’s Docker socket, from Hostinger backups, from swap, or from Monarx.

Remaining risk if we used it anyway: other apps on the box; public n8n and Hermes; Hostinger and its Malaysian backup copies keeping files after Proof “deleted” them; no India-only or Cloudflare-only claim; two-hour deletion broken.

Nothing was provisioned. `PROOF_HOSTINGER_COMPUTE_ALLOWED` stays false. Scan URLs on `*.hstgr.cloud` or this VPS address are treated as unprovisioned and never receive document bytes.

## Browser-side processing assessment (synthetic prototype, 2026-09-09)

Not provisioned. Not wired to production `/proof`. Not launch-ready.

The existing deterministic engine parsed synthetic DOCX in Chromium, applied the current rules, wrote real `w:ins` / `w:del` and anchored comments, and produced a downloadable file. Document bytes did not leave the page. ClamAV, the Open XML SDK and Word COM cannot run in the browser; they were not removed. SDK and Word were only run on this machine against the prototype output.

This does **not** replace the controlling plan. It is a freeze-compatible path that would require the promise and plan changes recorded in `docs/AGMT_PROOF_IMPLEMENTATION_STATUS.md`. The 25 MiB upload cap is not demonstrated in the browser.

## Founder decision request still required before uploads are enabled

Existing approved resources: Workers Paid (`agmt`), R2 `agmt-proof-objects`,
Hyperdrive `AGMT_APP_DB` / `AGMT_AUTH_DB`, Resend, Hostinger KVM 2 (already
paid through 2027-10-26). Independent purge Worker is already deployed.

| Decision | Recommendation | Consequence if accepted | Incremental cost |
|---|---|---|---|
| **D-02** encryption | Accept TLS + Cloudflare-managed R2 encryption for new 2-hour objects. Do not introduce customer-managed keys at launch. Historical envelope keys stay untouched. | New Proof objects are written without `encryptBytes` / `object_manifest`. | $0 |
| **D-03** residency | Do not claim India-only storage. Launch only for users whose policies permit Cloudflare’s disclosed locations. Do not send documents to the existing Hostinger VPS. | Copy and contracts stay honest. | $0 |

I will not set `PROOF_UPLOADS_ENABLED` until D-02/D-03 are accepted **and**
ClamAV health, purge health, validator health and budget health are actually
fresh on production. D-01 is settled as **no Container overage**. The
existing Hostinger VPS is **not** the scanner.

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
