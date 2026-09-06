/** Self-hosted Better Auth for Agmt. Server-only. */
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { getCookie } from "@tanstack/react-start/server";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { getPglite } from "../db.ts";
import {
  AUTH_DB_CONNECT_TIMEOUT_MS,
  AUTH_DB_QUERY_TIMEOUT_MS,
  guardAuthPool,
} from "./db-guard.server.ts";
import { emailAndPasswordEnabled } from "./email-password.ts";
import { pgliteDialect } from "./pglite-dialect.ts";
import { sendResendVerificationEmail } from "./resend.server.ts";
import {
  applicationDatabaseConnectionString,
  authDatabaseConnectionString,
  serverEnv,
} from "../runtime-env.server.ts";

// The authDatabaseUrl is resolved lazily by authDatabaseConnectionString;
// it keeps BETTER_AUTH_DATABASE_URL/AUTH_DATABASE_URL separate from the
// application DATABASE_URL and selects AGMT_AUTH_DB on Cloudflare.

function deployed(): boolean {
  return Boolean(
    serverEnv("VERCEL") ||
      serverEnv("VERCEL_ENV") ||
      serverEnv("CF_PAGES") ||
      serverEnv("CLOUDFLARE_ENV") ||
      (typeof navigator === "object" &&
        navigator !== null &&
        navigator.userAgent === "Cloudflare-Workers"),
  );
}

function runtimeEnvironmentPresent(): boolean {
  const value = (globalThis as typeof globalThis & { __env__?: unknown }).__env__;
  return Boolean(value && typeof value === "object");
}

export function isAuthConfigured(): boolean {
  return (
    serverEnv("VITE_AUTH_ENABLED") !== "false" &&
    emailAndPasswordEnabled
  );
}

// Retain the boolean export used by existing local callers. Server-side
// request guards use isAuthConfigured() when they need a lazy Worker lookup.
export const authConfigured = isAuthConfigured();

const previewAllowedHosts: string[] = ["*.grok-sandbox.com"];
const LOCAL_DEV_ORIGINS = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://[::1]:8080",
];

function hostOnly(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).host;
  } catch {
    return null;
  }
}

export const SESSION_TOKEN_COOKIE = "__Host-grok-auth.session_token";

/**
 * The canonical public app origin, used for Better Auth's `baseURL` (and so
 * for every generated link, including the Resend email-verification URL).
 * AGMT_PUBLIC_URL is authoritative; BETTER_AUTH_URL is a compatibility
 * fallback for an older Worker URL and must never win over the current
 * custom domain (see commit "fix(auth): trust the app custom domain").
 */
export function resolveExplicitBaseURL(): string | undefined {
  return serverEnv("AGMT_PUBLIC_URL") ?? serverEnv("BETTER_AUTH_URL");
}

