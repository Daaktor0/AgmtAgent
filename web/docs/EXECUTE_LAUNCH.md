# Executed copies: launch runbook

`app.agmt.legal/` is now **Executed copies**: signature pages out, countersigned
pages and stamp papers in, one complete executed copy per party. It is the only
product in the header. Proof still works at `/proof` but is not linked.

## How it works, in one paragraph

Everything happens in the user's browser. Final agreements (PDF) are read with
pdf.js; signature pages and party names are found by text rules
(`src/lib/execute/detect.ts`). Returned files are sorted by what they say:
PDF text, or local OCR (Tesseract, served from `/execute-ocr/`) for scans and
phone photos, matched against the signature pages and e-stamp certificate fields
(`classify.ts`, `estamp.ts`). Checks flag missing returns, a stamp paper in
another party's name, a certificate used twice, and a returned page that doesn't
read like the final (`checks.ts`). Copies are assembled with pdf-lib
(`render.ts`) and zipped with a closing index (`index-pdf.ts`). Signings are kept
in the browser's IndexedDB on that computer only (`browser/store.ts`). No
document, file name or page text is ever sent to Agmt.

## Configure the Worker (once)

Set these on the `agmt` Worker (Cloudflare dashboard, Settings, Variables and
Secrets). The deploy uses `--keep-vars`, so values set there survive deploys.

| Name | Kind | Value |
|---|---|---|
| `AGMT_EXECUTE_ACCESS` | variable | `invite` for a closed beta, `public` (or unset) to open it |
| `AGMT_INVITE_SECRET` | **secret** | 48+ random characters: `openssl rand -base64 48` |
| `AGMT_INVITE_REVOKED` | variable | comma-separated invite ids to withdraw (optional) |
| `AGMT_FEEDBACK_TO` | variable | where feedback and access requests are emailed, e.g. your address |

Email reuses the sign-in setup: `RESEND_API_KEY` (secret) and `AUTH_EMAIL_FROM`
(a sender on a domain verified in Resend, e.g. `Agmt <hello@agmt.legal>`).

| Needed for | `RESEND_API_KEY` | `AUTH_EMAIL_FROM` (verified) | `AGMT_FEEDBACK_TO` |
|---|---|---|---|
| You get access requests and feedback | yes | recommended | yes |
| The requester gets a thank-you email | yes | **yes** | recommended (their replies reach you) |

Without a verified `AUTH_EMAIL_FROM`, Resend's test sender only delivers to the
Resend account owner, so the thank-you is not sent. Whatever the email setup,
every access request is also written to Workers Logs as
`EXECUTE_ACCESS_REQUEST` (name, email, firm, note), so none is lost.

### Check the setup

Open `https://app.agmt.legal/api/execute/status`. It answers yes or no only,
never a value:

```json
{"accessMode":"invite","inviteSecretSet":true,"emailProviderSet":true,"verifiedSenderSet":true,"founderAddressSet":true}
```

Every `false` is a missing Worker setting from the table above.

Invite mode without `AGMT_INVITE_SECRET` fails closed: nobody gets in.

## Invite people

```sh
cd web
AGMT_INVITE_SECRET='<same value as the Worker>' npm run execute:invite -- --label "Priya Nair, Khaitan" --days 90
```

It prints the link (`https://app.agmt.legal/invite/…`) and an invite id. The
link sets a cookie in that browser and opens the tool. To withdraw an invite,
add its id to `AGMT_INVITE_REVOKED`.

People without an invite see an "Ask for access" form. When they send it:
1. they get "Your request for Execute by Agmt": access is by invitation for
   now, and they'll be emailed a link when theirs is ready;
2. you get "Access request: Name, Firm" with their details and the exact
   `npm run execute:invite` command to invite them. Reply to write to them.

## After each deploy

```sh
curl -sI https://app.agmt.legal/ | grep -i content-security-policy   # must print the policy
curl -sI https://app.agmt.legal/execute-ocr/eng.traineddata.gz | head -1   # 200
```

In `public` mode, the full browser journey also runs against production:
`cd web && npm run execute:journey -- https://app.agmt.legal` (it uses the
built-in sample; nothing real is uploaded anywhere).

## Security note: the template's platform script

The template this app came from injects
`https://grok.com/grok-app-builder/extensions.js` into every HTML page
(`server/middleware/grok-pwa.ts`). On `/` the page policy
(`src/lib/execute/csp.ts`, sent as a header by `server/middleware/execute-csp.ts`)
refuses it, so no third-party code runs where documents are opened. `/proof`
still receives it. Removing that injection everywhere is recommended.

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

- `npm run test:execute`: engine, sorting, checks, invites, endpoints, policy
  header, and the two-document sample through pdf.js and pdf-lib.
- `node scripts/execute-screens.mjs [<url>] [<dir>]`: screenshots of every
  screen state (sample, needs-you, a duplicate certificate, 20 parties across
  3 documents, phone widths, the closing index) for design review.
- `node scripts/brand-assets.mjs`: redraws the Execute and Agmt marks,
  favicons, email header image and social preview from the fonts in
  `public/fonts`.
- `npm run execute:journey [-- <url>]`: the whole flow in Chromium, including a
  photo read by local OCR, the zip opened and every copy's page count checked,
  reload persistence, phone width, feedback, the side panel by keyboard, the
  closing index set in the Execute typefaces, no request leaving Agmt, and
  zero unexpected policy violations. Needs a running app (`npm run dev`) or a URL.
