# Execute by Agmt

Executed copies of multi-party agreements, assembled on the lawyer's own
computer: signature pages out, countersigned pages and stamp papers in, one
complete executed copy per party. Served at `app.agmt.legal/`.

Launch runbook, Worker settings and the closed-beta access flow:
[`docs/EXECUTE_LAUNCH.md`](docs/EXECUTE_LAUNCH.md). Rules for changes:
[`AGENTS.md`](AGENTS.md).

## Run

```
npm ci
npm run dev                 # http://127.0.0.1:8080
npm test
npm run typecheck
npm run lint
npm run build:cloudflare
```

With the app running, the browser journeys check the whole flow in Chromium:

```
npm run execute:journey
npm run execute:make-journey
npm run execute:access-journey
```

## Stack

TanStack Start, React 19, Tailwind v4; pdf.js, pdf-lib and Tesseract in the
browser. Better Auth (email and password, verified by email through Resend) for
beta access. Deployed by Nitro to the Cloudflare Worker `agmt`.
