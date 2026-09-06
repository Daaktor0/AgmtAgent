# Overhaul review

Branch: `overhaul`, based on main `a406743ba14c5ddc43ce5ae8c0afb5613ddf8a45`.
Scope: `site/` only. No merge or production release performed.

## Direction

“More room for judgment.” An editorial identity built from paper, ink, annotation
and generous typography. Agmt is the broader platform; Proof is the first product
in development. Agmt Dispatch invites interest in product progress without
promising availability or a publication schedule.

## Verification

- Production build and TypeScript checks pass.
- Lint: zero errors; one existing unused-disable warning in
  `src/lib/auth/use-current-user.ts`, which this change does not modify.
- Five new signup integration tests pass against real migrations and SQL in
  isolated PGLite: persistence and case-insensitive deduplication, preservation
  of existing beta preferences/seats, invalid input, missing production database,
  and unavailable database.
- Full script suite: 185 passed, 15 failed. The unchanged main baseline has the
  same 15 failures (180 passed). These are existing template/environment
  expectations, including absent Grok/AGENTS fixtures and generic metadata.
- Preview browser review covered the homepage, Proof and Dispatch pages, day
  and night themes, Proof markup toggle, required-field validation, anchor links,
  and responsive layouts at 320, 390, 768 and desktop widths.
- Native mobile navigation was verified open in the preview. It also works
  before hydration. Reduced-motion styles and visible keyboard focus are included.
- No application console errors were observed during the reviewed flows.
- Temporary responsive review scaffolding was removed from the final tree.

## Release configuration and limits

Verify `DATABASE_URL` and a strong `AGMT_ADMIN_PASSWORD` on the public-site
project before release; see README. Environment values were not inspected.
Signup persistence was tested locally, not by adding a contact to a live list.
Dispatch stores interest through the existing integration; it does not send
email. Campaign delivery and opt-out operations still require a mailing workflow.

The product application, authentication, Worker configuration, production
secrets and product deployment logic remain unchanged.
