import { pendingMigrations } from "../../scripts/migration-plan.mjs";
import {
  beginStatement,
  createSql as createTransactionalSql,
  type Sql,
  type TransactionOptions,
} from "./db-transaction";

export type { Sql, TransactionIsolation, TransactionOptions } from "./db-transaction";

export type DbSource = "neon" | "pglite";

const env = (key: string): string | undefined => {
  const value = typeof process !== "undefined" ? process.env[key]?.trim() : undefined;
  return value ? value : undefined;
};

// Prefer the canonical name, but also accept the names commonly injected by
// managed Postgres integrations on Vercel. Production must never silently fall
// back to an embedded database.
const databaseUrl =
  env("DATABASE_URL") ?? env("POSTGRES_URL") ?? env("POSTGRES_PRISMA_URL");
const deployedServerless = Boolean(env("VERCEL") || env("VERCEL_ENV"));

export const dbSource: DbSource = databaseUrl ? "neon" : "pglite";

const globalRef = globalThis as typeof globalThis & {
  __pgSqlPromise__?: Promise<Sql>;
  __pgliteInstance__?: Promise<import("@electric-sql/pglite").PGlite>;
  __pgliteMigrateChain__?: Promise<void>;
};

const OID_INT8 = 20;
const OID_DATE = 1082;
const OID_INTERVAL = 1186;
const identity = (value: string) => value;

function persistentDatabaseRequired(): never {
  throw new Error(
    "Agmt requires a persistent managed Postgres connection in deployed environments. Set DATABASE_URL (or POSTGRES_URL) before deploying.",
  );
}

function createNeonSql(): Promise<Sql> {
  if (!databaseUrl) return Promise.reject(new Error("DATABASE_URL is not configured"));
  globalRef.__pgSqlPromise__ ??= (async () => {
    const { Pool, types } = await import("pg");
    types.setTypeParser(OID_INT8, Number);
    types.setTypeParser(OID_DATE, identity);
    types.setTypeParser(OID_INTERVAL, identity);
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 4,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      allowExitOnIdle: true,
    });
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
        const transactionSql = createTransactionalSql(
          async <R>(text: string, params: unknown[]) => {
            const result = await client.query<R>(text, params);
            return result.rows;
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
    return createTransactionalSql(run, transaction);
  })().catch((error) => {
    globalRef.__pgSqlPromise__ = undefined;
    throw error;
  });
  return globalRef.__pgSqlPromise__;
}

async function createPgliteSql(): Promise<Sql> {
  if (deployedServerless) persistentDatabaseRequired();

  globalRef.__pgliteInstance__ ??= (async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const pg = new PGlite({
      parsers: {
        [OID_INT8]: Number,
        [OID_DATE]: identity,
        [OID_INTERVAL]: identity,
      },
    });
    await pg.waitReady;
    await pg.exec(
      "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    return pg;
  })().catch((error) => {
    globalRef.__pgliteInstance__ = undefined;
    throw error;
  });
  const pg = await globalRef.__pgliteInstance__;

  const migrate = async (): Promise<void> => {
    const migrations = import.meta.glob("/migrations/*.sql", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>;
    const doneRows = await pg.query<{ name: string }>("select name from _migrations");
    const done = doneRows.rows.map((row) => row.name);
    for (const { name, path } of pendingMigrations(Object.keys(migrations), done)) {
      await pg.transaction(async (transaction) => {
        await transaction.exec(migrations[path]);
        await transaction.query("insert into _migrations (name) values ($1)", [name]);
      });
    }
  };

  const pass = (globalRef.__pgliteMigrateChain__ ?? Promise.resolve())
    .catch(() => undefined)
    .then(migrate);
  globalRef.__pgliteMigrateChain__ = pass;
  await pass;

  const run = async <T>(text: string, params: unknown[]) => {
    const result = await pg.query<T>(text, params);
    return result.rows;
  };
  const transaction = async <T>(
    callback: (transactionSql: Sql) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T> =>
    pg.transaction(async (transaction) => {
      if (options?.isolationLevel) {
        await transaction.exec(beginStatement(options).replace(/^BEGIN/, "SET TRANSACTION"));
      }
      const transactionSql = createTransactionalSql(
        async <R>(text: string, params: unknown[]) => {
          const result = await transaction.query<R>(text, params);
          return result.rows;
        },
        async () => {
          throw new Error("Nested database transactions are not supported");
        },
      );
      return callback(transactionSql);
    });

  return createTransactionalSql(run, transaction);
}

let sqlPromise: Promise<Sql> | null = null;

async function createSql(): Promise<Sql> {
  if (typeof window !== "undefined") {
    throw new Error(
      "@/lib/db is server-only — call getSql() from a server function or route loader.",
    );
  }
  if (deployedServerless && !databaseUrl) persistentDatabaseRequired();
  return dbSource === "neon" ? createNeonSql() : createPgliteSql();
}

export async function withTransaction<T>(
  callback: (transactionSql: Sql) => Promise<T>,
  options?: TransactionOptions,
): Promise<T> {
  const sql = await getSql();
  return sql.transaction(callback, options);
}

export function getSql(): Promise<Sql> {
  sqlPromise ??= createSql().catch((error) => {
    sqlPromise = null;
    throw error;
  });
  return sqlPromise;
}

export async function getPglite(): Promise<import("@electric-sql/pglite").PGlite> {
  if (deployedServerless) persistentDatabaseRequired();
  if (dbSource !== "pglite") {
    throw new Error("getPglite() is available only for local development without DATABASE_URL");
  }
  await getSql();
  const pg = await globalRef.__pgliteInstance__;
  if (!pg) throw new Error("PGLite instance failed to initialize");
  return pg;
}

export function ensureDbReady(): Promise<void> {
  if (deployedServerless && !databaseUrl) {
    return Promise.reject(
      new Error("Persistent Postgres is required on Vercel; embedded PGLite is disabled."),
    );
  }
  if (dbSource !== "pglite") return Promise.resolve();
  return getSql().then(() => undefined);
}

const globalBoot = globalThis as typeof globalThis & {
  __pgBootstrapPromise__?: Promise<void>;
};
if (typeof window === "undefined" && dbSource === "pglite" && !deployedServerless) {
  globalBoot.__pgBootstrapPromise__ ??= ensureDbReady().catch((error) => {
    globalBoot.__pgBootstrapPromise__ = undefined;
    console.error("[db] PGLite bootstrap failed:", error);
    throw error;
  });
}
