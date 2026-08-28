# Agmt Slice 0

Counsel-grade Proof for a native DOCX. Review, Mail, redline, chat and lineage are out of scope.

## What landed

- Google sign-in via the platform broker, plus a hashed 15-minute single-use email magic link. Verify mints a Better Auth session (signed cookie + preview bearer).
- Per-user Matters with a versioned mandate chip.
- Native `.docx` ingest, 25 MiB / 80-page refuse-not-truncate gates, checksum idempotency.
- Provision tree (every non-blank line has one text-owning leaf), namespaced definitions, source-quality banner.
- Canonicalisation map: legal-name → defined term; Indian identifier placeholders; user confirm/correct/not_identifier.
- Encrypted original blob + canonical projection (AES-256-GCM envelope).
- Deterministic Proof: twelve v1 checks, server-filled quotes, explicit suppressions, deal map, signature inventory.
- Disabled “Run Review — next slice” with the route-gate reason. No model call on the Proof path.
- SPA detection banners “Review unsupported in v1.”

## DATA-MODEL tables (Slice 0)

`user_account`, `magic_link_token`, `review_entitlement`, `credit_event`, `matter`, `mandate_version`, `document`, `document_version`, `object_blob`, `canonicalisation_map`, `canonicalisation_entry`, `canonical_projection`, `span_map_segment`, `provision`, `definition`, `definition_use`, `deal_map_entry`, `source_capability`, `proof_run`, `proof_check_execution`, `proof_hit`, `proof_feedback_ticket`, `audit_event`, `deletion_job`, `app_config`.

Identity cookies live in Better Auth’s `"user"` / `"session"` / `"account"` tables (sandbox contract). Application tenancy is `owner_user_id` on every Matter-owned row.

Not created: Review-run, catalogue, Mail, export, lineage.

## How to use

1. Sign in with Google, or request an email link (preview shows the one-time URL because mail cannot be delivered here).
2. Create a Matter. Default mandate SHA / Company / signing is fine.
3. Upload a `.docx`, or load the sample SHA.
4. Confirm the canonicalisation map (accept identifiers).
5. Read Proof hits, deal map, outline, coverage. Quotes are sliced from the stored projection.

## Founder-closed OPENs

- File cap 25 MiB.
- Digest model: not in Slice 0.
- SPA: detect and banner, no Review.
- Retention: revoke immediately; purge after 30 days; inactivity 12 months + 14-day notice (`app_config` / `src/lib/agmt/config.ts`).
- Lineage similarity: not in Slice 0.

## Explicitly unfinished

- Slice 1 corpus runner (12–13 labelled agreements in CI).
- Slice 2 polish on index quality weights vs a golden set.
- Slices 3–6 (Review, exports, Mail, v2 lineage).
- Production wrapping keys in KMS (preview uses a process-derived wrap key).
- SMTP delivery of magic-link mail (template and hash path are implemented).
- Proof-only PDF / Docling fallback (PDF is refused with the native-DOCX message).
