import { auth, SESSION_TOKEN_COOKIE } from "@/lib/auth/server";

/**
 * Sign a Better Auth session token the way better-call does: WebCrypto
 * HMAC-SHA256, standard base64 with padding (length 44, trailing '=').
 * The live-preview popup posts the decoded cookie value as the bearer, so
 * we return the same `token.signature` shape (not URI-encoded).
 */
async function signSessionToken(token: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuf)));
  return `${token}.${signature}`;
}

/**
 * Open a Better Auth session for a verified email user.
 *
 * Magic-link is a product-layer flow (SPEC §10.1) — the sandbox auth skill
 * forbids wiring Better Auth's own magic-link plugin — so we create the
 * identity/session through Better Auth's adapter and emit the same signed
 * cookie value the Google popup posts as a bearer token.
 */
export async function openVerifiedEmailSession(email: string): Promise<{
  userId: string;
  sessionToken: string;
}> {
  const ctx = await auth.$context;
  const normalised = email.trim().toLowerCase();
  const found = await ctx.internalAdapter.findUserByEmail(normalised);
  let userId: string;
  if (!found) {
    const user = await ctx.internalAdapter.createUser({
      email: normalised,
      name: normalised,
      emailVerified: true,
    });
    if (!user?.id) throw new Error("Could not create an account.");
    userId = user.id;
    await ctx.internalAdapter.createAccount({
      userId,
      accountId: normalised,
      providerId: "email_magic_link",
    });
  } else {
    userId = found.user.id;
    if (!found.user.emailVerified) {
      await ctx.internalAdapter.updateUser(userId, { emailVerified: true });
    }
  }

  const session = await ctx.internalAdapter.createSession(userId);
  if (!session?.token) throw new Error("Could not open a session.");

  const signed = await signSessionToken(session.token, ctx.secret);

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

  return { userId, sessionToken: signed };
}
