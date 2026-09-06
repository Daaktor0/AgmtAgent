import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { APIError } from "better-auth/api";
import { AUTH_ERROR_CODES } from "./error-codes.ts";
import { guardAuthClientFactory, type GuardableAuthClient } from "./db-guard.server.ts";

function never(): Promise<never> {
  return new Promise(() => {
    /* deliberately hangs */
  });
}

function fakeClient(overrides: Partial<GuardableAuthClient>): GuardableAuthClient {
  return {
    connect: () => Promise.resolve(),
    query: () => Promise.resolve({ rows: [] }),
    end: () => Promise.resolve(),
    on: () => undefined,
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

describe("guardAuthClientFactory", () => {
  it("passes healthy connect/query straight through and closes the client on release by default", async () => {
    const rows = [{ id: "u1" }];
    const ended: boolean[] = [];
    const guarded = guardAuthClientFactory(() =>
      fakeClient({
        query: async (sql, params) => {
          assert.equal(sql, "select 1");
          assert.deepEqual(params, ["a"]);
          return { command: "SELECT", rowCount: 1, rows };
        },
        end: async () => {
          ended.push(true);
        },
      }),
    );

    const client = await guarded.connect();
    const result = await client.query("select 1", ["a"]);
    client.release();
    await Promise.resolve(); // release() closes the client fire-and-forget

    assert.deepEqual(result.rows, rows);
    assert.deepEqual(ended, [true]);
  });

  it("does not close the client on release when closeOnRelease is false (Cloudflare Workers)", async () => {
    const ended: boolean[] = [];
    const guarded = guardAuthClientFactory(
      () => fakeClient({ end: async () => void ended.push(true) }),
      { closeOnRelease: false },
    );

    const client = await guarded.connect();
    client.release();
    await Promise.resolve();

    assert.deepEqual(ended, [], "the Worker request lifecycle owns cleanup, not release()");
  });

  it("a fresh client is created per connect() call — nothing is cached across requests", async () => {
    let created = 0;
    const guarded = guardAuthClientFactory(() => {
      created += 1;
      return fakeClient({});
    });

    (await guarded.connect()).release();
    (await guarded.connect()).release();

    assert.equal(created, 2, "Workers cannot safely reuse a socket cached across invocations");
  });

  it("turns a connect() rejection into AUTH_DATABASE_UNAVAILABLE, never leaking the driver error", async () => {
    const guarded = guardAuthClientFactory(() =>
      fakeClient({ connect: () => Promise.reject(new Error('password authentication failed for user "postgres"')) }),
    );
    const error = await expectAPIError(guarded.connect(), AUTH_ERROR_CODES.AUTH_DATABASE_UNAVAILABLE);
    assert.equal(error.statusCode, 503);
    assert.doesNotMatch(String(error.body?.message), /password/i);
  });

  it("bounds a hanging connect() and reports AUTH_DATABASE_UNAVAILABLE", async () => {
    const guarded = guardAuthClientFactory(() => fakeClient({ connect: never }), { connectMs: 25 });
    const start = Date.now();
    const error = await expectAPIError(guarded.connect(), AUTH_ERROR_CODES.AUTH_DATABASE_UNAVAILABLE);
    assert.ok(Date.now() - start < 1000, "connect() should not wait anywhere near a real network timeout");
    assert.equal(error.statusCode, 503);
  });

  it("turns a query() rejection into AUTH_DATABASE_UNAVAILABLE", async () => {
    const guarded = guardAuthClientFactory(() =>
      fakeClient({ query: () => Promise.reject(new Error('relation "user" does not exist')) }),
    );
    const client = await guarded.connect();
    await expectAPIError(client.query("select 1", []), AUTH_ERROR_CODES.AUTH_DATABASE_UNAVAILABLE);
  });

  it("bounds a hanging query() and reports AUTH_REQUEST_TIMEOUT", async () => {
    const guarded = guardAuthClientFactory(() => fakeClient({ query: never }), { queryMs: 25 });
    const client = await guarded.connect();
    const start = Date.now();
    const error = await expectAPIError(client.query("select 1", []), AUTH_ERROR_CODES.AUTH_REQUEST_TIMEOUT);
    assert.ok(Date.now() - start < 1000, "query() should not wait anywhere near a real network timeout");
    assert.equal(error.statusCode, 504);
  });

  it("registers a per-client error listener so an idle-client error cannot crash the process unhandled", async () => {
    let handler: ((error: Error) => void) | undefined;
    const guarded = guardAuthClientFactory(() =>
      fakeClient({
        on: (_event, listener) => {
          handler = listener;
        },
      }),
    );
    await guarded.connect();
    assert.equal(typeof handler, "function");
    assert.doesNotThrow(() => handler?.(new Error("terminating connection due to administrator command")));
  });
});
