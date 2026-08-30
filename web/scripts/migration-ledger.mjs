// @ts-check

/**
 * @typedef {{ name: string, checksum: string | null | undefined }} AppliedMigration
 * @typedef {{ name: string, checksum: string }} KnownMigration
 */

/**
 * @param {Iterable<AppliedMigration>} appliedRows
 * @param {Iterable<KnownMigration>} knownMigrations
 * @returns {string[]}
 */
export function validateMigrationLedger(appliedRows, knownMigrations) {
  const known = new Map();
  for (const migration of knownMigrations) {
    if (known.has(migration.name)) {
      throw new Error(`[migrate] duplicate migration basename: ${migration.name}`);
    }
    known.set(migration.name, migration);
  }

  const rows = [...appliedRows];
  for (const row of rows) {
    const migration = known.get(row.name);
    if (!migration) {
      throw new Error(
        `[migrate] applied migration is missing from this release: ${row.name}`,
      );
    }
    if (!row.checksum) {
      throw new Error(
        `[migrate] applied migration has no checksum; controlled ledger backfill is required: ${row.name}`,
      );
    }
    if (row.checksum !== migration.checksum) {
      throw new Error(
        `[migrate] migration checksum mismatch; refusing to continue: ${row.name}`,
      );
    }
  }
  return rows.map((row) => row.name);
}
