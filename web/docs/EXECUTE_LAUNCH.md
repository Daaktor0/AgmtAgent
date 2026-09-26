# Executed copies: launch runbook

`app.agmt.legal/` is **Execute**: signature pages out, countersigned pages and
stamp papers in, one complete executed copy per party. It is Agmt's only
product.

## How it works, in one paragraph

Everything happens in the user's browser. Final agreements (PDF) are read with
pdf.js. Signature pages come one of three ways, chosen per document:

- **In this agreement:** unsigned signature pages found in the PDF by text
  rules (`detect.ts`); signed returns replace them in place.
- **Make from the parties:** the parties clause is read (`parties.ts`),
  following "the persons listed in Part A of Schedule 1" into that schedule's
  table; the lawyer confirms the list and each party's block wording, and Agmt
  makes one page per party (`generate.ts`) with an optional footer that names
  the agreement and parties but never a date.
- **Use my template:** the lawyer's own signature page as a PDF; Agmt copies it
  per party and replaces only the sample name, in the same place and style. The
  sample name is removed from the page's text (`pdf-content.ts`), not just
  painted over.

Pages Agmt makes are stored as their own PDF and counted after the agreement's
last page, so signed returns go at the end of each executed copy, after the
schedules. No Agmt name or mark is on any page, visible or in its metadata. Returned files are sorted by what they say:
PDF text, or local OCR (Tesseract, served from `/execute-ocr/`) for scans and
phone photos, matched against the signature pages and e-stamp certificate fields
(`classify.ts`, `estamp.ts`). Checks flag missing returns, a stamp paper in
another party's name, a certificate used twice, and a returned page that doesn't
read like the final (`checks.ts`). Copies are assembled with pdf-lib
(`render.ts`) and zipped with a closing index (`index-pdf.ts`). Signings are kept
in the browser's IndexedDB on that computer only (`browser/store.ts`). No
document, file name or page text is ever sent to Agmt.

## Configure the Worker (once)

