# agmt.legal

The company website: who Agmt is, what it makes, and what it writes. Execute is
the first product in the products index; the blog lives at `/blog`.

TanStack Start, React 19, Vite, Tailwind 4 and Nitro, deployed on **Vercel**
(project root directory: `site`). The Execute app itself is in `../web` and
deploys separately to Cloudflare.

---

## Writing for the blog

Posts are written in a browser editor at **agmt.legal/write**. It saves them to
this repository, so there's no extra account or service. You never need to touch
code.

### Set up once (about five minutes)

1. On GitHub, open **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**
   (github.com/settings/personal-access-tokens/new).
2. Name it `Agmt blog` and pick an expiry (a year is sensible; GitHub reminds
   you before it runs out).
3. Under **Repository access**, choose **Only select repositories** and pick
   `Daaktor0/AgmtAgent`.
4. Under **Repository permissions**, set **Contents** to *Read and write* and
   **Pull requests** to *Read and write*. Leave everything else as it is.
5. Generate the token and copy it.
6. Open agmt.legal/write, choose **Sign In with Token**, and paste it. Your
   browser remembers it; do the same once on any other computer you write on.

Treat the token like a password. If it leaks, delete it on the same GitHub page
and make a new one.

### Write and publish

1. **New post.** Fill in the title, a one- or two-sentence summary, the date,
   and a few topics. Drag in a cover image if you have one: photos are
   converted to WebP and resized as they upload. Without a cover, the post gets a
   title card when it's shared.
2. **Write.** Use the toolbar for headings, lists, quotes, links and images. The
   preview beside the editor uses the site's own article styles.
3. **Save.** The post is now a **draft**. It isn't on agmt.legal, in the RSS
   feed or in the sitemap. Each draft has its own preview deployment: open the
   draft's pull request on GitHub (Pull requests tab) and follow the Vercel link
   to see it on a real copy of the site, marked "Draft".
4. **Publish.** When it's ready, set the status to **Ready** and choose
   **Publish**. The post is live about two minutes later, once Vercel has built
   the site.

To edit a published post, open it, change it, save, and publish again. To take
one down without deleting it, turn on **Hide from the site** and publish.

The post's web address is made from its title the first time you save, and
doesn't change after that, so links to it keep working.

### Two drafts are waiting

`content/blog/` has two posts written from Execute's documented behaviour, both
hidden: *What an executed copy is, and why every party needs one* and *Why
Execute runs in your browser*. To publish one, open it, turn off **Hide from
the site**, set the date, and publish. Edit them as much as you like first.

### Writing by hand

Every post is a Markdown file in `content/blog/`, named for its address
(`executed-copies.md` is `/blog/executed-copies`), with a header like this:

```yaml
---
title: What an executed copy is, and why every party needs one
date: 2026-09-26
author: Agmt
summary: One or two sentences for the blog index, search results and link previews.
tags:
  - Execution
cover: /blog/media/pages.webp   # optional
coverAlt: Signed pages sorted into piles   # describe the image
draft: true                     # true = hidden from the live site
---
```

Images go in `public/blog/media/`. A build fails, with a message naming the
file, if a post is missing its title or date, so a broken post never reaches the
live site.

---

## Develop

```sh
npm ci
npm run dev          # http://localhost:8080, drafts shown
npm test             # blog, admin and migration tests
npm run typecheck
npm run lint
npm run build        # social cards, prerender, migrations (skipped without DATABASE_URL)
npm run check:output # checks the build: metadata, cards, feed, redirects, retired names
npm run preview      # serve the build on http://127.0.0.1:8081
npm run test:e2e     # every page at three widths, light and dark, in Chromium
```

`VERCEL_ENV=preview npm run build` builds with drafts shown, as a Vercel preview
does. `AGMT_SHOW_DRAFTS=1` or `0` overrides either way.

### Where things are

| Path | What |
|---|---|
| `src/routes/` | Pages. `index`, `products/`, `blog/`, `about`, `contact`, `privacy`, `terms`, `admin`, plus `blog/rss[.]xml.ts` and `sitemap[.]xml.ts`. |
| `src/lib/products.ts` | The products index. |
| `src/lib/blog/` | Reading posts (`parse.js`, shared with the build scripts) and serving them to pages. |
| `src/lib/site.ts`, `seo.ts` | Site facts and per-page metadata and social cards. |
| `src/styles.css` | Colour and type tokens (light and dark), components, article typography. |
| `src/components/` | Header and footer, the home page's signing set, product index, screenshots, legal documents. |
| `content/blog/` | Posts. |
| `public/write/` | The blog editor (Sveltia CMS, pinned) and its settings. |
| `public/products/execute/` | Screenshots of Execute's built-in sample (fictional parties). |
| `scripts/og.mjs` | Draws social cards into `public/og/` at every build. |
| `scripts/brand-assets.mjs` | Redraws the favicons and touch icon (run by hand). |

### Adding a product

1. Add an entry to `src/lib/products.ts` (it becomes the next tab in the index).
2. Add its page at `src/routes/products/<name>.tsx`, and its address to
   `PAGES` in `src/routes/sitemap[.]xml.ts` and to the footer in
   `src/components/layout.tsx`.
3. Give it a social card in `scripts/og/render.mjs` and `scripts/og.mjs`.
4. Every claim on a product page comes from that product's own documentation.

---

## Deploys

Vercel builds `site/` on every push: `main` is production (agmt.legal), every
other branch gets a preview link. Commits that don't touch `site/` are skipped
(`ignoreCommand` in `vercel.json`). The Execute app's GitHub deploy
(`.github/workflows/deploy-cloudflare.yml`) runs only for changes to the app.
Cloudflare's own Git integration (Workers Builds) also builds the `agmt` Worker
on every push; to limit it to app changes, set its build watch paths in the
Cloudflare dashboard (Workers & Pages → agmt → Settings → Build) to `web/*`,
`src/*`, `wrangler.jsonc` and `package*.json`. `.github/workflows/site-checks.yml`
runs lint, tests, both builds, the output check and the browser pass on every
change to `site/`.

Old addresses (`/what`, `/how`, `/beta`, `/builders`, `/trust`, `/legal`, and
the retired product pages) redirect permanently; the list and the security
headers are in `vite.config.ts`.

### Environment variables (Vercel, server-only)

| Name | Needed for |
|---|---|
| `DATABASE_URL` | `/admin`, which reads the sign-up lists. Without it, `/admin` can't load them. |
| `AGMT_ADMIN_PASSWORD` | `/admin`. There is no default: without it, `/admin` stays shut. |

Never prefix a secret with `VITE_`; those are sent to browsers.

---

## Sign-up data and `/admin`

Earlier versions of the site collected two lists into Postgres: `waitlist`
(product updates) and `builder_interest` (legal-tech builders). Both forms are
retired, and nothing on the site writes to either table. `/admin` shows both,
read-only, with CSV export of every column.

`migrations/` is forward-only and applied at build time. Never edit an applied
migration, and never drop these tables: they hold real people's details.
