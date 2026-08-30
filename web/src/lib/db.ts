import {
  migrationName,
  pendingMigrations,
} from "../../scripts/migration-plan.mjs";
import { sha256Hex } from "../../scripts/migration-checksum.mjs";
import { validateMigrationLedger } from "../../scripts/migration-ledger.mjs";
import {
  beginStatement,
  createPostgresSql,
  createSql as createTransactionalSql,
  type PostgresClientLike,
  type PostgresPoolLike,
  type Sql,
  type TransactionOptions,
} from "./db-transaction";
import {
  currentDatabaseContext,
  databaseContextSettings,
} from "./db-context.server";

export type { Sql, TransactionIsolation, TransactionOptions } from "./db-transaction";

export type DbSource = "postgres" | "pglite";

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

const RLS_CONTEXT_SQL =
  "select set_config($1, $2, true), set_config($3, $4, true), set_config($5, $6, true), set_config($7, $8, true)";

const DATABASE_RUNTIME_ROLES = {
  agmt_app: '"agmt_app"',
  agmt_worker: '"agmt_worker"',
  agmt_support: '"agmt_support"',
} as const;

function databaseRuntimeRole(): keyof typeof DATABASE_RUNTIME_ROLES {
  const value = env("AGMT_DB_ROLE");
  if (!value || !(value in DATABASE_RUNTIME_ROLES)) {
    throw new Error(
      "AGMT_DB_ROLE must be agmt_app, agmt_worker, or agmt_support when persistent Postgres is configured.",
    );
  }
  return value as keyof typeof DATABASE_RUNTIME_ROLES;
}

async function configureTransactionContext(client: PostgresClientLike): Promise<void> {
  const context = currentDatabaseContext();
  if (!context) return;
  const values = databaseContextSettings(context).flat();
  await client.query(RLS_CONTEXT_SQL, values);
}

export const dbSource: DbSource = databaseUrl ? "postgres" : "pglite";

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

function createManagedPostgresSql(): Promise<Sql> {
  if (!databaseUrl) return Promise.reject(new Error("DATABASE_URL is not configured"));
  const role = databaseRuntimeRole();
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
    return createPostgresSql(pool as unknown as PostgresPoolLike, {
      configureClient: async (client) => {
        await client.query(`set role ${DATABASE_RUNTIME_ROLES[role]}`);
      },
      configureTransaction: configureTransactionContext,
      useTransactionForQuery: () => currentDatabaseContext() !== null,
    });
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
      "create table if not exists _migrations (name text primary key, checksum text not null, applied_at timestamptz not null default now())",
    );
    await pg.exec(
      "alter table _migrations add column if not exists checksum text",
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
    const migrationByName = new Map<
      string,
      { name: string; path: string; text: string; checksum: string }
    >();
    for (const path of Object.keys(migrations)) {
      const name = migrationName(path);
      if (migrationByName.has(name)) {
        throw new Error(`Duplicate migration basename: ${name}`);
      }
      const text = migrations[path];
      migrationByName.set(name, {
        name,
        path,
        text,
        checksum: await sha256Hex(text),
      });
    }

    const doneRows = await pg.query<{
      name: string;
      checksum: string | null;
    }>("select name, checksum from _migrations");
    const done = validateMigrationLedger(
      doneRows.rows,
      [...migrationByName.values()],
    );
    for (const { name } of pendingMigrations(
      Object.keys(migrations),
      done,
    )) {
      const migration = migrationByName.get(name);
      if (!migration) throw new Error(`Migration disappeared: ${name}`);
      await pg.transaction(async (transaction) => {
        await transaction.exec(migration.text);
        await transaction.query(
          "insert into _migrations (name, checksum) values ($1, $2)",
          [name, migration.checksum],
        );
      });
    }
  };

  const pass = (globalRef.__pgliteMigrateChain__ ?? Promise.resolve())
    .catch(() => undefined)
    .then(migrate);
  globalRef.__pgliteMigrateChain__ = pass;
  await pass;

  const run = async <T>(text: string, params: unknown[]) => {
    const context = currentDatabaseContext();
    if (!context) {
      const result = await pg.query<T>(text, params);
      return result.rows;
    }
    return pg.transaction(async (transaction) => {
      await transaction.query(RLS_CONTEXT_SQL, databaseContextSettings(context).flat());
      const result = await transaction.query<T>(text, params);
      return result.rows;
    });
  };
  const transaction = async <T>(
    callback: (transactionSql: Sql) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T> =>
    pg.transaction(async (transaction) => {
      if (options?.isolationLevel) {
        await transaction.exec(beginStatement(options).replace(/^BEGIN/, "SET TRANSACTION"));
      }
      const context = currentDatabaseContext();
      if (context) {
        await transaction.query(RLS_CONTEXT_SQL, databaseContextSettings(context).flat());
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
  return dbSource === "postgres" ? createManagedPostgresSql() : createPgliteSql();
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
