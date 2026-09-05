/** Self-hosted Better Auth for Agmt. Server-only. */
import { betterAuth } from "better-auth";
import { bearer, genericOAuth } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { getCookie } from "@tanstack/react-start/server";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { getPglite } from "../db";
import { emailAndPasswordEnabled } from "./email-password";
import { GROK_PROVIDERS } from "./providers";
import { pgliteDialect } from "./pglite-dialect";
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

export function isAuthConfigured(): boolean {
  return (
    serverEnv("VITE_AUTH_ENABLED") !== "false" &&
    Boolean(serverEnv("GROK_AUTH_CLIENT_ID") && serverEnv("GROK_AUTH_CLIENT_SECRET"))
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

function createAuth() {
  const isDeployed = deployed();
  const applicationDatabaseUrl = applicationDatabaseConnectionString();
  const dedicatedAuthDatabaseUrl = authDatabaseConnectionString();
  if (isDeployed && (!applicationDatabaseUrl || !dedicatedAuthDatabaseUrl)) {
    throw new Error(
      "Agmt requires separate application and Better Auth Postgres connections. Configure AGMT_APP_DB and AGMT_AUTH_DB Hyperdrive bindings or their dedicated URL secrets.",
    );
  }

  const configuredAuthSecret = serverEnv("BETTER_AUTH_SECRET");
  if (isDeployed && !configuredAuthSecret) {
    throw new Error("BETTER_AUTH_SECRET is required in deployed environments.");
  }
  const authSecret = configuredAuthSecret ?? randomBytes(32).toString("hex");
  const explicitBaseURL = serverEnv("BETTER_AUTH_URL") ?? serverEnv("AGMT_PUBLIC_URL");
  const vercelHosts = [
    hostOnly(serverEnv("VERCEL_PROJECT_PRODUCTION_URL")),
    hostOnly(serverEnv("VERCEL_URL")),
  ].filter((value): value is string => Boolean(value));
  const explicitHost = hostOnly(explicitBaseURL);

  // Public production alias for the app. Keep this exact rather than trusting
  // a wildcard such as *.vercel.app, which would weaken sibling-app isolation.
  const AGMT_PRODUCTION_HOSTS = [
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

  const grokIssuer = serverEnv("GROK_AUTH_ISSUER") ?? "https://auth.grok.me";
  const issuerBase = grokIssuer.replace(/\/+$/, "");
  const grokAuthorizationUrl = `${issuerBase}/api/auth/oauth2/authorize`;
  const grokTokenUrl = `${issuerBase}/api/auth/oauth2/token`;
  const grokUserInfoUrl = `${issuerBase}/api/auth/oauth2/userinfo`;
  const database = dedicatedAuthDatabaseUrl
    ? new Pool({
        connectionString: dedicatedAuthDatabaseUrl,
        max: 4,
        idleTimeoutMillis: 10_000,
        connectionTimeoutMillis: 5_000,
        allowExitOnIdle: true,
      })
    : {
        dialect: pgliteDialect(() => getPglite()),
        type: "postgres" as const,
      };
  const grokClientId = serverEnv("GROK_AUTH_CLIENT_ID");
  const grokClientSecret = serverEnv("GROK_AUTH_CLIENT_SECRET");
  const grokOAuthPlugin = isAuthConfigured()
    ? genericOAuth({
        config: GROK_PROVIDERS.map(({ providerId, idp }) => ({
          providerId,
          clientId: grokClientId as string,
          clientSecret: grokClientSecret as string,
          authorizationUrl: grokAuthorizationUrl,
          tokenUrl: grokTokenUrl,
          userInfoUrl: grokUserInfoUrl,
          scopes: ["openid", "profile", "email"],
          authorizationUrlParams: { idp, prompt: "login" },
        })),
      })
    : null;

  return betterAuth({
    baseURL,
    secret: authSecret,
    database,
    trustedOrigins,
    account: {
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        trustedProviders: [
          ...GROK_PROVIDERS.map((provider) => provider.providerId),
        ],
        requireLocalEmailVerified: false,
      },
    },
    session: { cookieCache: { enabled: true, maxAge: 300 } },
    ...(emailAndPasswordEnabled ? { emailAndPassword: { enabled: true } } : {}),
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
      ...(grokOAuthPlugin ? [grokOAuthPlugin] : []),
      bearer(),
      tanstackStartCookies(),
    ],
  });
}

type AuthInstance = ReturnType<typeof createAuth>;

let authInstance: AuthInstance | undefined;
function getAuth(): AuthInstance {
  authInstance ??= createAuth();
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

export { GROK_PROVIDERS } from "./providers";
