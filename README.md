# Agmt

**Execute** turns a final agreement and the signed pages that come back into
one complete executed copy per party. It runs at `app.agmt.legal`.

Everything happens in the lawyer's browser: agreements, signed returns and stamp
papers are read, sorted and assembled on their own computer, and are never sent
to Agmt.

## What's here

| Path | What it is |
|---|---|
| [`web/`](web/) | The Execute app: TanStack Start, React 19, Tailwind. Deployed to the Cloudflare Worker `agmt`. |
| [`site/`](site/) | The company website at agmt.legal, with the blog. Deployed on Vercel. See [`site/README.md`](site/README.md). |
| [`docs/brand/`](docs/brand/) | Brand and UI system. |
| `src/worker.ts` | A legacy Worker class Cloudflare still expects the `agmt` Worker to export. |
| `wrangler.jsonc` | Cloudflare Workers Builds config for the `agmt` Worker (plain variables live here; secrets live in the dashboard). |

## Run Execute locally

```
cd web
npm ci
npm run dev            # http://127.0.0.1:8080
npm run test:execute
npm run typecheck
```

The launch runbook, Worker settings and the closed-beta access flow are in
[`web/docs/EXECUTE_LAUNCH.md`](web/docs/EXECUTE_LAUNCH.md).

## Deploy

Merging changes to the app into `main` deploys it to production (`.github/workflows/deploy-cloudflare.yml`). The website deploys separately on Vercel.
