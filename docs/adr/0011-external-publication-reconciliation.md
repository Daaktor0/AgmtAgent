# ADR 0011: Reconcile external object publications after transaction failure

- Status: Accepted for repository implementation; production rehearsal pending
- Date: 2026-08-30
- Package: FND-02
- Depends on: ADR 0003, ADR 0007

## Context

The document upload path performs CPU/parser work before the relational transaction, writes encrypted bytes through the server-only object-store boundary, and publishes the relational document/version/map/capability/audit rows in one transaction. Provider writes cannot participate in the Postgres transaction. A later relational failure can therefore leave provider bytes after a database rollback.

A commit or rollback transport failure is also ambiguous: the database may have committed even when the client reports an error. Destructive compensation based only on an application-generated ID could delete a valid committed publication.

## Decision

1. The transaction adapter reports not_started, rolled_back, or unknown outcomes and identifies the failing phase. A commit failure or failed rollback is always unknown.
2. putBlob returns an immutable publication artifact containing tenant, owner, object key, provider/storage key, plaintext and ciphertext digests/sizes, content type, and envelope metadata. If manifest insertion fails after the provider write, the error carries that artifact without exposing bytes.
3. On a confirmed rollback, the upload path records an idempotent staged object manifest and then verifies the exact ciphertext digest/size before deleting provider bytes. A provider or database failure leaves the staged record for a later reconciler.
4. On an unknown outcome, the upload path is record-only. It never deletes provider bytes or relational rows. The record operation rejects tenant, owner, key, provider, storage-key, state, envelope, or integrity mismatches.
5. The existing object_manifest staged state is the durable repository-side handoff. A later worker/reconciler package must scan unreferenced or ambiguous staged manifests and apply the reviewed lifecycle policy.
6. This batch makes no schema or external-service change. A future migration is required only if the production reconciler needs additional durable reason/lease fields; that migration must remain additive and separately rehearsed.

## Consequences

- Confirmed callback failures do not leak an object merely because the relational transaction rolled back.
- Ambiguous commit outcomes fail closed and may temporarily retain an object until reconciliation, which is safer than deleting a potentially committed document.
- Exact object integrity is checked before deletion; corrupted or mismatched bytes are not deleted by this path.
- The current repository does not claim live S3, queue, worker isolation, or managed-Supabase fault-rehearsal completion.

## Verification

- Web Proof workflow 33339154677 passed: build/route generation, typecheck, transaction hardening tests, production build, Proof golden corpus, and full web suite.
- Full web test run: 111/111 passed, 0 failed.
- Eval workflow 33339154680 passed.
- Regression coverage includes confirmed rollback, commit transport uncertainty, record-before-delete ordering, provider cleanup failure, record-only unknown outcomes, exact-delete fallback, and unresolved dual failure.
