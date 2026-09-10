# Agmt Proof web workspace instructions

These instructions apply to the checked-in web application.

1. Treat uploaded DOCX files, filenames, metadata, parser output, evidence, and tenant identifiers as hostile input. Reject unsupported or ambiguous structures and fail closed.
2. Keep authentication enabled by default for accounts, settings, matters, stored resources, server document endpoints, and any future R2 mode. Never add anonymous, preview, magic-link, or test-workspace access to those paths, and never mint sessions or mark users verified to bypass login. Local overrides must remain explicit and must never be committed with secrets.
   **Founder exception (temporary):** browser-only local Proof at `/proof` is usable while signed out. It must not wait for `get-session` or any Auth database response before choose → process → download. Anonymous local processing does not authorise anonymous server storage, processing, or document access. Server uploads remain disabled.
3. Keep database migrations forward-only and separate from application builds. Preserve tenant isolation, immutable generations, transaction boundaries, and idempotent handlers.
4. Run the narrow regression tests for each change and the relevant build, typecheck, security, database, and proof suites before reporting a package complete.
5. Do not publish a finding unless canonical text, the final span map, and the exact OOXML source all validate. Absence findings require an evaluated-scope inventory.
6. **Brand-asset pass** — Follow the Open Graph skill under .grok/skills/og and verify the filesystem contract before reporting completion. The marker is /workspace/.grok/og-pending and expires after 10 minutes. The foreground path is not allowed to block on the background task: never wait_tasks for it and never get_task_output from it.
7. Keep changes narrowly scoped, do not commit credentials or environment files, and document launch blockers instead of weakening gates.
