import { test } from "node:test";
import assert from "node:assert/strict";
import executeCsp from "../../../server/middleware/execute-csp.ts";
import { EXECUTE_CSP_HEADER, EXECUTE_CSP_META } from "./csp.ts";

const event = (path: string) => ({ url: new URL(`https://app.agmt.legal${path}`), req: { method: "GET" } });
const html = () => new Response("<html></html>", { headers: { "content-type": "text/html; charset=utf-8" } });

test("the executed-copies page is served with the strict policy header", async () => {
  const res = (await executeCsp(event("/"), html)) as Response;
  assert.equal(res.headers.get("content-security-policy"), EXECUTE_CSP_HEADER);
  assert.match(EXECUTE_CSP_HEADER, /script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'/);
  assert.match(EXECUTE_CSP_HEADER, /connect-src 'self' blob: data:/);
  assert.match(EXECUTE_CSP_HEADER, /frame-ancestors 'self'/);
  assert.doesNotMatch(EXECUTE_CSP_HEADER, /grok\.com/);
  assert.doesNotMatch(EXECUTE_CSP_META, /frame-ancestors/);
});

test("other pages and non-HTML responses are left alone", async () => {
  const other = (await executeCsp(event("/proof"), html)) as Response;
  assert.equal(other.headers.get("content-security-policy"), null);
  const asset = (await executeCsp(event("/"), () => new Response("{}", { headers: { "content-type": "application/json" } }))) as Response;
  assert.equal(asset.headers.get("content-security-policy"), null);
});
