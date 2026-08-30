import assert from "node:assert/strict";
import test from "node:test";

import { validateMigrationLedger } from "./migration-ledger.mjs";

const known = [
  { name: "0001_auth.sql", checksum: "auth-checksum" },
  { name: "0002_slice0.sql", checksum: "slice-checksum" },
];

test("migration ledger accepts matching immutable checksums", () => {
  assert.deepEqual(
    validateMigrationLedger(
      [
        { name: "0001_auth.sql", checksum: "auth-checksum" },
        { name: "0002_slice0.sql", checksum: "slice-checksum" },
      ],
      known,
    ),
    ["0001_auth.sql", "0002_slice0.sql"],
  );
});

test("migration ledger rejects an unknown applied migration", () => {
  assert.throws(
    () =>
      validateMigrationLedger(
        [{ name: "0009_removed.sql", checksum: "old" }],
        known,
      ),
    /missing from this release/,
  );
});

test("migration ledger rejects a legacy row without a checksum", () => {
  assert.throws(
    () =>
      validateMigrationLedger(
        [{ name: "0001_auth.sql", checksum: null }],
        known,
      ),
    /controlled ledger backfill is required/,
  );
});

test("migration ledger rejects edited migration contents", () => {
  assert.throws(
    () =>
      validateMigrationLedger(
        [{ name: "0001_auth.sql", checksum: "edited" }],
        known,
      ),
    /checksum mismatch/,
  );
});
