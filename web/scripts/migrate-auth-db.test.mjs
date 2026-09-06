/**
 * `migrate.mjs` now migrates two independent databases (see its own header
 * comment for why): AGMT_APP_DB from the top-level `migrations/`, and the
 * separate AGMT_AUTH_DB from `migrations/auth/`. The app-db half is
 * unchanged and already covered by the migration-plan/-ledger/-checksum
 * tests; this file covers only the new auth-db half.
 *
 * The "required but missing" and "optional and missing" cases need no
 * database at all. The "applies against a real database" case needs one —
 * set AGMT_AUTH_DB_TEST_URL to a throwaway Postgres to run it (the same
 * variable `src/lib/auth/auth-flow.test.ts` uses); otherwise it is skipped,
 * matching this suite's default independence from any running database.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

const execFileAsync = promisify(execFile);
const MIGRATE = fileURLToPath(new URL("./migrate.mjs", import.meta.url));
const ROOT = fileURLToPath(new URL("..", import.meta.url));

function baseEnv() {
  const env = { ...process.env };
  delete env.VERCEL;
  delete env.VERCEL_ENV;
  delete env.DATABASE_URL;
  delete env.POSTGRES_URL;
  delete env.POSTGRES_PRISMA_URL;
  delete env.BETTER_AUTH_DATABASE_URL;
  delete env.AUTH_DATABASE_URL;
  delete env.AUTH_DB_MIGRATION_REQUIRED;
  return env;
}

async function runMigrate(env) {
  try {
    const { stdout } = await execFileAsync(process.execPath, [MIGRATE], { cwd: ROOT, env, timeout: 20_000 });
    return { code: 0, stdout };
  } catch (error) {
    return { code: error.code ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

test("a plain local run with no AGMT_AUTH_DB configured stays a no-op, not an error", async () => {
  const result = await runMigrate(baseEnv());
  assert.equal(result.code, 0);
  assert.match(result.stdout, /\[migrate:auth\] no database configured — skipping\./);
});

test("AUTH_DB_MIGRATION_REQUIRED without a database URL fails loudly instead of silently skipping", async () => {
  const result = await runMigrate({ ...baseEnv(), AUTH_DB_MIGRATION_REQUIRED: "true" });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /migration\(s\) are pending but no database URL is configured/);
});

test(
  "applies migrations/auth/*.sql to a real database and is idempotent on a second run",
  { skip: !process.env.AGMT_AUTH_DB_TEST_URL && "set AGMT_AUTH_DB_TEST_URL to a throwaway Postgres to run this" },
  async () => {
    const env = { ...baseEnv(), BETTER_AUTH_DATABASE_URL: process.env.AGMT_AUTH_DB_TEST_URL };
    const first = await runMigrate(env);
    assert.equal(first.code, 0, first.stderr);
    assert.match(first.stdout, /\[migrate:auth\]/);

    const second = await runMigrate(env);
    assert.equal(second.code, 0, second.stderr);
    assert.match(second.stdout, /\[migrate:auth\] up to date\./);
  },
);
