import { after, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

// Exercise the real validators, handler, SQL and migrations without HTTP transport.
// Production credentials are deliberately refused: all test records are ephemeral.
assert.ok(!process.env.DATABASE_URL, "Run builder-registration tests without a live DATABASE_URL");
const server = await createServer({
  configFile: false,
  appType: "custom",
  server: { middlewareMode: true },
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  plugins: [
    {
      name: "server-function-test-transport",
      enforce: "pre",
      transform(code, id) {
        if (id.endsWith("/src/lib/builders.ts"))
          return code.replace('from "@tanstack/react-start"', 'from "virtual:test-transport"');
      },
      resolveId(id) {
        if (id === "virtual:test-transport") return "\0test-transport";
      },
      load(id) {
        if (id !== "\0test-transport") return;
        return `export function createServerFn() {
        let validate = value => value;
        return { validator(fn) { validate = fn; return this; },
          handler(fn) { return async (args = {}) => fn({ data: validate(args.data) }); }
        };
      }`;
      },
    },
  ],
});
const api = await server.ssrLoadModule("/src/lib/builders.ts");
const { getSql } = await server.ssrLoadModule("/src/lib/db.ts");
const sql = await getSql();
after(async () => {
  await server.close();
});
const register = (overrides = {}) =>
  api.registerBuilderInterest({
    data: {
      email: "builder-test@example.invalid",
      productUrl: "",
      consent: true,
      ...overrides,
    },
  });

test("Registration persists, normalizes a bare domain, and deduplicates email case", async () => {
  assert.equal((await register({ productUrl: "example.com" })).ok, true);
  assert.equal((await register({ email: "BUILDER-TEST@example.invalid" })).ok, true);
  const rows = await sql.query("select * from builder_interest where email_normalized=$1", [
    "builder-test@example.invalid",
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].product_url, "https://example.com/");
  assert.equal(rows[0].consent, true);
});
test("A duplicate submission is confirmed without overwriting the stored product URL", async () => {
  assert.equal(
    (await register({ email: "dup-test@example.invalid", productUrl: "https://first.example" })).ok,
    true,
  );
  assert.equal(
    (await register({ email: "dup-test@example.invalid", productUrl: "https://second.example" })).ok,
    true,
  );
  const [row] = await sql.query("select * from builder_interest where email_normalized=$1", [
    "dup-test@example.invalid",
  ]);
  assert.equal(row.product_url, "https://first.example/");
});
test("A blank product URL is valid and stored as null", async () => {
  assert.equal((await register({ email: "no-url-test@example.invalid", productUrl: "" })).ok, true);
  const [row] = await sql.query("select * from builder_interest where email_normalized=$1", [
    "no-url-test@example.invalid",
  ]);
  assert.equal(row.product_url, null);
});
test("Malformed email fails server validation", async () => {
  await assert.rejects(register({ email: "not-an-email" }));
});
test("An invalid product URL is rejected without persisting a row", async () => {
  const result = await register({ email: "bad-url-test@example.invalid", productUrl: "not a url" });
  assert.equal(result.ok, false);
  const rows = await sql.query("select * from builder_interest where email_normalized=$1", [
    "bad-url-test@example.invalid",
  ]);
  assert.equal(rows.length, 0);
});
test("Missing consent is rejected without persisting a row", async () => {
  const result = await register({ email: "no-consent-test@example.invalid", consent: false });
  assert.equal(result.ok, false);
  const rows = await sql.query("select * from builder_interest where email_normalized=$1", [
    "no-consent-test@example.invalid",
  ]);
  assert.equal(rows.length, 0);
});
test("Production without persistent storage never confirms a registration", async () => {
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    assert.equal((await register({ email: "prod-test@example.invalid" })).ok, false);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
test("A database write failure returns an honest retryable error", async () => {
  const query = sql.query;
  try {
    sql.query = async () => {
      throw new Error("Synthetic outage");
    };
    assert.equal((await register({ email: "outage-test@example.invalid" })).ok, false);
  } finally {
    sql.query = query;
  }
});
