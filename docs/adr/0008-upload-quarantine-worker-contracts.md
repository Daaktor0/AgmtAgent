# ADR 0008: upload, quarantine and worker contract boundaries

- **Status:** Accepted for repository implementation and synthetic regression coverage; live S3, malware, queue, worker, IAM and image review pending
- **Date:** 30 August 2026
- **Decision owners:** Product/engineering owner and implementation agent
- **Packages:** OBJ-02, OBJ-03, WRK-01

## Context

The durable job and metadata-only object planes are now present, but the repository previously had no explicit contract for the bounded upload grant, the malware result gate or the message accepted by an isolated ingest worker. The blueprint requires document bytes to bypass the web runtime, quarantined objects to remain inaccessible until an authoritative clean result, and worker retries to converge without accepting document content or provider credentials in queue messages.

## Decision

- `direct-upload.ts` defines a server-derived upload plan for supported DOCX files only. It bounds the payload to the configured 25 MiB cap, requires a SHA-256 digest, derives the opaque object identity and tenant-hashed quarantine key server-side, and limits grant expiry to 15 minutes. Ownership is checked against the authenticated tenant, owner and Matter tuple.
- A provider gateway is an injected server boundary for multipart creation, part presigning, completion, abort and metadata inspection. The public grant contains only the opaque quarantine key/object key, provider upload identifier, expected hash/size and short-lived HTTPS part URLs. Completion accepts only the exact expected key, SHA-256 and byte size. No AWS SDK, credentials, bucket, KMS key or live provider is configured by this ADR.
- `malware-gate.ts` accepts exactly the authoritative clean result `NO_THREATS_FOUND`. Threats, failures, unsupported results, unknown values and malformed provider/event identities are rejected and cannot enqueue ingest. Repeated delivery of the same provider event and outcome is idempotent; a conflicting duplicate fails closed.
- `worker-contract.ts` defines a versioned, strict metadata-only `worker-v1` envelope capped at 64 KiB. Unknown fields, document bytes, presigned URLs, invalid identities, invalid attempts and malformed object keys are rejected. Duplicate success is acknowledged, fatal outcomes go to the dead-letter path, and crash/timeout outcomes retry only within the bounded attempt budget before dead-lettering.

## Security and privacy consequences

- Client input cannot select a tenant, owner, Matter, storage prefix, expiry or completion digest. Raw tenant identifiers are not exposed in the public storage key.
- The quarantine and worker contracts fail closed when a capability, provider result or identity is missing or ambiguous. They intentionally do not infer clean status, fabricate evidence anchors or fall back to web-runtime byte handling.
- These are contract and test boundaries, not a production claim. Live bucket policy, SSE-KMS, GuardDuty/EventBridge authenticity, SQS/DLQ delivery, Lambda isolation, egress controls, image scanning and restricted IAM still require an approved AWS stage setup and security review.

## Verification

At implementation code head `b34872c88093e20dcfafd9dd922e392b863b08fc`, the Web Proof corpus passed with 99/99 full-suite tests in workflow `33336709469`, and Eval checks passed in workflow `33336709477`. The tests cover expiry, size/type/name/digest bounds, tenant ownership, exact multipart grants, completion integrity, clean-only malware gating, duplicate/conflicting events, strict worker fields, metadata-only messages and bounded retry dispositions.

No migration, Supabase schema change, AWS resource, production database, live authentication provider or external service was changed for this ADR.

## Rollback and stop conditions

- Roll back by stopping the affected repository artifact and shipping a reviewed forward-fix; there is no destructive down migration and no historical ciphertext operation.
- Stop before wiring a live provider when external credentials or service authority are required.
- Stop if an upload, malware event or worker message cannot be bound to one tenant and Matter, or if a provider reports anything other than the exact clean result.
- Do not place confidential documents in the local memory provider or the Supabase sandbox.
