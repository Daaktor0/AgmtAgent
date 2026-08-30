import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [agmt, audit] = await Promise.all([
  readFile(new URL("../src/lib/fn/agmt.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/server/audit.ts", import.meta.url), "utf8"),
]);

test("Matter creation publishes relational state in one transaction", () => {
  const start = agmt.indexOf("export const createMatter");
  const end = agmt.indexOf("export const getMatter", start);
  assert.ok(start >= 0 && end > start);
  const createMatter = agmt.slice(start, end);
  assert.match(createMatter, /await sql\.transaction\(async \(transactionSql\)/);
  assert.match(createMatter, /sql: transactionSql/);
});

test("audit writer accepts the caller's transaction adapter", () => {
  assert.match(audit, /sql\?: Sql/);
  assert.match(audit, /input\.sql \?\? \(await getSql\(\)\)/);
});
