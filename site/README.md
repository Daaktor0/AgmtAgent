# Agmt — marketing site

The public site for Agmt: what the product is, what it refuses to do, and the
beta list. It takes an email and assigns a beta seat. That is all it does.

It is not the product. `../web` is the product app (matters, upload, Proof);
`../agent` is the review engine. This directory shares nothing with either —
no database, no auth, no imports. It is a separate deployment that happens to
live in the same repository.

## Run it

From this directory:

```sh
npm install
npm run dev        # 0.0.0.0:8080
```

Note both apps default to port 8080, so run one at a time or pass `--port`.

No `.env` is needed locally. With no `DATABASE_URL` the app runs on an
embedded Postgres (PGLite) held in memory, so **the list empties when the dev
server restarts**. That is the right behaviour for a preview and the wrong one
for anything real: set `DATABASE_URL` and the same schema is applied to it.

```sh
npm run typecheck
npm run lint
npm run build      # also applies migrations when DATABASE_URL is set
```

## Environment

| Variable              | Purpose                                            |
| --------------------- | -------------------------------------------------- |
| `DATABASE_URL`        | Postgres. Unset → in-memory PGLite, which forgets. |
| `AGMT_ADMIN_PASSWORD` | Password for `/admin`.                             |

Neither may be prefixed `VITE_` — that would ship them to the browser.

**The admin password falls back to `agmt-beta-admin` when the variable is
unset.** That is fine for a local preview and unacceptable anywhere public.
Set the variable before this site is reachable. `/admin` is `noindex` and has
no rate limiting: it is a password on a door, not a security system.

## The 30 / 20 rule

Fifty seats.

- **Thirty open, first come.** The form writes `seat-fcfs` with a seat number
  in 1..30 while fewer than thirty are held. On screen: `Seat N of 30 held.`
- **Twenty reserved.** Only an admin can fill one, by allotting a `waitlist`
  row from `/admin`. The public form cannot reach them.
- **After the thirty are gone**, a seat request becomes `waitlist`, and says
  so: `You're on the waitlist. 30 open seats are taken. 20 are reserved for
manual allotment.`
- **Remind me** writes `reminder-only` and holds nothing. That path never
  tells anyone they are in. Someone who left an email and later asks for a
  seat is promoted if one is left.
- **One email is one row.** A second submit from the same address returns the
  standing they already have; it never takes a second seat. An optional field
  left blank means "no change", so a firm given once is not wiped later.

Both numbers live in `src/brand/tokens.ts` **and** in the check constraints in
`migrations/0002_waitlist.sql`, as corrected by `0003` — the original pair
evaluated to `NULL` for a first-come row carrying no seat number, and a CHECK
only rejects on `FALSE`, so that row was let through. The database is the backstop: the seat count
and the insert happen in one statement, and unique indexes on `fcfs_seat` and
`reserved_seat` settle any race. Changing a number means changing both.

## Layout

```
src/brand/          tokens, wordmark, and every claim the site makes (copy.ts)
src/components/site/ frame, seat form, seat meter, flow diagram
src/routes/         index, what, how, beta, legal, admin
src/lib/waitlist.ts server functions: signup, counts, admin
migrations/         the schema
public/fonts/       self-hosted type
```

`src/brand/copy.ts` is deliberate: every factual claim sits in one file, so
adding a claim is a visible edit. The house rule is written at the top of it —
if a fact is not already there, it does not go on the site. No metrics, no
customer names, no certifications, no pricing, no model names.

## Assets

Type is self-hosted in `public/fonts` — Spectral, IBM Plex Sans and IBM Plex
Mono, all SIL OFL, latin and latin-ext only. Nothing is fetched from a font
CDN, so no visitor request leaves for one and the page sets the same on a firm
network that blocks it. `fonts.css` is generated; regenerate it if the weights
change.

`public/og.png` is the share card and `public/favicon.svg` the tab icon, both
the word Agmt on paper. The share meta is in `src/routes/__root.tsx`, and its
`og:image` is site-relative — make it absolute once there is a domain.

## Deploying

Vercel, with **Root Directory set to `site`** — otherwise the build runs at the
repository root and finds the Cloudflare worker instead. `vercel.json` here
supplies the build and install commands; `npm run build` also applies the
migrations, so the schema creates itself on the first deploy.

Set `DATABASE_URL` and `AGMT_ADMIN_PASSWORD` in the Vercel project. Give the
site its own database: a waitlist of names and work emails has no business
sharing a store with the review engine.

Nothing here touches `agent/`, `server/`, `addin/` or `web/`, and none of the
repository's workflows read this directory — the Dockerfile copies only the
Python service and the add-in, and the eval checks are Python. Adding this
directory cannot break the product build.

`src/brand` is the only part meant to be shared. The tokens carry no layout and
no copy, so `web` can import them when the two need to look like one product.

## Not here, on purpose

No blog, pricing page, changelog or careers page. No user accounts, Google
login or billing. No chat widget, cookie wall or newsletter popup. No
analytics. The site takes an email and tells the truth about what that gets
you.
