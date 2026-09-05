# Agmt web — Slice 0

v1 launch surface. A verified user can create a Matter, upload a native DOCX,
confirm the canonicalisation map, and receive deterministic Proof. Review, Mail,
chat, redline and lineage are out of scope.

SPEC and schema: [`docs/SPEC.md`](docs/SPEC.md), [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md).
What landed: [`SLICE-0.md`](SLICE-0.md).

The Word add-in under `../addin` is legacy. It is not exposed by this app.

## Run

From this directory:

```
npm install
npm test          # includes src/lib/agmt/slice0.test.ts
npm run typecheck
npm run dev       # 0.0.0.0:8080
```

Create an account or sign in with email and password. Resend sends the email
verification link; a verified address is required before document access. Load
the sample SHA or upload a `.docx`. Confirm identifiers. Proof makes no model call.

## Stack

TanStack Start, React 19, Better Auth email/password with Resend verification,
Supabase Postgres via standard `pg` / PGLite, AES-256-GCM blobs, OOXML ingest.
The current sandbox uses Supabase only as managed Postgres; Supabase Auth and Storage are not used.

For persistent Postgres, configure `DATABASE_URL` and the server-only
`AGMT_DB_ROLE` (`agmt_app` for the web process). Deployed Better Auth must
use a separate `BETTER_AUTH_DATABASE_URL` or `AUTH_DATABASE_URL`; never reuse
the application login or accept tenant/role values from the browser. The
migration creates non-login runtime group roles only; operators provision
least-privilege login memberships outside the repository.

For production email verification, add the Worker secret `RESEND_API_KEY` and
the variable `AUTH_EMAIL_FROM` using a sender domain verified in Resend (for
example, `Agmt <auth@your-domain.example>`). If `AUTH_EMAIL_FROM` is omitted,
the fallback `Agmt <onboarding@resend.dev>` is suitable only for Resend's test
recipient flow.


The new JOB-01/OBJ-01 plane keeps upload intents, leases and outbox state in
Supabase Postgres while document bytes use a server-only object-store boundary.
`object_manifest` stores metadata and integrity/envelope fields, never document
bytes; `object_blob` is legacy and is not rewritten by the additive migration.
`AGMT_OBJECT_STORE=memory` is restricted to local synthetic tests. A deployed
runtime fails closed until an explicitly installed S3 adapter and the later
malware/worker gates are approved.
