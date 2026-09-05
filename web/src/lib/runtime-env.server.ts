/**
 * Server-only access to deployment configuration.
 *
 * Node hosts expose configuration through process.env. Cloudflare Workers
 * expose bindings and vars through the request environment, which Nitro
 * places on globalThis.__env__ before invoking the application handler. Keep
 * this lookup lazy: Worker modules are evaluated before the first request and
 * therefore cannot safely read Cloudflare bindings at module scope.
 */

type RuntimeBinding = {
  connectionString?: unknown;
};

type RuntimeEnvironment = Record<string, unknown>;

function cloudflareEnvironment(): RuntimeEnvironment | undefined {
  const value = (globalThis as typeof globalThis & { __env__?: unknown }).__env__;
  return value && typeof value === "object"
    ? (value as RuntimeEnvironment)
    : undefined;
}

export function serverEnv(key: string): string | undefined {
  const processValue =
    typeof process !== "undefined" ? process.env[key]?.trim() : undefined;
  if (processValue) return processValue;

  const runtimeValue = cloudflareEnvironment()?.[key];
  if (typeof runtimeValue !== "string") return undefined;
  const value = runtimeValue.trim();
  return value || undefined;
}

export function hyperdriveConnectionString(
  bindingName: string,
): string | undefined {
  const binding = cloudflareEnvironment()?.[bindingName] as
    | RuntimeBinding
    | undefined;
  if (!binding || typeof binding !== "object") return undefined;
  const value = binding.connectionString;
  if (typeof value !== "string") return undefined;
  const connectionString = value.trim();
  return connectionString || undefined;
}

export const AGMT_APP_DB_BINDING = "AGMT_APP_DB";
export const AGMT_AUTH_DB_BINDING = "AGMT_AUTH_DB";

export function applicationDatabaseConnectionString(): string | undefined {
  return (
    hyperdriveConnectionString(AGMT_APP_DB_BINDING) ??
    serverEnv("DATABASE_URL") ??
    serverEnv("POSTGRES_URL") ??
    serverEnv("POSTGRES_PRISMA_URL")
  );
}

export function authDatabaseConnectionString(): string | undefined {
  return (
    hyperdriveConnectionString(AGMT_AUTH_DB_BINDING) ??
    serverEnv("BETTER_AUTH_DATABASE_URL") ??
    serverEnv("AUTH_DATABASE_URL")
  );
}
