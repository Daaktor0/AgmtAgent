export type SqlRow = Record<string, unknown>;

export type TransactionIsolation =
  | "read committed"
  | "repeatable read"
  | "serializable";

export interface TransactionOptions {
  isolationLevel?: TransactionIsolation;
}

export type QueryRunner = <T = SqlRow>(
  text: string,
  params: unknown[],
) => Promise<T[]>;

export interface Sql {
  <T = SqlRow>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
  query<T = SqlRow>(text: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(
    callback: (sql: Sql) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T>;
}

export type TransactionRunner = <T>(
  callback: (sql: Sql) => Promise<T>,
  options?: TransactionOptions,
) => Promise<T>;

const ISOLATION_LEVELS: Record<TransactionIsolation, string> = {
  "read committed": "READ COMMITTED",
  "repeatable read": "REPEATABLE READ",
  serializable: "SERIALIZABLE",
};

export function beginStatement(options?: TransactionOptions): string {
  if (!options?.isolationLevel) return "BEGIN";
  const level = ISOLATION_LEVELS[options.isolationLevel];
  if (!level) {
    throw new Error(`Unsupported transaction isolation level: ${options.isolationLevel}`);
  }
  return `BEGIN ISOLATION LEVEL ${level}`;
}

export interface PostgresClientLike {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
  release(): void;
}

export interface PostgresPoolLike {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
  connect(): Promise<PostgresClientLike>;
}

export function createPostgresSql(pool: PostgresPoolLike): Sql {
  const run = async <T>(text: string, params: unknown[]) => {
    const result = await pool.query(text, params);
    return result.rows as T[];
  };

  const transaction = async <T>(
    callback: (transactionSql: Sql) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query(beginStatement(options));
      const transactionSql = createSql(
        async <R>(text: string, params: unknown[]) => {
          const result = await client.query(text, params);
          return result.rows as R[];
        },
        async () => {
          throw new Error("Nested database transactions are not supported");
        },
      );
      const result = await callback(transactionSql);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original transaction error.
      }
      throw error;
    } finally {
      client.release();
    }
  };

  return createSql(run, transaction);
}

export function createSql(
  run: QueryRunner,
  transaction: TransactionRunner,
): Sql {
  const sql = (async <T = SqlRow>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> => {
    let text = strings[0];
    for (let index = 0; index < values.length; index += 1) {
      text += `$${index + 1}${strings[index + 1]}`;
    }
    return run<T>(text, values);
  }) as Sql;

  sql.query = <T = SqlRow>(text: string, params: unknown[] = []) =>
    run<T>(text, params);
  sql.transaction = transaction;
  return sql;
}

export function withTransaction<T>(
  sql: Pick<Sql, "transaction">,
  callback: (transactionSql: Sql) => Promise<T>,
  options?: TransactionOptions,
): Promise<T> {
  return sql.transaction(callback, options);
}
