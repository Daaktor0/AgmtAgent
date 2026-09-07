import { after, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

// Exercise the real validators, handlers, SQL and migrations without HTTP transport.
// Production credentials are deliberately refused: all test records are ephemeral.
assert.ok(!process.env.DATABASE_URL, "Run signup tests without a live DATABASE_URL");
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
        if (id.endsWith("/src/lib/waitlist.ts"))
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
const api = await server.ssrLoadModule("/src/lib/waitlist.ts");
const { getSql } = await server.ssrLoadModule("/src/lib/db.ts");
const sql = await getSql();
after(async () => {
  await server.close();
});
const signup = (overrides = {}) =>
  api.submitSignup({
    data: {
      name: "Synthetic Test",
      email: "dispatch-test@example.invalid",
      firm: "",
      role: "",
      interest: "both",
      intent: "remind",
      remindBeta: true,
      remindLaunch: true,
      ...overrides,
    },
  });

test("Dispatch persists a reminder, with no seat, and deduplicates email case", async () => {
  assert.equal((await signup()).ok, true);
  assert.equal((await signup({ email: "DISPATCH-TEST@example.invalid" })).ok, true);
  const rows = await sql.query("select * from waitlist where email_normalized=$1", [
    "dispatch-test@example.invalid",
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "reminder-only");
  assert.equal(rows[0].fcfs_seat, null);
  assert.equal(rows[0].remind_beta, true);
  assert.equal(rows[0].remind_launch, true);
});
test("Dispatch preserves a pre-existing beta seat and its product preference", async () => {
  assert.equal(
    (await signup({ email: "seat-test@example.invalid", interest: "proof", intent: "seat" }))
      .outcome,
    "booked",
  );
  assert.equal((await signup({ email: "seat-test@example.invalid" })).ok, true);
  const [row] = await sql.query("select * from waitlist where email_normalized=$1", [
    "seat-test@example.invalid",
  ]);
  assert.equal(row.status, "seat-fcfs");
  assert.equal(row.fcfs_seat, 1);
  assert.equal(row.interest, "proof");
});
test("Malformed email and whitespace-only name fail server validation", async () => {
  await assert.rejects(signup({ email: "not-an-email" }));
  await assert.rejects(signup({ name: "   " }));
});
test("Production without persistent storage never confirms a subscription", async () => {
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    assert.equal((await signup()).ok, false);
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
    assert.equal((await signup()).ok, false);
  } finally {
    sql.query = query;
  }
});
