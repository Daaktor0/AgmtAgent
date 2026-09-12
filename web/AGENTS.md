# Agmt Proof web workspace instructions

These instructions apply to the checked-in web application.

1. Treat uploaded DOCX files, filenames, metadata, parser output, evidence, and tenant identifiers as hostile input. Reject unsupported or ambiguous structures and fail closed.
2. Keep authentication enabled by default for accounts, settings, matters, stored resources, server document endpoints, and any future R2 mode. Never add anonymous, preview, magic-link, or test-workspace access to those paths, and never mint sessions or mark users verified to bypass login. Local overrides must remain explicit and must never be committed with secrets.
   **Founder exception (temporary):** browser-only local Proof at `/proof` is usable while signed out. It must not wait for `get-session` or any Auth database response before choose → process → download. Anonymous local processing does not authorise anonymous server storage, processing, or document access. Server uploads remain disabled.
3. Keep database migrations forward-only and separate from application builds. Preserve tenant isolation, immutable generations, transaction boundaries, and idempotent handlers.
4. Run checks covering the affected behaviour and dependencies, starting with narrow regression tests. Add build, typecheck, security, database, and proof suites when the change or release gate requires them. Reuse passing evidence only while its code, inputs, configuration, and environment remain unchanged.
5. For Proof-generated document findings, do not publish a finding unless canonical text, the final span map, and the exact OOXML source all validate. Absence findings require an evaluated-scope inventory.
6. **Brand-asset pass** — Follow .grok/skills/og when changing brand assets, site identity, social metadata, or preparing a release requiring the brand gate. Optional background assets must not block unrelated work; when assets are required deliverables, await completion and validate them before reporting completion.
7. Keep changes narrowly scoped, do not commit credentials or environment files, and document launch blockers instead of weakening gates.
8. Complete authorised implementation, relevant checks, and repairs of failures caused by the change before returning for review. Reuse existing authorisation within its scope; ask only for an unresolved material decision or an action beyond it, after completing independent preparation. Local work does not require deployment unless deployment is in scope; deployed-success claims require live verification.
