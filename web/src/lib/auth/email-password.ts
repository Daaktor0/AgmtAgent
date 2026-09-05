/**
 * Local email/password sign-in (this app's Better Auth DB — not the broker).
 *
 * Enabled for the deployed Cloudflare app. Email verification remains a
 * separate product boundary: a password account may authenticate, but the
 * server's `requireVerified` guard will not allow document access until the
 * account's email is verified.
 */
export const emailAndPasswordEnabled = true;