Set these on the `agmt` Worker. The root `wrangler.jsonc` (used by
Cloudflare's own build) carries the plain variables, so change them there;
secrets live only in the dashboard (Settings, Variables and Secrets) and
survive deploys.

| Name | Kind | Value |
|---|---|---|
| `AGMT_EXECUTE_ACCESS` | variable | `invite` for the closed beta, `public` (or unset) to open it to everyone |
| `AGMT_INVITE_SECRET` | **secret** | 48+ random characters (`openssl rand -base64 48`). Signs the decision links in your emails. It never leaves Cloudflare; you don't need it on your computer. |
| `AGMT_FEEDBACK_TO` | variable | your address: access requests and feedback go here, and this account is always let in |
| `AGMT_ACCESS` | KV binding | the approved list; namespace `agmt-access`, already in both `wrangler.jsonc` files |

Email reuses the sign-in setup: `RESEND_API_KEY` (secret) and `AUTH_EMAIL_FROM`
(a sender on a domain verified in Resend, e.g. `Agmt <hello@agmt.legal>`).
Without a verified sender, Resend only delivers to its own account owner, so
nobody else gets email (not the thank-you, not the set-up link, not password
resets). Every access request is also written to Workers Logs as
`EXECUTE_ACCESS_REQUEST`, and every decision as `EXECUTE_ACCESS_DECISION`.

### Check the setup

Open `https://app.agmt.legal/api/execute/status`. It answers yes or no only,
never a value:

```json
{"accessMode":"invite","inviteSecretSet":true,"approvedListSet":true,"emailProviderSet":true,"verifiedSenderSet":true,"founderAddressSet":true}
```

Every `false` is a missing setting from the table above.

## How people get in (closed beta)

Access belongs to an account, not a link: someone is in when they're signed in
with a confirmed email that you've approved. Forwarding any email we send
doesn't let anyone else in.

1. **They ask.** At app.agmt.legal, "Ask for access". They get "Your request for
   Execute by Agmt"; the request goes on the approved list as waiting.
2. **You decide from your email.** "Access request: Name" has three
   buttons. Each opens a page on app.agmt.legal showing the request; nothing
   happens until you press the button there (mail scanners open links).
   - **Approve** sends "Set up your Execute account" with the set-up link. The page also
     shows that link to copy, if you'd rather send it yourself.
   - **Not yet** sends a short note that access can't be offered yet. The request stays; the same
     email's Approve button still works later.
   - **Decline** sends a polite note. Declining someone already approved ends
     their access.
   Pressing the same decision twice sends nothing more.
3. **They set up their account.** The set-up page has their email fixed; they
   choose a password (12+ characters), click the confirmation link we email,
   and the tool opens. After that they sign in at app.agmt.legal on any
   computer. "Forgot your password?" sends a one-hour reset link.

To invite someone who hasn't asked, send them to app.agmt.legal to ask, then
approve. If an approved person loses their email, they can simply ask again:
they're sent the set-up link again and you're not asked twice.

Your own account (`AGMT_FEEDBACK_TO`) is always let in: set it up at
`https://app.agmt.legal/join?email=<your address>`.

Invite links from the first week (`/invite/…`) now just open the app.

## Opening to everyone

Set `AGMT_EXECUTE_ACCESS` to `public`. The tool then opens for everyone
without signing in, and never waits on the sign-in database. Accounts and the
approved list stay as they are.

## After each deploy

```sh
curl -sI https://app.agmt.legal/ | grep -i content-security-policy   # must print the policy
curl -sI https://app.agmt.legal/execute-ocr/eng.traineddata.gz | head -1   # 200
```

In `public` mode, the full browser journey also runs against production:
`cd web && npm run execute:journey -- https://app.agmt.legal` (it uses the
built-in sample; nothing real is uploaded anywhere).

## Security note: the app template's platform tags (removed)

The template this app came from injected, into every HTML page, a web app
manifest named "Grok App" (so phones offered to "Install Grok App" on
app.agmt.legal), Apple home-screen tags, Grok project ids and the script
`https://grok.com/grok-app-builder/extensions.js`. All of it is gone:
`server/middleware/grok-pwa.ts` now adds only the share card (and strips those
tags from any page that still has them), `/__grok/*` answers 404, and the
Execute pages' policy also refuses any web manifest (`manifest-src 'none'`).
`npm run execute:journey` checks the page has no manifest and names no Grok.

## Known limits of this beta

- The final agreement must be a PDF. A scanned (image-only) final has no text,
  so signature pages must be marked by hand; returns are then matched by file
  name and choices in the "Needs you" list.
- OCR is English. Handwriting is not read; typed names and headings are.
- "Doesn't read like the final" catches the wrong page or document, not one
  changed word.
- iPhone HEIC photos can't be opened by Chrome or Edge; JPG and PDF work.
- Signings live in one browser on one computer. There is no sync or sharing
  yet; clearing site data removes them.
- Tested in Chromium. Safari and Firefox are not yet verified.
- No AI model is used. Small in-browser models (Chrome's built-in Gemini Nano,
  Qwen or Gemma through transformers.js) exist, but they are large downloads,
  depend on the browser and hardware, and can invent names. The rules and OCR
  here are deterministic and explainable; a model could later be an optional
  second opinion for the "Needs you" list only.

## Tests

- `npm run test:execute`: engine, sorting, checks, access decisions and
  emails, endpoints, policy header, and the two-document sample through pdf.js
  and pdf-lib.
- `node scripts/execute-screens.mjs [<url>] [<dir>]`: screenshots of every
  screen state (sample, needs-you, a duplicate certificate, 20 parties across
  3 documents, phone widths, the closing index) for design checks.
- `node scripts/brand-assets.mjs`: redraws the Execute and Agmt marks,
  favicons, email header image and social preview from the fonts in
  `public/fonts`.
- `npm run execute:journey [-- <url>]`: the whole flow in Chromium, including a
  photo read by local OCR, the zip opened and every copy's page count checked,
  reload persistence, phone width, feedback, the side panel by keyboard, the
  closing index set in the Execute typefaces, no request leaving Agmt, and
  zero unexpected policy violations. Needs a running app (`npm run dev`) or a URL.
- `npm run execute:make-journey [-- <url>]`: an agreement with no signature
  pages in Chromium: parties read from the clause and Schedule 1, pages made,
  the zip checked for names and for any Agmt mark, a PDF template with its
  sample name replaced and gone from the text, a reload, signed returns sorted,
  and each copy ending with the signed pages. Needs a running app.
- `npm run execute:access-journey`: the closed beta's account journey in
  Chromium: ask, approve, the set-up email, set up the account, confirm the email,
  sign out and in, forgot password, Not yet and Decline, a forwarded link, the
  owner. Needs `npm run dev` in invite mode with `AGMT_DEV_OUTBOX` set to a
  file, where email is written instead of sent (development only; ignored in
  the Worker and in production builds). The script's header has the command.
