import assert from "node:assert/strict";
import test from "node:test";

import { sha256Hex } from "./migration-checksum.mjs";

test("migration checksum is stable SHA-256 hex", async () => {
  assert.equal(
    await sha256Hex("hello"),
    "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
  );
});
