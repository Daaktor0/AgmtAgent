/** Self-hosted Better Auth for Agmt. Server-only. */
import { betterAuth } from "better-auth";
import { bearer, genericOAuth } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { getCookie } from "@tanstack/react-start/server";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { ensureDbReady, getPglite } from "../db";
import { emailAndPasswordEnabled } from "./email-password";
import { GATE_PROVIDER_ID, gateIdentitySessions } from "./gate-session.server";
import { GROK_PROVIDERS } from "./providers";
import { pgliteDialect } from "./pglite-dialect";
import {
  GROK_ISSUER_DEFAULT,
  PREVIEW_ALLOWED_HOSTS,
  PREVIEW_CLIENT_ID,
  PREVIEW_CLIENT_SECRET,
} from "./preview";

const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

const deployed = Boolean(env("VERCEL") || env("VERCEL_ENV"));
const databaseUrl =
  env("DATABASE_URL") ?? env("POSTGRES_URL") ?? env("POSTGRES_PRISMA_URL");
if (deployed && !databaseUrl) {
  throw new Error(
    "Agmt auth requires persistent Postgres on Vercel. Set DATABASE_URL or POSTGRES_URL.",
  );
}

void ensureDbReady();

const globalAuthRef = globalThis as typeof globalThis & {
  __grokAuthPreviewSecret__?: string;
};
function previewAuthSecret(): string {
  globalAuthRef.__grokAuthPreviewSecret__ ??= randomBytes(32).toString("hex");
  return globalAuthRef.__grokAuthPreviewSecret__;
}

const configuredAuthSecret = env("BETTER_AUTH_SECRET");
if (deployed && !configuredAuthSecret) {
  throw new Error("BETTER_AUTH_SECRET is required for deployed Agmt sessions.");
}
const authSecret = configuredAuthSecret ?? previewAuthSecret();

const authDisabled = env("VITE_AUTH_ENABLED") === "false";
const grokIssuer = env("GROK_AUTH_ISSUER") ?? GROK_ISSUER_DEFAULT;
// The shared preview OAuth client is intentionally never used in production.
const grokClientId = env("GROK_AUTH_CLIENT_ID") ?? (!deployed ? PREVIEW_CLIENT_ID : undefined);
const grokClientSecret =
  env("GROK_AUTH_CLIENT_SECRET") ?? (!deployed ? PREVIEW_CLIENT_SECRET : undefined);

export const authConfigured =
  !authDisabled && Boolean(grokClientId && grokClientSecret);

const explicitBaseURL = env("BETTER_AUTH_URL") ?? env("AGMT_PUBLIC_URL");
const previewAllowedHosts: string[] = [...PREVIEW_ALLOWED_HOSTS];
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
const deployedAllowedHosts = [...new Set([
  ...vercelHosts,
  ...(explicitHost ? [explicitHost] : []),
])];

// Better Auth validates the host before constructing callbacks. On Vercel use
// exact project/deployment hosts from Vercel's own environment rather than an
// open Host-header wildcard. This fixes the production "Invalid origin" error.
const baseURL = deployed
  ? {
      allowedHosts: deployedAllowedHosts,
      protocol: "https" as const,
      ...(explicitBaseURL ? { fallback: explicitBaseURL } : {}),
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

const database = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
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
        GATE_PROVIDER_ID,
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
    gateIdentitySessions(),
    ...(grokOAuthPlugin ? [grokOAuthPlugin] : []),
    bearer(),
    tanstackStartCookies(),
  ],
});

export function readSessionToken(): string | null {
  return getCookie(SESSION_TOKEN_COOKIE) ?? null;
}

export { GROK_PROVIDERS } from "./providers";
