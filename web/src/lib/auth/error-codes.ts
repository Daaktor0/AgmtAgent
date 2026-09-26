/**
 * Stable, non-sensitive auth error codes shared by the server (thrown as
 * Better Auth `APIError` bodies) and the client (`routes/login.tsx`).
 *
 * Values for INVALID_ORIGIN / INVALID_CREDENTIALS / EMAIL_NOT_VERIFIED match
 * Better Auth's own built-in error codes exactly (see
 * `@better-auth/core/error`'s `BASE_ERROR_CODES.INVALID_ORIGIN`,
 * `.INVALID_EMAIL_OR_PASSWORD`, `.EMAIL_NOT_VERIFIED`) so the client can
 * recognise them without this app inventing a second name for the same
 * failure. AUTH_DATABASE_UNAVAILABLE / AUTH_REQUEST_TIMEOUT / EMAIL_DELIVERY_FAILED
 * are this app's own codes, thrown from `db-guard.server.ts` and
 * `resend.server.ts` in place of the bodiless 500 Better Auth's router
 * otherwise returns for a thrown non-APIError.
 */
export const AUTH_ERROR_CODES = {
  INVALID_ORIGIN: "INVALID_ORIGIN",
  INVALID_CREDENTIALS: "INVALID_EMAIL_OR_PASSWORD",
  EMAIL_NOT_VERIFIED: "EMAIL_NOT_VERIFIED",
  AUTH_DATABASE_UNAVAILABLE: "AUTH_DATABASE_UNAVAILABLE",
  AUTH_REQUEST_TIMEOUT: "AUTH_REQUEST_TIMEOUT",
  EMAIL_DELIVERY_FAILED: "EMAIL_DELIVERY_FAILED",
} as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];
