/**
 * End-to-end coverage of the real /api/auth/* HTTP flow (Better Auth's
 * router, this app's origin/trustedOrigins config, and guardAuthPool)
 * against a real Postgres — no mocks standing in for the database.
 *
 * "sign-in-db-unavailable" needs no setup beyond a closed local port and
 * always runs. The rest need a real, migrated, throwaway Postgres — set
 * AGMT_AUTH_DB_TEST_URL to one (e.g. a local
 * `postgres://postgres:postgres@127.0.0.1:5432/agmt_auth_test` with
 * `migrations/auth/0001_auth.sql` applied) to run them; otherwise they are
 * skipped so a plain `npm test` stays independent of any running database,
 * matching the rest of this suite.
 *
 * Each scenario runs in its own child process: `server.ts` caches its
 * Better Auth instance per process keyed on *whether* AGMT_AUTH_DB is
 * configured, not the URL, so two scenarios sharing a process could
 * silently reuse the wrong pool.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { AUTH_ERROR_CODES } from "./error-codes.ts";

const execFileAsync = promisify(execFile);
const FIXTURE = fileURLToPath(new URL("./fixtures/auth-flow-fixture.ts", import.meta.url));
// Unreachable without needing an actual Postgres server: any closed local
// port refuses the connection immediately.
const UNREACHABLE_DB_URL = "postgres://postgres:postgres@127.0.0.1:1/unreachable";
// Never actually connected to in this test — only needed so src/lib/db.ts's
// dbSource resolves to "postgres" and skips its PGLite bootstrap (which
// depends on Vite's import.meta.glob and cannot run under plain node).
const UNUSED_APP_DB_URL = "postgres://unused:unused@127.0.0.1:1/unused";

type StepResult = { step: string; status: number; code?: string; elapsedMs: number };

async function runFixture(
  scenario: string,
  authDatabaseUrl: string,
  extraEnv: Record<string, string> = {},
): Promise<unknown> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  delete env.AGMT_PUBLIC_URL;
  delete env.BETTER_AUTH_URL;
  Object.assign(env, {
    DATABASE_URL: UNUSED_APP_DB_URL,
    BETTER_AUTH_SECRET: "test-secret-must-be-at-least-32-characters-long",
    BETTER_AUTH_DATABASE_URL: authDatabaseUrl,
    ...extraEnv,
  });
  const { stdout } = await execFileAsync(process.execPath, ["--experimental-strip-types", FIXTURE, scenario], {
    env,
    timeout: 30_000,
  });
  return JSON.parse(stdout);
}

function step(results: StepResult[], name: string): StepResult {
  const found = results.find((result) => result.step === name);
  assert.ok(found, `missing fixture step: ${name}`);
  return found;
}

describe("resolveExplicitBaseURL", () => {
  it("prioritises AGMT_PUBLIC_URL over the legacy BETTER_AUTH_URL fallback", async () => {
    const result = (await runFixture("resolve-base-url", UNREACHABLE_DB_URL, {
      AGMT_PUBLIC_URL: "https://app.agmt.legal",
      BETTER_AUTH_URL: "https://agmt.dexterinlab.workers.dev",
    })) as { value?: string };
    assert.equal(result.value, "https://app.agmt.legal");
  });

  it("falls back to BETTER_AUTH_URL when AGMT_PUBLIC_URL is unset", async () => {
    const result = (await runFixture("resolve-base-url", UNREACHABLE_DB_URL, {
      BETTER_AUTH_URL: "https://agmt.dexterinlab.workers.dev",
    })) as { value?: string };
    assert.equal(result.value, "https://agmt.dexterinlab.workers.dev");
  });
});

describe("auth handler — unreachable AGMT_AUTH_DB", () => {
  it("returns a bounded AUTH_DATABASE_UNAVAILABLE instead of hanging or a bare 500", async () => {
    const results = (await runFixture("db-unavailable", UNREACHABLE_DB_URL)) as StepResult[];
    const result = step(results, "sign-in-db-unavailable");
    assert.equal(result.status, 503);
    assert.equal(result.code, AUTH_ERROR_CODES.AUTH_DATABASE_UNAVAILABLE);
    assert.ok(result.elapsedMs < 10_000, `expected a bounded failure, took ${result.elapsedMs}ms`);
  });
});

describe("auth handler — real AGMT_AUTH_DB", { skip: !process.env.AGMT_AUTH_DB_TEST_URL && "set AGMT_AUTH_DB_TEST_URL to a migrated test Postgres to run this suite" }, () => {
  it("covers sign-up, sign-in, origin checks, and get-session end to end", async () => {
    const results = (await runFixture("happy-path", process.env.AGMT_AUTH_DB_TEST_URL ?? "")) as StepResult[];

    assert.equal(step(results, "sign-up-verified-user").status, 200);

    const validSignIn = step(results, "sign-in-valid-origin-correct-password");
    assert.equal(validSignIn.status, 200);
    assert.notEqual(validSignIn.code, AUTH_ERROR_CODES.INVALID_ORIGIN);

    const wrongPassword = step(results, "sign-in-wrong-password");
    assert.equal(wrongPassword.status, 401);
    assert.equal(wrongPassword.code, AUTH_ERROR_CODES.INVALID_CREDENTIALS);
    assert.ok(wrongPassword.elapsedMs < 10_000, `expected a bounded failure, took ${wrongPassword.elapsedMs}ms`);

    const invalidOrigin = step(results, "sign-in-invalid-origin");
    assert.equal(invalidOrigin.status, 403);
    assert.equal(invalidOrigin.code, AUTH_ERROR_CODES.INVALID_ORIGIN);

    assert.equal(step(results, "sign-up-unverified-user").status, 200);
    const unverified = step(results, "sign-in-unverified-user");
    assert.equal(unverified.status, 403);
    assert.equal(unverified.code, AUTH_ERROR_CODES.EMAIL_NOT_VERIFIED);

    assert.equal(step(results, "get-session-signed-out").status, 200);
  });
});
