import { randomUUID } from "node:crypto";
import { auth, SESSION_TOKEN_COOKIE } from "@/lib/auth/server";

async function signSessionToken(token: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(token),
  );
  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
  return `${token}.${signature}`;
}

async function setSessionCookie(signed: string): Promise<void> {
  try {
    const { setCookie } = await import("@tanstack/react-start/server");
    setCookie(SESSION_TOKEN_COOKIE, signed, {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
    });
  } catch {
    /* no request context (tests) */
  }
}

/**
 * Open a Better Auth session only after the production magic-link verifier has
 * atomically consumed a delivered token. The optional parameter intentionally
 * makes the old preview-only verifier fail closed without breaking compilation.
 */
export async function openVerifiedEmailSession(
  email: string,
  verification?: { source: "delivered_magic_link" },
): Promise<{ userId: string; sessionToken: string }> {
  if (verification?.source !== "delivered_magic_link") {
    throw new Error("Email session creation requires a consumed delivered magic link.");
  }

  const context = await auth.$context;
  const normalised = email.trim().toLowerCase();
  const found = await context.internalAdapter.findUserByEmail(normalised);
  let userId: string;

  if (!found) {
    const user = await context.internalAdapter.createUser({
      email: normalised,
      name: normalised,
      emailVerified: true,
    });
    if (!user?.id) throw new Error("Could not create an account.");
    userId = user.id;
    await context.internalAdapter.createAccount({
      userId,
      accountId: normalised,
      providerId: "email_magic_link",
    });
  } else {
    userId = found.user.id;
    if (!found.user.emailVerified) {
      await context.internalAdapter.updateUser(userId, { emailVerified: true });
    }
  }

  const session = await context.internalAdapter.createSession(userId);
  if (!session?.token) throw new Error("Could not open a session.");
  const signed = await signSessionToken(session.token, context.secret);
  await setSessionCookie(signed);

  return { userId, sessionToken: signed };
}

/**
 * Temporary open-access mode used only while Agmt is being product-tested.
 *
 * There is deliberately no shared "dev-user" on the production database. Each
 * browser receives a fresh Better Auth identity and HttpOnly session, so its
 * Matters and documents remain isolated by owner_user_id even though there is
 * no interactive login step. Remove this helper when normal sign-in is restored.
 */
export async function openAnonymousTestSession(): Promise<{ userId: string }> {
  const context = await auth.$context;
  const nonce = randomUUID();
  const email = `tester-${nonce}@test.agmt.local`;
  const user = await context.internalAdapter.createUser({
    email,
    name: "Test workspace",
    emailVerified: true,
  });
  if (!user?.id) throw new Error("Could not create a test workspace.");

  await context.internalAdapter.createAccount({
    userId: user.id,
    accountId: nonce,
    providerId: "temporary_test_access",
  });

  const session = await context.internalAdapter.createSession(user.id);
  if (!session?.token) throw new Error("Could not open a test workspace session.");
  const signed = await signSessionToken(session.token, context.secret);
  await setSessionCookie(signed);
  return { userId: user.id };
}
