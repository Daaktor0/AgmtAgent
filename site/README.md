# Agmt public website

The public website introduces Agmt as a broader legal-tech platform, with Proof
as the first product in development. It runs independently from `../web`.

## Design

“More room for judgment” is the organising idea. Warm paper, ink, vermilion
annotations and self-hosted Spectral / IBM Plex typography give the site an
editorial identity. The homepage moves from the platform idea to Proof, the
wider direction, then Agmt Dispatch. The document illustration is explicitly
synthetic and does not run proofreading. Day/night themes and reduced-motion
preferences are supported.

Existing routes remain: `/`, `/what` (the idea), `/how` (Proof), `/beta`
(Dispatch), `/legal`, and the existing `/admin`. Existing beta records and the
admin workflow are retained. Public pages no longer depend on seat-count reads.

## Run and verify

```sh
npm ci
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
```

The existing build applies migrations only when `DATABASE_URL` is configured.
Run tests without that variable: the signup integration suite deliberately
refuses a live database and uses ephemeral PGLite with the real migrations,
validators and SQL. It replaces only TanStack's HTTP transport for handler tests.

## Interest capture

Dispatch reuses `submitSignup` and the existing `reminder-only` lane. It records
name, email and explicit consent for beta and product-launch updates. It does
not book a seat. Email matching is case-insensitive. Existing seats and their
product preferences survive a Dispatch signup. A repeated request does not
create another contact.

This is a persisted interest list, not an automated email publication system.
The existing password-protected `/admin` view and CSV export are the operational
path. No email is sent by signup, no email service has been added, and no
publishing frequency or unsubscribe automation is claimed. Before sending
campaigns, use an appropriate mailing workflow with opt-out handling and keep
the list consistent with withdrawal requests.

## Production configuration

Keep Vercel Root Directory set to `site`. No changes to deployment configuration
are required by this redesign.

- `DATABASE_URL`: server-only persistent Postgres connection for this site's
  interest list. Production signup fails safely when absent; it never confirms
  a record held only in memory. Local development still uses ephemeral PGLite.
- `AGMT_ADMIN_PASSWORD`: a strong, server-only value is required. The existing
  admin implementation has a default password and no rate limiting. Its
  authentication was intentionally not changed in this site-only design task.
  Do not publish an unconfigured admin surface.

Do not prefix secrets with `VITE_`. Use a separate test database for preview
signup testing. Production environment values and live email delivery have not
been verified by the local integration suite.

No product application, product authentication, document processing, Cloudflare
configuration, or product deployment files are part of this change. Work stays
on `overhaul`; merging and production release are separate review decisions.
