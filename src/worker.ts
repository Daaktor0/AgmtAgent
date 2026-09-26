import { Container, getContainer } from "@cloudflare/containers";
import { env } from "cloudflare:workers";

type WorkerEnv = Env & {
  DATABASE_URL?: string;
  POSTGRES_URL?: string;
  POSTGRES_PRISMA_URL?: string;
  BETTER_AUTH_DATABASE_URL?: string;
  AUTH_DATABASE_URL?: string;
  BETTER_AUTH_SECRET?: string;
  AGMT_ENCRYPTION_KEY?: string;
  AGMT_DB_ROLE?: string;
  AGMT_PUBLIC_URL?: string;
  GROK_AUTH_ISSUER?: string;
  GROK_AUTH_CLIENT_ID?: string;
  GROK_AUTH_CLIENT_SECRET?: string;
  RESEND_API_KEY?: string;
  AUTH_EMAIL_FROM?: string;
  AUTH_SUPPORT_EMAIL?: string;
  OPENROUTER_API_KEY?: string;
};

const PUBLIC_HOST = "agmt.dexterinlab.workers.dev";
const PUBLIC_URL = `https://${PUBLIC_HOST}`;

function workerValue(key: keyof WorkerEnv): string {
  const value = (env as WorkerEnv)[key];
  return typeof value === "string" ? value : "";
}

/**
 * One small-beta Agmt web instance. The Worker is the public edge entrypoint;
 * TanStack Start/Nitro listens on 8787 inside the Cloudflare Container.
 * Container disk is ephemeral: durable application state remains in managed
 * Postgres/object storage.
 */
export class AgmtContainer extends Container {
  defaultPort = 8787;
  sleepAfter = "30m";
  envVars = {
    NODE_ENV: "production",
    HOST: "0.0.0.0",
    PORT: "8787",

    // The current web runtime uses Vercel flags as its generic deployed-runtime
    // guard. Preserve the fail-closed production behavior until that guard is
    // made provider-neutral in a dedicated hardening change.
    VERCEL: "1",
    VERCEL_ENV: "production",
    VERCEL_PROJECT_PRODUCTION_URL: PUBLIC_HOST,

    VITE_AUTH_ENABLED: "true",
    AGMT_PUBLIC_URL: workerValue("AGMT_PUBLIC_URL") || PUBLIC_URL,
    AGMT_DB_ROLE: workerValue("AGMT_DB_ROLE") || "agmt_app",

    DATABASE_URL: workerValue("DATABASE_URL"),
    POSTGRES_URL: workerValue("POSTGRES_URL"),
    POSTGRES_PRISMA_URL: workerValue("POSTGRES_PRISMA_URL"),
    BETTER_AUTH_DATABASE_URL: workerValue("BETTER_AUTH_DATABASE_URL"),
    AUTH_DATABASE_URL: workerValue("AUTH_DATABASE_URL"),
    BETTER_AUTH_SECRET: workerValue("BETTER_AUTH_SECRET"),
    AGMT_ENCRYPTION_KEY: workerValue("AGMT_ENCRYPTION_KEY"),

    GROK_AUTH_ISSUER: workerValue("GROK_AUTH_ISSUER"),
    GROK_AUTH_CLIENT_ID: workerValue("GROK_AUTH_CLIENT_ID"),
    GROK_AUTH_CLIENT_SECRET: workerValue("GROK_AUTH_CLIENT_SECRET"),
    RESEND_API_KEY: workerValue("RESEND_API_KEY"),
    AUTH_EMAIL_FROM: workerValue("AUTH_EMAIL_FROM"),
    AUTH_SUPPORT_EMAIL: workerValue("AUTH_SUPPORT_EMAIL"),

    // Preserve an already-created secret so a deploy does not destroy the
    // legacy binding.
    OPENROUTER_API_KEY: workerValue("OPENROUTER_API_KEY"),
  };
}

export default {
  async fetch(request: Request, workerEnv: WorkerEnv): Promise<Response> {
    const container = getContainer(workerEnv.AGMT, "primary");
    return container.fetch(request);
  },
};
