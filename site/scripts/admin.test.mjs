import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

// The real admin module, SQL and migrations, on a throwaway PGLite database.
// A live database is refused: these tests insert rows.
assert.ok(!process.env.DATABASE_URL, "Run the admin tests without DATABASE_URL");
delete process.env.AGMT_ADMIN_PASSWORD;

const server = await createServer({
  configFile: false,
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  plugins: [
    {
      // Replace TanStack's HTTP transport so the handler can be called directly.
      name: "server-function-test-transport",
      enforce: "pre",
      transform(code, id) {
        if (id.endsWith("/src/lib/admin.ts"))
          return code.replace('from "@tanstack/react-start"', 'from "virtual:test-transport"');
      },
      resolveId(id) {
        if (id === "virtual:test-transport") return "\0test-transport";
      },
      load(id) {
        if (id !== "\0test-transport") return;
        return `export function createServerFn() {
          let validate = (v) => v;
          return { validator(fn) { validate = fn; return this; },
            handler(fn) { return async (args = {}) => fn({ data: validate(args.data) }); } };
        }`;
      },
    },
  ],
});

const admin = await server.ssrLoadModule("/src/lib/admin.ts");
const { getSql } = await server.ssrLoadModule("/src/lib/db.ts");

before(async () => {
  const sql = await getSql();
  await sql.query(
    `insert into waitlist (name, email, email_normalized, interest, status, remind_beta)
     values ('Synthetic Person', 'person@example.invalid', 'person@example.invalid', 'both', 'reminder-only', true)`,
  );
  await sql.query(
    `insert into builder_interest (email, email_normalized, product_url, consent)
     values ('builder@example.invalid', 'builder@example.invalid', 'https://example.invalid/', true)`,
  );
});

after(async () => {
  await server.close();
});

test("with no AGMT_ADMIN_PASSWORD, admin stays shut, whatever is typed", async () => {
  for (const password of ["", "agmt-beta-admin", "anything"]) {
    const result = await admin.loadAdmin(password);
    assert.deepEqual(result, { ok: false, error: admin.ADMIN_DISABLED });
  }
});

test("a wrong password shows nothing", async () => {
  process.env.AGMT_ADMIN_PASSWORD = "correct horse battery staple";
  const result = await admin.loadAdmin("agmt-beta-admin");
  assert.deepEqual(result, { ok: false, error: "Wrong password." });
});

test("the right password shows both lists", async () => {
  process.env.AGMT_ADMIN_PASSWORD = "correct horse battery staple";
  const result = await admin.adminUnlock({ data: { password: "correct horse battery staple" } });
  assert.equal(result.ok, true);
  assert.equal(result.waitlist.length, 1);
  assert.equal(result.waitlist[0].email, "person@example.invalid");
  assert.equal(result.builders.length, 1);
  assert.equal(result.builders[0].product_url, "https://example.invalid/");
});

test("the admin module only reads: it exports nothing that writes", () => {
  assert.deepEqual(Object.keys(admin).sort(), ["ADMIN_DISABLED", "adminUnlock", "loadAdmin"]);
});
