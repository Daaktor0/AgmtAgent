# Agmt web workspace instructions

These instructions apply to the checked-in web application: **Execute by Agmt**,
served at `app.agmt.legal/`.

1. **Documents never leave the user's device.** Execute is browser-only:
   agreements, signed returns and stamp papers are read (pdf.js, and local OCR
   served from `/execute-ocr/`), sorted, assembled and optionally kept in the
   user's own browser storage. They are never sent to Agmt. The page runs under
   `src/lib/execute/csp.ts`: no third-party script and no outside connection.
   The only server endpoints are `/api/execute/feedback`,
   `/api/execute/access-request` and `/api/execute/decide`, which accept short
   text fields and never documents. Never add a server upload.
2. **Access.** During the closed beta (`AGMT_EXECUTE_ACCESS=invite`) the page
   opens only for a signed-in account whose verified email the founder has
   approved (`src/lib/execute/access-store.ts`, KV `AGMT_ACCESS`); that check
   gates the page only, once, when it loads. In public mode the session is
   never consulted. Once the page is open it must not wait for `get-session`
   or any Auth database response before choose → process → download. Never add
   anonymous, preview, magic-link or test access to accounts, never mint
   sessions or mark users verified to bypass sign-in, and never commit secrets
   or environment files.
3. **Signature pages** come from the agreement itself, or Execute makes them
   (from the parties clause and any schedule it points to, or from the
   lawyer's own PDF template); signed returns are then appended after the
   schedules. Pages Execute makes carry no Agmt name or mark, visible or in PDF
   metadata; their footer never states a date, because execution dates move;
   and a template's sample name is removed from the page's text
   (`src/lib/execute/pdf-content.ts`), never only painted over.
4. **Database.** Execute keeps its data in the browser; the server database
   holds accounts only. Keep migrations forward-only and separate from
   application builds, and never edit an applied migration.
5. Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run
   build:cloudflare` and the Execute journeys (`execute:journey`,
   `execute:make-journey`, `execute:access-journey`) against a running app
   before reporting a change complete.
6. Keep changes narrowly scoped and document launch blockers instead of
   weakening a gate.
