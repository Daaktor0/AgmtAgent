import assert from "node:assert/strict";
import test from "node:test";

import {
  beginStatement,
  createPostgresSql,
  createSql,
  TransactionOutcomeError,
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

test("managed Postgres transaction pins the client and releases on failure", async () => {
  const events: string[] = [];
  let released = 0;
  const client = {
    query: async (text: string): Promise<{ rows: unknown[] }> => {
      events.push(text);
      return { rows: [] };
    },
    release: () => {
      released += 1;
    },
  };
  const pool = {
    query: async (text: string): Promise<{ rows: unknown[] }> => {
      events.push(`pool:${text}`);
      return { rows: [] };
    },
    connect: async () => client,
  };
  const sql = createPostgresSql(pool);

  await assert.rejects(
    sql.transaction(async (transactionSql) => {
      await transactionSql.query("insert probe", ["not-committed"]);
      throw new Error("forced client failure");
    }),
    /forced client failure/,
  );
  assert.deepEqual(events, ["BEGIN", "insert probe", "ROLLBACK"]);
  assert.equal(released, 1);

  events.length = 0;
  await sql.transaction(
    async (transactionSql) => {
      await transactionSql.query("select probe");
    },
    { isolationLevel: "serializable" },
  );
  assert.deepEqual(events, [
    "BEGIN ISOLATION LEVEL SERIALIZABLE",
    "select probe",
    "COMMIT",
  ]);
  assert.equal(released, 2);
});

test("managed Postgres query applies role and transaction-local context", async () => {
  const events: string[] = [];
  let released = 0;
  const client = {
    query: async (text: string): Promise<{ rows: unknown[] }> => {
      events.push(text);
      return { rows: [] };
    },
    release: () => {
      released += 1;
    },
  };
  const pool = {
    query: async (text: string): Promise<{ rows: unknown[] }> => {
      events.push(`pool:${text}`);
      return { rows: [] };
    },
    connect: async () => client,
  };
  const sql = createPostgresSql(pool, {
    configureClient: async () => {
      events.push("SET ROLE");
    },
    configureTransaction: async () => {
      events.push("SET LOCAL context");
    },
    useTransactionForQuery: () => true,
  });

  await sql.query("select protected", ["tenant-1"]);

  assert.deepEqual(events, [
    "SET ROLE",
    "BEGIN",
    "SET LOCAL context",
    "select protected",
    "COMMIT",
  ]);
  assert.equal(released, 1);
});

test("managed Postgres query rolls back when context setup fails", async () => {
  const events: string[] = [];
  let released = 0;
  const client = {
    query: async (text: string): Promise<{ rows: unknown[] }> => {
      events.push(text);
      return { rows: [] };
    },
    release: () => {
      released += 1;
    },
  };
  const pool = {
    query: async (text: string): Promise<{ rows: unknown[] }> => {
      events.push(`pool:${text}`);
      return { rows: [] };
    },
    connect: async () => client,
  };
  const sql = createPostgresSql(pool, {
    configureClient: async () => {
      events.push("SET ROLE");
    },
    configureTransaction: async () => {
      events.push("SET LOCAL context");
      throw new Error("context setup failed");
    },
    useTransactionForQuery: () => true,
  });

  await assert.rejects(sql.query("select protected"), /context setup failed/);
  assert.deepEqual(events, ["SET ROLE", "BEGIN", "SET LOCAL context", "ROLLBACK"]);
  assert.equal(released, 1);
});


test("callback failures report a confirmed rollback outcome", async () => {
  const events: string[] = [];
  let released = 0;
  const client = {
    query: async (text: string): Promise<{ rows: unknown[] }> => {
      events.push(text);
      return { rows: [] };
    },
    release: () => {
      released += 1;
    },
  };
  const pool = {
    query: async (text: string): Promise<{ rows: unknown[] }> => {
      events.push("pool:" + text);
      return { rows: [] };
    },
    connect: async () => client,
  };
  const sql = createPostgresSql(pool);

  await assert.rejects(
    sql.transaction(async () => {
      throw new Error("forced callback failure");
    }),
    (error) =>
      error instanceof TransactionOutcomeError &&
      error.outcome === "rolled_back" &&
      error.stage === "callback" &&
      /forced callback failure/.test(error.message),
  );
  assert.deepEqual(events, ["BEGIN", "ROLLBACK"]);
  assert.equal(released, 1);
});

test("commit transport failures report an unknown outcome and never claim rollback", async () => {
  const events: string[] = [];
  const client = {
    query: async (text: string): Promise<{ rows: unknown[] }> => {
      events.push(text);
      if (text === "COMMIT") throw new Error("commit transport failure");
      return { rows: [] };
    },
    release: () => undefined,
  };
  const pool = {
    query: async (text: string): Promise<{ rows: unknown[] }> => {
      events.push("pool:" + text);
      return { rows: [] };
    },
    connect: async () => client,
  };
  const sql = createPostgresSql(pool);

  await assert.rejects(
    sql.transaction(async () => undefined),
    (error) =>
      error instanceof TransactionOutcomeError &&
      error.outcome === "unknown" &&
      error.stage === "commit" &&
      /commit transport failure/.test(error.message),
  );
  assert.deepEqual(events, ["BEGIN", "COMMIT", "ROLLBACK"]);
});
