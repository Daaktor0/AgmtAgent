/**
 * Standalone fixture, run as a child process (not matched by the `*.test.ts`
 * glob) by `auth-flow.test.ts`. `server.ts` caches its Better Auth instance
 * per process keyed on *whether* AGMT_AUTH_DB is configured, not the URL
 * value — so two DB scenarios in one process would silently share a pool.
 * Running each scenario in its own process (with its own env) sidesteps
 * that entirely, which also matches how one real Worker isolate only ever
 * sees one configuration.
 *
 * Usage: node --experimental-strip-types auth-flow-fixture.ts <scenario>
 * Prints one JSON array of step results to stdout.
 */
import { auth, resolveExplicitBaseURL } from "../server.ts";

const VALID_ORIGIN = "http://localhost:8080";
const INVALID_ORIGIN = "https://evil.example.com";
const PASSWORD = "correct-horse-battery-staple";

type StepResult = {
  step: string;
  status: number;
  code?: string;
  elapsedMs: number;
};

async function timed(step: string, run: () => Promise<Response>): Promise<StepResult> {
  const start = Date.now();
  const response = await run();
  const elapsedMs = Date.now() - start;
  const text = await response.text();
  let code: string | undefined;
  try {
    code = text ? JSON.parse(text)?.code : undefined;
  } catch {
    /* non-JSON body — leave code undefined */
  }
  return { step, status: response.status, code, elapsedMs };
}

function signUp(email: string, origin: string): Promise<Response> {
  return auth.handler(
    new Request("http://localhost:8080/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ email, password: PASSWORD, name: email }),
    }),
  );
}

function signIn(email: string, password: string, origin: string): Promise<Response> {
  return auth.handler(
    new Request("http://localhost:8080/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ email, password }),
    }),
  );
}

function getSession(): Promise<Response> {
  return auth.handler(new Request("http://localhost:8080/api/auth/get-session"));
}

function sendVerificationEmail(email: string, origin: string): Promise<Response> {
  return auth.handler(
    new Request("http://localhost:8080/api/auth/send-verification-email", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ email, callbackURL: "/" }),
    }),
  );
}

async function markVerified(email: string): Promise<void> {
  const context = await auth.$context;
  const found = await context.internalAdapter.findUserByEmail(email.toLowerCase());
  if (!found) throw new Error(`fixture: user not found for ${email}`);
  await context.internalAdapter.updateUser(found.user.id, { emailVerified: true });
}

async function userId(response: Response): Promise<string | undefined> {
  try {
    return JSON.parse(await response.clone().text())?.user?.id;
  } catch {
    return undefined;
  }
}

async function happyPath(): Promise<StepResult[]> {
  const verifiedEmail = `verified-${Date.now()}@example.com`;
  const unverifiedEmail = `unverified-${Date.now()}@example.com`;
  const results: StepResult[] = [];

  results.push(await timed("sign-up-verified-user", () => signUp(verifiedEmail, VALID_ORIGIN)));
  await markVerified(verifiedEmail);

  results.push(await timed("sign-in-valid-origin-correct-password", () => signIn(verifiedEmail, PASSWORD, VALID_ORIGIN)));
  results.push(await timed("sign-in-wrong-password", () => signIn(verifiedEmail, "wrong-password-wrong-password", VALID_ORIGIN)));
  results.push(await timed("sign-in-invalid-origin", () => signIn(verifiedEmail, PASSWORD, INVALID_ORIGIN)));

  const firstSignUp = await signUp(unverifiedEmail, VALID_ORIGIN);
  const firstId = await userId(firstSignUp);
  results.push({ step: "sign-up-unverified-user", status: firstSignUp.status, elapsedMs: 0 });
  results.push(await timed("sign-in-unverified-user", () => signIn(unverifiedEmail, PASSWORD, VALID_ORIGIN)));

  // Documents a real Better Auth behaviour, not a bug in this app: signing
  // up again with an email that already exists returns a synthetic, fake
  // user (a fresh random id, not the original) to avoid revealing that the
  // email is taken — and never re-attempts sending the verification email.
  // A user re-submitting the sign-up form gets what looks like success and
  // no email, every time. send-verification-email (tested below) is the
  // actual resend path, which login.tsx now offers.
  const secondSignUp = await signUp(unverifiedEmail, VALID_ORIGIN);
  const secondId = await userId(secondSignUp);
  results.push({
    step: "sign-up-duplicate-email-is-synthetic",
    status: secondSignUp.status,
    code: firstId && secondId && firstId !== secondId ? "SYNTHETIC_ID" : "SAME_ID",
    elapsedMs: 0,
  });

  // Unlike sign-up, the dedicated resend endpoint has no such bypass: it
  // attempts a real send every time for an existing, unverified email.
  results.push(await timed("resend-verification-email-first", () => sendVerificationEmail(unverifiedEmail, VALID_ORIGIN)));
  results.push(await timed("resend-verification-email-again", () => sendVerificationEmail(unverifiedEmail, VALID_ORIGIN)));

  results.push(await timed("get-session-signed-out", () => getSession()));
  return results;
}

async function dbUnavailable(): Promise<StepResult[]> {
  return [await timed("sign-in-db-unavailable", () => signIn("anyone@example.com", PASSWORD, VALID_ORIGIN))];
}

const scenario = process.argv[2];

if (scenario === "resolve-base-url") {
  console.log(JSON.stringify({ value: resolveExplicitBaseURL() }));
  process.exit(0);
}

const run = scenario === "happy-path" ? happyPath : scenario === "db-unavailable" ? dbUnavailable : null;
if (!run) {
  console.error(`unknown scenario: ${scenario}`);
  process.exit(2);
}

run()
  .then((results) => {
    console.log(JSON.stringify(results));
    process.exit(0);
  })
  .catch((error) => {
    console.error("fixture failed:", error);
    process.exit(1);
  });
