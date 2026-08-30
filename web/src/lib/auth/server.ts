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

const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

const deployed = Boolean(env("VERCEL") || env("VERCEL_ENV"));
const applicationDatabaseUrl =
  env("DATABASE_URL") ?? env("POSTGRES_URL") ?? env("POSTGRES_PRISMA_URL");
const authDatabaseUrl =
  env("BETTER_AUTH_DATABASE_URL") ??
  env("AUTH_DATABASE_URL") ??
  applicationDatabaseUrl;
if (deployed && !authDatabaseUrl) {
  throw new Error(
    "Agmt auth requires persistent Postgres on Vercel. Set BETTER_AUTH_DATABASE_URL or AUTH_DATABASE_URL.",
  );
}


const configuredAuthSecret = env("BETTER_AUTH_SECRET");
if (deployed && !configuredAuthSecret) {
  throw new Error("BETTER_AUTH_SECRET is required in deployed environments.");
}
const authSecret = configuredAuthSecret ?? randomBytes(32).toString("hex");

const authDisabled = env("VITE_AUTH_ENABLED") === "false";
const grokIssuer = env("GROK_AUTH_ISSUER") ?? "https://auth.grok.me";
const grokClientId = env("GROK_AUTH_CLIENT_ID");
const grokClientSecret = env("GROK_AUTH_CLIENT_SECRET");

export const authConfigured =
  !authDisabled && Boolean(grokClientId && grokClientSecret);

const explicitBaseURL = env("BETTER_AUTH_URL") ?? env("AGMT_PUBLIC_URL");
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

const vercelHosts = [
  hostOnly(env("VERCEL_PROJECT_PRODUCTION_URL")),
  hostOnly(env("VERCEL_URL")),
].filter((value): value is string => Boolean(value));
const explicitHost = hostOnly(explicitBaseURL);

// Public production alias for the app. Keep this exact rather than trusting a
// wildcard such as *.vercel.app, which would weaken sibling-app isolation.
const AGMT_PRODUCTION_HOSTS = ["agmt-web.vercel.app"];

const deployedAllowedHosts = [...new Set([
  ...vercelHosts,
  ...AGMT_PRODUCTION_HOSTS,
  ...(explicitHost ? [explicitHost] : []),
])];

const baseURL = deployed
  ? {
      allowedHosts: deployedAllowedHosts,
      protocol: "https" as const,
      fallback: explicitBaseURL ?? "https://agmt-web.vercel.app",
    }
  : explicitBaseURL ?? {
      allowedHosts: [...previewAllowedHosts, "localhost", "127.0.0.1", "[::1]"],
      protocol: "auto" as const,
      fallback: "http://localhost:8080",
    };

const trustedOrigins = deployed
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

const issuerBase = grokIssuer.replace(/\/+$/, "");
const grokAuthorizationUrl = `${issuerBase}/api/auth/oauth2/authorize`;
const grokTokenUrl = `${issuerBase}/api/auth/oauth2/token`;
const grokUserInfoUrl = `${issuerBase}/api/auth/oauth2/userinfo`;

const database = authDatabaseUrl
  ? new Pool({
      connectionString: authDatabaseUrl,
      max: 4,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      allowExitOnIdle: true,
    })
  : { dialect: pgliteDialect(() => getPglite()), type: "postgres" as const };

export const SESSION_TOKEN_COOKIE = "__Host-grok-auth.session_token";

const grokOAuthPlugin = authConfigured
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

export const auth = betterAuth({
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

export function readSessionToken(): string | null {
  return getCookie(SESSION_TOKEN_COOKIE) ?? null;
}

export { GROK_PROVIDERS } from "./providers";
