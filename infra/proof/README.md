# Temporary Proof storage plan (T07 draft)

This is a reviewable, no-credentials plan. It is not an apply plan and does not authorize AWS, Vercel, or database spending. The local `S3ObjectStore` boundary remains the only executable adapter until the provider client and IAM policy are reviewed and tested in a synthetic account.

## Resources per environment

- `agmt-proof-quarantine-<environment>`: private, nonversioned S3 bucket for the original DOCX only; Block Public Access, bucket-owner-enforced ownership, TLS-only bucket policy, SSE-KMS with a dedicated key, no replication, Object Lock, backup or durable archive.
- `agmt-proof-temporary-<environment>`: same controls for analysis JSON, export plans and marked DOCX. Every key contains only an opaque run/object id and upload-time bucket; the source filename is never a key or object metadata value.
- A dedicated KMS key per environment with rotation enabled and grants limited to the scan/worker roles and the storage broker. No application or browser KMS permission.
- A private queue and dead-letter queue per environment for scan-control, processing and purge work. Messages contain run/artifact identifiers and versions only; content stays in S3 or bounded worker memory.

## IAM and adapter boundary

The eventual provider client must implement the existing `S3ObjectClient` interface and add the purge operations (`list`, exact `head`, exact `delete`, and multipart `abort`). The broker/IAM boundary must enforce:

- quarantine role: `PutObject`/`AbortMultipartUpload` only under the quarantine prefix, with the server-issued run deadline;
- scan role: `GetObject`/`HeadObject` only for the exact quarantine object and `PutObject` only for the temporary prefix;
- worker role: exact-run `GetObject`, `PutObject`, `HeadObject`, and `AbortMultipartUpload`, denied after `processingDeadline`;
- purge role: list by the time-bucket prefix, head before delete, delete and multipart abort only; no read or write of content;
- no public access, ACLs, wildcard object resources, browser credentials, or permanent credentials in worker/parser environments.

The client must verify the full assembled SHA-256 and byte size after multipart completion. ETags are not treated as a whole-file SHA-256. Every delete is idempotent and every read rechecks the relational manifest digest/size through `object-store.ts`.

## Configuration contract (names only)

`AGMT_OBJECT_STORE=s3` is server-only. Each environment supplies bucket names, AWS region, KMS key ARN, queue URLs and role/broker identifiers through deployment secret configuration; no value belongs in source, Terraform variables committed to git, logs, URLs or object metadata. Local/PGlite uses `AGMT_OBJECT_STORE=memory` with synthetic bytes only.

The application must fail closed if any bucket, KMS, queue, role or checksum configuration is absent. Uploads remain disabled until the concrete client, permissions, multipart completion and delete/list/abort tests pass in a synthetic account.

## Cost and spending controls

Planning allowance is approximately **$70–150/month** for a small beta, excluding taxes, unusual usage and duplicate environments. This is not a quote. Before any apply, record current provider prices, set an operator-owned budget alarm, cap upload size at 25 MiB, cap concurrent runs and multipart parts, and set a separate environment budget. Billing alerts are not a deletion control and do not authorize spending.

## Required evidence before T07 completion

1. Current AWS/S3/KMS/SQS API and pricing documentation captured for the chosen region.
2. Synthetic adapter tests for put/get/head/list/delete, multipart checksum semantics, immutable completion, exact-prefix permissions, no public access and idempotent abort.
3. Reviewed Terraform plan with remote locked state and no secret values.
4. A synthetic bucket/queue permission rehearsal; no production documents.

Until those items exist, T07 is intentionally **plan drafted / provider verification pending**.
