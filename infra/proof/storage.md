# Temporary Proof R2 storage (PWC-17)

This is a no-secret, no-apply description of the new Proof object lane. It does
not authorize Cloudflare spending, bucket creation, or production binding
changes. Historical `object-store.ts` / envelope encryption remains for draining
existing runs and is not reused as a content path for new uploads.

## Intended resources (names only)

Per environment (`staging` then `production` after later authorization):

- `agmt-proof-quarantine-<env>`: private R2 bucket for original DOCX source.
- `agmt-proof-temporary-<env>`: private R2 bucket for marked DOCX and optional
  short-lived analysis objects.

Both buckets: public access off, no replication, no object lock/archive copy,
no R2 FUSE mount, no content backups. Exact millisecond deadline lives in
non-content custom metadata; the key prefix minute is only a conservative list
partition.

## Key contract

`proof/v2/<UTC-expiry-minute>/<128-bit-run-token>/<generation>/<attempt>/<kind>-<random-id>`

- No user, firm, filename or tenant text in the key.
- Run token is not a bearer credential.
- Source objects use the quarantine bucket; outputs use temporary.
- Writes are reserved in metadata first (PWC-18) and are immutable.

## Encryption and residency (explicit, unresolved founder gates)

New temporary objects use **TLS in transit** and **Cloudflare-managed R2
encryption at rest**. This adapter does not call `encryptBytes` and does not
write `object_manifest` content rows.

- **D-02 (open):** founder confirmation that launch customers do not require
  app-managed or customer-managed key separation. Until that decision, this
  code is prepared but not provisioned.
- **D-03 (open):** no India-only residency claim. Mumbai database location and
  R2 location hints are not evidence that every byte remains in India.

Historical envelope keys are left untouched. No re-encryption of old objects.

## Adapter boundary

`web/src/lib/server/proof-objects.ts` exposes reserve / write / HEAD / list /
delete / multipart abort. A memory bucket exists for local contract tests and
is rejected in `mode: "deployed"`. Live staging put/read/delete/HEAD/list/
multipart abort under restricted identities is **not Verified** in this task.

Broker identities (later provisioning):

- upload/broker: put/abort under the reserved prefix only
- compute: exact-key get/put/head/abort
- purge: list/delete/abort only; no content read

`infra/proof/wrangler-broker.jsonc` is a placeholder Worker config with binding
names only. Bucket IDs, API tokens and account secrets are deployment outputs.

## What this task does not do

- Create or bind production/staging buckets
- Spend D-01 budget
- Enable `PROOF_UPLOADS_ENABLED`
- Apply database migrations
- Replace the draining legacy adapter
