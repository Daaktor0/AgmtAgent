import assert from "node:assert/strict";
import test from "node:test";
import {
  AGMT_APP_DB_BINDING,
  AGMT_AUTH_DB_BINDING,
  applicationDatabaseConnectionString,
  authDatabaseConnectionString,
  serverEnv,
} from "./runtime-env.server.ts";

const runtimeGlobal = globalThis as typeof globalThis & { __env__?: unknown };

test("Cloudflare bindings are read lazily from Nitro's request environment", () => {
  const previous = runtimeGlobal.__env__;
  runtimeGlobal.__env__ = {
    AGMT_DB_ROLE: "agmt_app",
    [AGMT_APP_DB_BINDING]: {
      connectionString: "postgresql://hyperdrive-app.invalid/agmt",
    },
    [AGMT_AUTH_DB_BINDING]: {
      connectionString: "postgresql://hyperdrive-auth.invalid/agmt",
    },
  };
  try {
    assert.equal(serverEnv("AGMT_DB_ROLE"), "agmt_app");
    assert.equal(
      applicationDatabaseConnectionString(),
      "postgresql://hyperdrive-app.invalid/agmt",
    );
    assert.equal(
      authDatabaseConnectionString(),
      "postgresql://hyperdrive-auth.invalid/agmt",
    );
  } finally {
    runtimeGlobal.__env__ = previous;
  }
});

test("Hyperdrive takes precedence over a legacy URL secret", () => {
  const previous = runtimeGlobal.__env__;
  const previousUrl = process.env.DATABASE_URL;
  runtimeGlobal.__env__ = {
    [AGMT_APP_DB_BINDING]: {
      connectionString: "postgresql://hyperdrive-app.invalid/agmt",
    },
  };
  process.env.DATABASE_URL = "postgresql://legacy.invalid/agmt";
  try {
    assert.equal(
      applicationDatabaseConnectionString(),
      "postgresql://hyperdrive-app.invalid/agmt",
    );
  } finally {
    runtimeGlobal.__env__ = previous;
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
  }
});
