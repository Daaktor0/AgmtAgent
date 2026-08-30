import assert from "node:assert/strict";
import test from "node:test";

import {
  beginStatement,
  createSql,
  withTransaction,
  type Sql,
} from "./db-transaction.ts";

function makeMemoryAdapter(): { sql: Sql; committed: () => string[] } {
  let committedRows: string[] = [];
  let transactionRows: string[] | undefined;
  let sql!: Sql;

  const run = async <T>(text: string, params: unknown[] = []): Promise<T[]> => {
    const rows = transactionRows ?? committedRows;
    if (text === "insert probe") {
      rows.push(String(params[0]));
      return [];
    }
    if (text === "select probe") {
      return [...rows] as T[];
    }
    throw new Error(`Unexpected probe query: ${text}`);
  };

  const transaction = async <T>(
    callback: (transactionSql: Sql) => Promise<T>,
  ): Promise<T> => {
    const snapshot = [...committedRows];
    const previousRows = transactionRows;
    transactionRows = snapshot;
    try {
      const result = await callback(sql);
      committedRows = snapshot;
      return result;
    } finally {
      transactionRows = previousRows;
    }
  };

  sql = createSql(run, transaction);
  return {
    sql,
    committed: () => [...committedRows],
  };
}

test("transaction callback commits all writes together", async () => {
  const adapter = makeMemoryAdapter();

  await withTransaction(adapter.sql, async (transactionSql) => {
    await transactionSql.query("insert probe", ["committed"]);
  });

  assert.deepEqual(adapter.committed(), ["committed"]);
});

test("transaction callback rolls back every write when a later phase fails", async () => {
  const adapter = makeMemoryAdapter();

  await assert.rejects(
    withTransaction(adapter.sql, async (transactionSql) => {
      await transactionSql.query("insert probe", ["must-not-leak"]);
      throw new Error("forced publication failure");
    }),
    /forced publication failure/,
  );

  assert.deepEqual(adapter.committed(), []);
});

test("transaction isolation statements are allow-listed", () => {
  assert.equal(
    beginStatement({ isolationLevel: "serializable" }),
    "BEGIN ISOLATION LEVEL SERIALIZABLE",
  );
  assert.equal(beginStatement(), "BEGIN");
  assert.throws(
    () =>
      beginStatement({
        isolationLevel: "drop table probe" as "read committed",
      }),
    /Unsupported transaction isolation level/,
  );
});
