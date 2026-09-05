import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [rootWrangler, rootPackage, webPackage, workflow, vite, db, auth, pwa] = await Promise.all([
  readFile(new URL("../../wrangler.jsonc", import.meta.url), "utf8"),
  readFile(new URL("../../package.json", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
  readFile(new URL("../../.github/workflows/deploy-cloudflare.yml", import.meta.url), "utf8"),
  readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/db.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/auth/server.ts", import.meta.url), "utf8"),
  readFile(new URL("../server/middleware/grok-pwa.ts", import.meta.url), "utf8"),
]);

test("Cloudflare deploy builds and serves the current web app", () => {
  const config = JSON.parse(rootWrangler);
  const rootScripts = JSON.parse(rootPackage).scripts;
  const webScripts = JSON.parse(webPackage).scripts;
  assert.equal(config.name, "agmt");
  assert.equal(config.main, "web/.output/server/index.mjs");
  assert.equal(config.assets.directory, "web/.output/public");
  assert.equal(config.containers, undefined);
  assert.match(rootScripts["build:web"], /web run build:cloudflare/);
  assert.match(rootScripts.build, /build:web/);
  assert.match(rootScripts.deploy, /web\/\.output\/server\/wrangler\.json/);
  assert.match(rootScripts.deploy, /--keep-vars/);
  assert.match(webScripts["build:cloudflare"], /--mode cloudflare/);
  assert.match(webScripts["deploy:cloudflare"], /wrangler deploy/);
  assert.match(webScripts["deploy:cloudflare"], /--keep-vars/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /deploy --config web\/\.output\/server\/wrangler\.json --keep-vars/);
  assert.match(vite, /preset:\s*mode === "cloudflare" \? "cloudflare_module"/);
  assert.match(db, /cloudflareWorkerRuntime/);
  assert.match(auth, /agmt\.dexterinlab\.workers\.dev/);
  assert.ok(pwa.includes('path === "/taskpane.html"'));
  assert.ok(pwa.includes('Response.redirect(new URL("/", event.url), 302)'));
});
