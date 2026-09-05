/**
 * Local email/password sign-in (this app's Better Auth DB — not the broker).
 *
 * Enabled for the deployed Cloudflare app. Resend delivers the Better Auth
 * verification link before document access is allowed by `requireVerified`.
 */
export const emailAndPasswordEnabled = true;
