#!/usr/bin/env node
/**
 * Read-only production auth smoke test — safe to run against a live deploy.
 *
 * Never creates an account, never signs in with real credentials, never logs
 * a password, token, or full response body. Checks only:
 *  - the login page loads (following its returnTo redirect);
 *  - a signed-out session returns 200;
 *  - a same-origin sign-in with made-up credentials is rejected quickly with
 *    a stable code, not a hang or a bare 500 (the actual production bug this
 *    change fixes);
 *  - a cross-origin sign-in is rejected with INVALID_ORIGIN.
 *
 * Usage: node scripts/production-auth-smoke.mjs [https://app.agmt.legal]
 * Exit 0 if every check passes, 1 otherwise. Prints one JSON report to stdout.
 */
const baseUrl = (process.argv[2] || "https://app.agmt.legal").replace(/\/+$/, "");
const REQUEST_TIMEOUT_MS = 15_000;
// Generous: this bounds "did the fix work" (no hang), not steady-state latency.
const BOUNDED_RESPONSE_MS = 12_000;

async function check(name, run) {
  const start = Date.now();
  try {
    const detail = await run();
    return { name, ok: true, elapsedMs: Date.now() - start, ...detail };
  } catch (error) {
    return { name, ok: false, elapsedMs: Date.now() - start, error: error?.message || String(error) };
  }
}

async function jsonBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function main() {
  const results = [];

  results.push(
    await check("login page loads", async () => {
      const response = await fetch(`${baseUrl}/login`, {
        redirect: "follow",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.status !== 200) throw new Error(`expected 200, got ${response.status}`);
      return { status: response.status };
    }),
  );

  results.push(
    await check("signed-out session returns 200", async () => {
      const response = await fetch(`${baseUrl}/api/auth/get-session`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.status !== 200) throw new Error(`expected 200, got ${response.status}`);
      return { status: response.status };
    }),
  );

  results.push(
    await check("cross-origin sign-in is rejected with INVALID_ORIGIN", async () => {
      const response = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://smoke-test.invalid" },
        body: JSON.stringify({ email: "smoke-test@example.com", password: "not-a-real-password" }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const body = await jsonBody(response);
      if (response.status !== 403) throw new Error(`expected 403, got ${response.status}`);
      if (body?.code !== "INVALID_ORIGIN") throw new Error(`expected code INVALID_ORIGIN, got ${body?.code}`);
      return { status: response.status, code: body.code };
    }),
  );

  results.push(
    await check("same-origin sign-in with unknown credentials fails fast with a stable code", async () => {
      const response = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: baseUrl },
        body: JSON.stringify({ email: "smoke-test@example.com", password: "not-a-real-password" }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const body = await jsonBody(response);
      if (response.status === 200) throw new Error("smoke-test@example.com unexpectedly has a real account");
      if (!body?.code) throw new Error(`expected a stable error code in the response body, got status=${response.status} body=${JSON.stringify(body)}`);
      if (body.code === "INVALID_ORIGIN") throw new Error("same-origin request was rejected as INVALID_ORIGIN");
      return { status: response.status, code: body.code };
    }),
  );

  for (const result of results) {
    if (result.ok && result.elapsedMs > BOUNDED_RESPONSE_MS) {
      result.ok = false;
      result.error = `took ${result.elapsedMs}ms, expected under ${BOUNDED_RESPONSE_MS}ms`;
    }
  }

  const report = { baseUrl, results, ok: results.every((result) => result.ok) };
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((error) => {
  console.error("[production-auth-smoke] failed:", error?.message || error);
  process.exit(1);
});
