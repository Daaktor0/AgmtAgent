#!/usr/bin/env node
/**
 * Deploy-time migration runner for Agmt's persistent Postgres databases.
 *
 * Runs two independent migration sets against two independent databases:
 *  - `migrations/*.sql` (top level) against AGMT_APP_DB (DATABASE_URL).
 *  - `migrations/auth/*.sql` against AGMT_AUTH_DB (BETTER_AUTH_DATABASE_URL
 *    or AUTH_DATABASE_URL) — Better Auth's own schema.
 *
 * These were one database until the app split Better Auth onto its own
 * Hyperdrive binding (AGMT_AUTH_DB) for isolation. `migrations/auth/*.sql` is
 * kept in sync with a byte-identical top-level copy so the single-database
 * PGLite dev fallback (`src/lib/db.ts`, which only reads the top level) still
 * gets the auth tables — see `migration-plan.mjs`. That copy is what used to
 * carry the auth schema into the one production database too, but AGMT_AUTH_DB
 * is a *different* physical database from AGMT_APP_DB: applying migrations
 * only to DATABASE_URL never creates Better Auth's tables there. Each set
 * below is independent: neither is required for the other to run, and a
 * missing auth database URL only fails the run when `requireAuthDb` is set
 * (wired from AUTH_DB_MIGRATION_REQUIRED — see `web-migrate.yml`), so a plain
 * local `npm run db:migrate` without AGMT_AUTH_DB configured stays a no-op
 * rather than an error.
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import {
  isMigrationFile,
  migrationName,
  pendingMigrations,
} from "./migration-plan.mjs";
import { sha256Hex } from "./migration-checksum.mjs";
import { validateMigrationLedger } from "./migration-ledger.mjs";

const appDatabaseUrl =
  process.env.DATABASE_URL?.trim() ||
  process.env.POSTGRES_URL?.trim() ||
  process.env.POSTGRES_PRISMA_URL?.trim();
const authDatabaseUrl =
  process.env.BETTER_AUTH_DATABASE_URL?.trim() || process.env.AUTH_DATABASE_URL?.trim();
const requireAuthDb = Boolean(process.env.AUTH_DB_MIGRATION_REQUIRED);
const deployed = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

async function loadMigrations(migrationsDir, entries) {
  const migrations = new Map();
  for (const path of entries.filter(isMigrationFile)) {
    const name = migrationName(path);
    if (migrations.has(name)) {
      throw new Error(`[migrate] duplicate migration basename: ${name}`);
    }
    const text = await readFile(join(migrationsDir, path), "utf8");
    migrations.set(name, {
      name,
      path,
      text,
      checksum: await sha256Hex(text),
    });
  }
  return migrations;
}

/**
 * Apply every pending `.sql` file in `migrationsDir` to `databaseUrl`,
 * tracked by a `_migrations` ledger table local to that database. A no-op
 * (with a log line) when the directory is empty or `databaseUrl` is unset —
 * unless `required` is true, in which case a missing URL throws.
 */
async function migrateDatabase({ label, migrationsDir, databaseUrl, required }) {
  let entries;
  try {
    entries = await readdir(migrationsDir);
  } catch {
    console.log(`[migrate:${label}] no ${migrationsDir} directory — nothing to do.`);
    return;
  }

  const migrations = await loadMigrations(migrationsDir, entries);
  if (migrations.size === 0) {
    console.log(`[migrate:${label}] no migrations — nothing to do.`);
    return;
  }

  if (!databaseUrl) {
    if (required) {
      throw new Error(
        `[migrate:${label}] ${migrations.size} migration(s) are pending but no database URL is configured.`,
      );
    }
    console.log(`[migrate:${label}] no database configured — skipping.`);
    return;
  }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });
  const client = await pool.connect();
  try {
    await client.query(
      "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );
    await client.query(
      "ALTER TABLE _migrations ADD COLUMN IF NOT EXISTS checksum TEXT",
    );

    const appliedRows = (
      await client.query("SELECT name, checksum FROM _migrations")
    ).rows;
    const appliedNames = validateMigrationLedger(
      appliedRows,
      [...migrations.values()],
    );

    let count = 0;
    for (const { name } of pendingMigrations(
      [...migrations.keys()],
      appliedNames,
    )) {
      const migration = migrations.get(name);
      if (!migration) throw new Error(`[migrate:${label}] migration disappeared: ${name}`);
      try {
        await client.query("BEGIN");
        await client.query(migration.text);
        await client.query(
          "INSERT INTO _migrations (name, checksum) VALUES ($1, $2)",
          [name, migration.checksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        console.error(`[migrate:${label}] error applying ${name}`);
        try {
          await client.query("ROLLBACK");
        } catch {
          /* retain the original migration error */
        }
        throw error;
      }
      console.log(`[migrate:${label}] applied ${name}`);
      count += 1;
    }
    console.log(
      count
        ? `[migrate:${label}] done — ${count} migration(s) applied.`
        : `[migrate:${label}] up to date.`,
    );
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  if (!appDatabaseUrl && deployed) {
    throw new Error(
      "Persistent Postgres is required for deployed Agmt builds. Set DATABASE_URL or POSTGRES_URL.",
    );
  }
  if (!appDatabaseUrl && !deployed) {
    console.log("[migrate:app] no managed database configured — local PGLite will migrate itself.");
  } else {
    await migrateDatabase({
      label: "app",
      migrationsDir: join(rootDir, "migrations"),
      databaseUrl: appDatabaseUrl,
      required: deployed,
    });
  }

  await migrateDatabase({
    label: "auth",
    migrationsDir: join(rootDir, "migrations", "auth"),
    databaseUrl: authDatabaseUrl,
    required: requireAuthDb,
  });
}

main().catch((error) => {
  console.error("[migrate] failed:", error?.message || error);
  for (const key of ["code", "detail", "hint", "position", "where"]) {
    if (error?.[key] != null) console.error(`[migrate]   ${key}: ${error[key]}`);
  }
  process.exit(1);
});
