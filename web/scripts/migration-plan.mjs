// @ts-check
/**
 * Migration bookkeeping shared by this module's two callers:
 *  - `src/lib/db.ts` (PGLite preview, `import.meta.glob`) reads only the
 *    top-level `migrations/*.sql` set — local dev shares one embedded
 *    database between the app and Better Auth, so that set includes the
 *    auth schema's byte-identical copy (see below).
 *  - `scripts/migrate.mjs` (deploy, `readdir`) calls `pendingMigrations`
 *    twice, once per directory: the top-level set against AGMT_APP_DB, and
 *    `migrations/auth/*.sql` against the separate AGMT_AUTH_DB. Each call
 *    only ever sees the one directory it was given — this module has no
 *    notion of "descending into subdirectories".
 *
 * The generated auth source lives under `migrations/auth/` and, when sign-in
 * is enabled, its byte-identical copy is placed at the top level for the
 * PGLite case above. Applied files are keyed by BASENAME (within each
 * database's own `_migrations` ledger — the two databases never share one),
 * so a database that already has `0001_auth.sql` will not re-run it after
 * that copy is enabled.
 */

/**
 * The `_migrations` key for a migration path (or bare filename).
 * @param {string} path
 * @returns {string}
 */
export function migrationName(path) {
  return path.split("/").pop() ?? path;
}

/**
 * @param {string} path
 * @returns {boolean}
 */
export function isMigrationFile(path) {
  return path.endsWith(".sql");
}

/**
 * Migrations in `paths` that are not yet in `applied`, in apply order.
 * Non-`.sql` entries (a `readdir` also yields `migrations/auth/`) are dropped.
 * @param {Iterable<string>} paths
 * @param {Iterable<string>} applied
 * @returns {Array<{ name: string, path: string }>}
 */
export function pendingMigrations(paths, applied) {
  const done = new Set(applied);
  return [...paths]
    .filter(isMigrationFile)
    .map((path) => ({ name: migrationName(path), path }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(({ name }) => !done.has(name));
}
