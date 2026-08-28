import { createHmac } from "node:crypto";
import { auth, SESSION_TOKEN_COOKIE } from "@/lib/auth/server";

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

  // Match better-call's cookie signature: HMAC-SHA256, standard base64, padded.
  // getSignedCookie requires signature.length === 44 and a trailing '='.
  const signature = createHmac("sha256", ctx.secret).update(session.token).digest("base64");
  const signed = `${session.token}.${signature}`;

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
