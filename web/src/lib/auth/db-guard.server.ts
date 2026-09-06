/**
 * Bound every AUTH_DB round trip and translate raw Postgres/Hyperdrive
 * failures into stable, non-sensitive Better Auth `APIError`s.
 *
 * Without this, a Hyperdrive/Supabase failure (unreachable host, rejected
 * credentials, a hung query) surfaces to better-call's router as a plain
 * `Error`. The router only knows how to serialise `APIError` instances — any
 * other thrown value becomes `new Response(null, { status: 500 })`: no body,
 * no message. Better Auth's client then has nothing to read `error.message`
 * from, and the login page falls back to a generic "Authentication failed."
 * That is the actual production symptom this file fixes: it is not that
 * credentials are wrong, it is that the real failure never reaches the
 * client as a readable error.
 *
 * `better-auth`'s Kysely adapter accepts anything with a `connect()` method
 * as a "postgres pool" (structural check, not `instanceof Pool` — see
 * `@better-auth/kysely-adapter`'s `getKyselyDatabaseType`), and Kysely's own
 * `PostgresDriver` only needs the minimal shape below (see kysely's
 * `PostgresDialectConfig`). Kysely calls `pool.connect()` directly with no
 * try/catch around it, and its `PostgresConnection.executeQuery` re-throws
 * query errors unchanged (only extends `.stack`) — so an `APIError` thrown
 * from either method here propagates untouched all the way to the router.
 */
import type { PostgresCursor, PostgresPool, PostgresPoolClient, PostgresQueryResult } from "kysely";
import { APIError } from "better-auth/api";
import { AUTH_ERROR_CODES } from "./error-codes.ts";

/** The exact surface this file needs from a `pg.Pool` — kept minimal so a test can pass a fake. */
export interface GuardablePool {
  connect(): Promise<GuardablePoolClient>;
  end(): Promise<void>;
  on(event: "error", listener: (error: Error) => void): unknown;
}

export interface GuardablePoolClient {
  query(sql: string, parameters: unknown[]): Promise<{ command?: string; rowCount?: number | null; rows: unknown[] }>;
  release(): void;
}

/** Bound on establishing a fresh connection to AGMT_AUTH_DB via Hyperdrive. */
export const AUTH_DB_CONNECT_TIMEOUT_MS = 5_000;
/** Bound on a single query once connected — catches a hang mid-query. */
export const AUTH_DB_QUERY_TIMEOUT_MS = 8_000;

function authDatabaseUnavailable(): APIError {
  return new APIError("SERVICE_UNAVAILABLE", {
    code: AUTH_ERROR_CODES.AUTH_DATABASE_UNAVAILABLE,
    message: "The authentication database is unavailable. Try again shortly.",
  });
}

function authRequestTimeout(): APIError {
  return new APIError("GATEWAY_TIMEOUT", {
    code: AUTH_ERROR_CODES.AUTH_REQUEST_TIMEOUT,
    message: "The authentication request took too long to complete.",
  });
}

/** Never logs the connection string, query text, or parameters — only the driver error's safe metadata. */
function logDriverError(stage: "connect" | "query", error: unknown): void {
  const pgCode = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined;
  const name = error instanceof Error ? error.name : "unknown";
  console.error(`[auth.db] ${stage} failed name=${name}${pgCode ? ` code=${pgCode}` : ""}`);
}

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => APIError): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(onTimeout()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

/**
 * Wrap a real `pg.Pool` for use as Better Auth's `database` option. Bounds
 * `connect()` and every `query()`, and converts any failure that is not
 * already an `APIError` into `AUTH_DATABASE_UNAVAILABLE` (connect failed, or
 * a query errored for a reason other than our own timeout) or
 * `AUTH_REQUEST_TIMEOUT` (a query outlived `AUTH_DB_QUERY_TIMEOUT_MS`).
 *
 * Also attaches the pool-level `error` listener node-postgres requires: an
 * idle client that errors with no listener throws an unhandled event and can
 * take the whole isolate down with it, failing every in-flight request, not
 * just the one that hit the bad connection.
 */
export function guardAuthPool(
  pool: GuardablePool,
  timeouts?: { connectMs?: number; queryMs?: number },
): PostgresPool {
  const connectTimeoutMs = timeouts?.connectMs ?? AUTH_DB_CONNECT_TIMEOUT_MS;
  const queryTimeoutMs = timeouts?.queryMs ?? AUTH_DB_QUERY_TIMEOUT_MS;
  pool.on("error", (error) => logDriverError("connect", error));

  return {
    async connect(): Promise<PostgresPoolClient> {
      let client: GuardablePoolClient;
      try {
        client = await withTimeout(pool.connect(), connectTimeoutMs, authDatabaseUnavailable);
      } catch (error) {
        if (error instanceof APIError) throw error;
        logDriverError("connect", error);
        throw authDatabaseUnavailable();
      }
      function query<R>(sql: string, parameters: ReadonlyArray<unknown>): Promise<PostgresQueryResult<R>>;
      function query<R>(cursor: PostgresCursor<R>): PostgresCursor<R>;
      function query<R>(
        sqlOrCursor: string | PostgresCursor<R>,
        parameters?: ReadonlyArray<unknown>,
      ): Promise<PostgresQueryResult<R>> | PostgresCursor<R> {
        // Better Auth never configures Kysely's optional query-cursor
        // streaming (`PostgresDialectConfig.cursor`), so this overload is
        // never actually called — it exists only so this object satisfies
        // Kysely's `PostgresPoolClient` type, which declares it alongside the
        // `(sql, parameters)` form this file always uses.
        if (typeof sqlOrCursor !== "string") {
          throw new Error("guardAuthPool: cursor queries are not supported");
        }
        return withTimeout(
          client.query(sqlOrCursor, (parameters ?? []) as unknown[]) as Promise<PostgresQueryResult<R>>,
          queryTimeoutMs,
          authRequestTimeout,
        ).catch((error) => {
          if (error instanceof APIError) throw error;
          logDriverError("query", error);
          throw authDatabaseUnavailable();
        });
      }

      return {
        query,
        release(): void {
          client.release();
        },
      } satisfies PostgresPoolClient;
    },
    end: () => pool.end(),
  };
}
