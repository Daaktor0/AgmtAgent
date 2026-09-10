import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { APIError } from "better-auth/api";
import { AUTH_ERROR_CODES } from "./error-codes.ts";
import { sendResendVerificationEmail } from "./resend.server.ts";

const ORIGINAL_FETCH = globalThis.fetch;
const ENV_KEYS = ["RESEND_API_KEY", "AUTH_EMAIL_FROM", "AGMT_PUBLIC_URL", "BETTER_AUTH_URL"] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

async function expectEmailDeliveryFailed(promise: Promise<unknown>): Promise<void> {
  const error = await promise.then(
    () => assert.fail("expected sendResendVerificationEmail to reject"),
    (rejection: unknown) => rejection,
  );
  assert.ok(error instanceof APIError, `expected an APIError, got ${String(error)}`);
  assert.equal((error as APIError).body?.code, AUTH_ERROR_CODES.EMAIL_DELIVERY_FAILED);
  assert.ok((error as APIError).body?.message, "expected a user-facing message");
}

describe("sendResendVerificationEmail", () => {
  it("sends through Resend and resolves when the provider accepts the request", async () => {
    delete process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = "re_test_key";
    let capturedUrl: string | undefined;
    let capturedBody: string | undefined;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedBody = String(init?.body);
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    await sendResendVerificationEmail({
      user: { email: "user@example.com", name: "Ana" },
      url: "https://app.agmt.legal/api/auth/verify-email?token=abc",
    });

    assert.equal(capturedUrl, "https://api.resend.com/emails");
    const parsed = JSON.parse(capturedBody ?? "{}");
    assert.deepEqual(parsed.to, ["user@example.com"]);
    assert.match(parsed.html, /app\.agmt\.legal/);
  });

  it("throws EMAIL_DELIVERY_FAILED when RESEND_API_KEY is not configured", async () => {
    delete process.env.RESEND_API_KEY;
    await expectEmailDeliveryFailed(
      sendResendVerificationEmail({ user: { email: "user@example.com" }, url: "https://app.agmt.legal/verify" }),
    );
  });

  it("throws EMAIL_DELIVERY_FAILED, not a raw network error, when the provider request fails or times out", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    globalThis.fetch = (async () => {
      throw new DOMException("The operation was aborted.", "TimeoutError");
    }) as typeof fetch;

    await expectEmailDeliveryFailed(
      sendResendVerificationEmail({ user: { email: "user@example.com" }, url: "https://app.agmt.legal/verify" }),
    );
  });

  it("throws EMAIL_DELIVERY_FAILED on the production app host when AUTH_EMAIL_FROM is still the Resend test sender", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.AGMT_PUBLIC_URL = "https://app.agmt.legal";
    delete process.env.AUTH_EMAIL_FROM;
    let sent = false;
    globalThis.fetch = (async () => {
      sent = true;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    await expectEmailDeliveryFailed(
      sendResendVerificationEmail({ user: { email: "user@example.com" }, url: "https://app.agmt.legal/api/auth/verify-email?token=abc" }),
    );
    assert.equal(sent, false);
  });

  it("throws EMAIL_DELIVERY_FAILED, without leaking the response body, when the provider rejects the request", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ message: "invalid `from` field", name: "validation_error" }), {
        status: 422,
      })) as typeof fetch;

    await expectEmailDeliveryFailed(
      sendResendVerificationEmail({ user: { email: "user@example.com" }, url: "https://app.agmt.legal/verify" }),
    );
  });
});
