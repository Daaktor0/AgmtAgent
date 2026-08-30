import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [agmt, audit, upload] = await Promise.all([
  readFile(new URL("../src/lib/fn/agmt.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/server/audit.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/fn/document-upload.ts", import.meta.url), "utf8"),
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

test("document upload parses before acquiring a transaction and persists through it", () => {
  const start = upload.indexOf("export const uploadDocumentSafe");
  const end = upload.indexOf("});", start);
  assert.ok(start >= 0 && end > start);
  const uploadHandler = upload.slice(start);
  const parser = uploadHandler.indexOf("const ingested = await ingestBuffer(bytes)");
  const transaction = uploadHandler.indexOf(
    "const transactionalResult = await sql.transaction",
  );
  assert.ok(parser >= 0 && transaction > parser);
  assert.match(
    uploadHandler,
    /putBlob\(context\.userId, "original_docx", bytes, transactionSql\)/,
  );
  assert.match(uploadHandler, /await transactionSql\`/);
});
