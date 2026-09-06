import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { APIError } from "better-auth/api";
import { AUTH_ERROR_CODES } from "./error-codes.ts";
import { guardAuthPool, type GuardablePool, type GuardablePoolClient } from "./db-guard.server.ts";

function never(): Promise<never> {
  return new Promise(() => {
    /* deliberately hangs */
  });
}

function fakePool(overrides: Partial<GuardablePool>): GuardablePool {
  return {
    connect: () => Promise.reject(new Error("not implemented")),
    end: () => Promise.resolve(),
    on: () => undefined,
    ...overrides,
  };
}

function fakeClient(overrides: Partial<GuardablePoolClient>): GuardablePoolClient {
  return {
    query: () => Promise.resolve({ rows: [] }),
    release: () => undefined,
    ...overrides,
  };
}

async function expectAPIError(
  promise: Promise<unknown>,
  code: string,
): Promise<APIError> {
  const error = await promise.then(
    () => assert.fail("expected the promise to reject"),
    (rejection: unknown) => rejection,
  );
  assert.ok(error instanceof APIError, `expected an APIError, got ${String(error)}`);
  assert.equal((error as APIError).body?.code, code);
  return error as APIError;
}

describe("guardAuthPool", () => {
  it("passes healthy connect/query/release straight through", async () => {
    const rows = [{ id: "u1" }];
    const released: boolean[] = [];
    const pool = fakePool({
      connect: () =>
        Promise.resolve(
          fakeClient({
            query: async (sql, params) => {
              assert.equal(sql, "select 1");
              assert.deepEqual(params, ["a"]);
              return { command: "SELECT", rowCount: 1, rows };
            },
            release: () => released.push(true),
          }),
        ),
    });

    const guarded = guardAuthPool(pool);
    const client = await guarded.connect();
    const result = await client.query("select 1", ["a"]);
    client.release();

    assert.deepEqual(result.rows, rows);
    assert.deepEqual(released, [true]);
  });

  it("turns a connect() rejection into AUTH_DATABASE_UNAVAILABLE, never leaking the driver error", async () => {
    const pool = fakePool({
      connect: () => Promise.reject(new Error("password authentication failed for user \"postgres\"")),
    });
    const guarded = guardAuthPool(pool);
    const error = await expectAPIError(guarded.connect(), AUTH_ERROR_CODES.AUTH_DATABASE_UNAVAILABLE);
    assert.equal(error.statusCode, 503);
    assert.doesNotMatch(String(error.body?.message), /password/i);
  });

  it("bounds a hanging connect() and reports AUTH_DATABASE_UNAVAILABLE", async () => {
    const pool = fakePool({ connect: never });
    const guarded = guardAuthPool(pool, { connectMs: 25 });
    const start = Date.now();
    const error = await expectAPIError(guarded.connect(), AUTH_ERROR_CODES.AUTH_DATABASE_UNAVAILABLE);
    assert.ok(Date.now() - start < 1000, "connect() should not wait anywhere near a real network timeout");
    assert.equal(error.statusCode, 503);
  });

  it("turns a query() rejection into AUTH_DATABASE_UNAVAILABLE", async () => {
    const pool = fakePool({
      connect: () =>
        Promise.resolve(fakeClient({ query: () => Promise.reject(new Error('relation "user" does not exist')) })),
    });
    const guarded = guardAuthPool(pool);
    const client = await guarded.connect();
    await expectAPIError(client.query("select 1", []), AUTH_ERROR_CODES.AUTH_DATABASE_UNAVAILABLE);
  });

  it("bounds a hanging query() and reports AUTH_REQUEST_TIMEOUT", async () => {
    const pool = fakePool({ connect: () => Promise.resolve(fakeClient({ query: never })) });
    const guarded = guardAuthPool(pool, { queryMs: 25 });
    const client = await guarded.connect();
    const start = Date.now();
    const error = await expectAPIError(client.query("select 1", []), AUTH_ERROR_CODES.AUTH_REQUEST_TIMEOUT);
    assert.ok(Date.now() - start < 1000, "query() should not wait anywhere near a real network timeout");
    assert.equal(error.statusCode, 504);
  });

  it("registers a pool-level error listener so an idle-client error cannot crash the process unhandled", () => {
    let handler: ((error: Error) => void) | undefined;
    const pool = fakePool({
      on: (_event, listener) => {
        handler = listener;
      },
    });
    guardAuthPool(pool);
    assert.equal(typeof handler, "function");
    assert.doesNotThrow(() => handler?.(new Error("terminating connection due to administrator command")));
  });
});
