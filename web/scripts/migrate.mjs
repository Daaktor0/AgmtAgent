#!/usr/bin/env node
/** Deploy-time migration runner for the persistent Agmt Postgres database. */
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

const databaseUrl =
  process.env.DATABASE_URL?.trim() ||
  process.env.POSTGRES_URL?.trim() ||
  process.env.POSTGRES_PRISMA_URL?.trim();
const deployed = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

async function loadMigrations(entries) {
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

async function main() {
  let entries;
  try {
    entries = await readdir(migrationsDir);
  } catch {
    console.log("[migrate] no migrations/ directory — nothing to do.");
    return;
  }

  const migrations = await loadMigrations(entries);
  if (migrations.size === 0) {
    console.log("[migrate] no migrations — nothing to do.");
    return;
  }

  if (!databaseUrl) {
    if (deployed) {
      throw new Error(
        "Persistent Postgres is required for deployed Agmt builds. Set DATABASE_URL or POSTGRES_URL.",
      );
    }
    console.log("[migrate] no managed database configured — local PGLite will migrate itself.");
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
      if (!migration) throw new Error(`[migrate] migration disappeared: ${name}`);
      try {
        await client.query("BEGIN");
        await client.query(migration.text);
        await client.query(
          "INSERT INTO _migrations (name, checksum) VALUES ($1, $2)",
          [name, migration.checksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        console.error(`[migrate] error applying ${name}`);
        try {
          await client.query("ROLLBACK");
        } catch {
          /* retain the original migration error */
        }
        throw error;
      }
      console.log(`[migrate] applied ${name}`);
      count += 1;
    }
    console.log(
      count
        ? `[migrate] done — ${count} migration(s) applied.`
        : "[migrate] up to date.",
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[migrate] failed:", error?.message || error);
  for (const key of ["code", "detail", "hint", "position", "where"]) {
    if (error?.[key] != null) console.error(`[migrate]   ${key}: ${error[key]}`);
  }
  process.exit(1);
});
