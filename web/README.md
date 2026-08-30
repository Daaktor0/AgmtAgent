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

Sign in with Google, or the hashed 15-minute email link. Load the sample SHA or
upload a `.docx`. Confirm identifiers. Proof makes no model call.

## Stack

TanStack Start, React 19, Better Auth (Google via Grok broker + product-layer
magic link), Supabase Postgres via standard `pg` / PGLite, AES-256-GCM blobs, OOXML ingest.
The current sandbox uses Supabase only as managed Postgres; Supabase Auth and Storage are not used.