function createAuth() {
  const isDeployed = deployed();
  const applicationDatabaseUrl = applicationDatabaseConnectionString();
  const dedicatedAuthDatabaseUrl = authDatabaseConnectionString();
  // Cloudflare validates a Worker bundle in an environment where navigator
  // identifies Workers but request bindings have not been installed yet. Use
  // the local adapter for that validation-only bootstrap; a real request with
  // missing bindings still fails closed below.
  if (isDeployed && runtimeEnvironmentPresent() && (!applicationDatabaseUrl || !dedicatedAuthDatabaseUrl)) {
    throw new Error(
      "Agmt requires separate application and Better Auth Postgres connections. Configure AGMT_APP_DB and AGMT_AUTH_DB Hyperdrive bindings or their dedicated URL secrets.",
    );
  }

  const configuredAuthSecret = serverEnv("BETTER_AUTH_SECRET");
  if (isDeployed && runtimeEnvironmentPresent() && !configuredAuthSecret) {
    throw new Error("BETTER_AUTH_SECRET is required in deployed environments.");
  }
  const authSecret = configuredAuthSecret ?? randomBytes(32).toString("hex");
  const explicitBaseURL = resolveExplicitBaseURL();
  const vercelHosts = [
    hostOnly(serverEnv("VERCEL_PROJECT_PRODUCTION_URL")),
    hostOnly(serverEnv("VERCEL_URL")),
  ].filter((value): value is string => Boolean(value));
  const explicitHost = hostOnly(explicitBaseURL);

  // Public production alias for the app. Keep this exact rather than trusting
  // a wildcard such as *.vercel.app, which would weaken sibling-app isolation.
  const AGMT_PRODUCTION_HOSTS = [
    "app.agmt.legal",
    "agmt-web.vercel.app",
    "agmt.dexterinlab.workers.dev",
  ];
  const deployedAllowedHosts = [
    ...new Set([
      ...vercelHosts,
      ...AGMT_PRODUCTION_HOSTS,
      ...(explicitHost ? [explicitHost] : []),
    ]),
  ];
  const baseURL = isDeployed
    ? {
        allowedHosts: deployedAllowedHosts,
        protocol: "https" as const,
        fallback: explicitBaseURL ?? "https://agmt-web.vercel.app",
      }
    : explicitBaseURL ?? {
        allowedHosts: ["*.grok-sandbox.com", "localhost", "127.0.0.1", "[::1]"],
        protocol: "auto" as const,
        fallback: "http://localhost:8080",
      };
  const trustedOrigins = isDeployed
    ? [
        ...new Set([
          ...(explicitBaseURL ? [explicitBaseURL] : []),
          ...deployedAllowedHosts.map((host) => `https://${host}`),
        ]),
      ]
    : explicitBaseURL
      ? [explicitBaseURL, ...LOCAL_DEV_ORIGINS]
      : [
          ...previewAllowedHosts,
          ...previewAllowedHosts.flatMap((host) => [`https://${host}`, `http://${host}`]),
          ...LOCAL_DEV_ORIGINS,
        ];

  const database = dedicatedAuthDatabaseUrl
    ? guardAuthPool(
        new Pool({
          connectionString: dedicatedAuthDatabaseUrl,
          max: 4,
          idleTimeoutMillis: 10_000,
          connectionTimeoutMillis: AUTH_DB_CONNECT_TIMEOUT_MS,
          // Server-side backstop so Postgres itself kills a runaway query,
          // in addition to guardAuthPool()'s own client-side race.
          statement_timeout: AUTH_DB_QUERY_TIMEOUT_MS,
          query_timeout: AUTH_DB_QUERY_TIMEOUT_MS,
          allowExitOnIdle: true,
        }),
      )
    : {
        dialect: pgliteDialect(() => getPglite()),
        type: "postgres" as const,
      };
  return betterAuth({
    baseURL,
    secret: authSecret,
    database,
    trustedOrigins,
    account: { encryptOAuthTokens: true },
    session: { cookieCache: { enabled: true, maxAge: 300 } },
    ...(emailAndPasswordEnabled
      ? {
          emailAndPassword: {
            enabled: true,
            requireEmailVerification: true,
            minPasswordLength: 12,
            autoSignIn: false,
          },
        }
      : {}),
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      expiresIn: 3600,
      sendVerificationEmail: async ({ user, url }) =>
        sendResendVerificationEmail({ user, url }),
    },
    advanced: {
      useSecureCookies: false,
      defaultCookieAttributes: { secure: true, sameSite: "lax", path: "/" },
      cookies: {
        session_token: { name: SESSION_TOKEN_COOKIE },
        session_data: { name: "__Host-grok-auth.session_data" },
        account_data: { name: "__Host-grok-auth.account_data" },
        dont_remember: { name: "__Host-grok-auth.dont_remember" },
      },
    },
    plugins: [
      bearer(),
      tanstackStartCookies(),
    ],
  });
}

type AuthInstance = ReturnType<typeof createAuth>;

let authInstance: AuthInstance | undefined;
let authInstanceRuntimeKey: string | undefined;
function getAuth(): AuthInstance {
  const runtimeKey = [
    runtimeEnvironmentPresent() ? "runtime" : "bootstrap",
    applicationDatabaseConnectionString() ? "app-db" : "no-app-db",
    authDatabaseConnectionString() ? "auth-db" : "no-auth-db",
    serverEnv("BETTER_AUTH_SECRET") ? "secret" : "no-secret",
  ].join(":");
  if (!authInstance || authInstanceRuntimeKey !== runtimeKey) {
    authInstance = createAuth();
    authInstanceRuntimeKey = runtimeKey;
  }
  return authInstance;
}

// Nitro populates Cloudflare's request environment immediately before route
// handling. A lazy proxy preserves the existing `auth.api`/`auth.handler`
// contract while deferring Better Auth's database pool until that point.
export const auth = new Proxy({} as AuthInstance, {
  get(_target, property) {
    const instance = getAuth();
    const value = Reflect.get(instance, property, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export function readSessionToken(): string | null {
  return getCookie(SESSION_TOKEN_COOKIE) ?? null;
}
