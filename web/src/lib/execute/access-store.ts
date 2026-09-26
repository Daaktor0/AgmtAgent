/**
 * The beta's approved list: one record per email address that asked for
 * access, with the founder's decision. Kept in Cloudflare KV (binding
 * AGMT_ACCESS) in production; in local development and tests, in memory.
 *
 * A record holds only what the person typed into the access form, plus the
 * decision and its dates. No document, file name or page text is ever here.
 */
import { runtimeBinding } from "../runtime-env.server.ts";
import { normaliseEmail } from "./access.ts";

export type AccessStatus = "requested" | "approved" | "not_yet" | "declined";

export type AccessRecord = {
  email: string;
  name: string;
  firm?: string;
  note?: string;
  status: AccessStatus;
  requestedAt: string;
  decidedAt?: string;
  updatedAt: string;
};

export interface AccessStore {
  get(email: string): Promise<AccessRecord | null>;
  put(record: AccessRecord): Promise<void>;
}

/** The part of Cloudflare's KVNamespace this uses. */
export type KvLike = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
};

export const ACCESS_BINDING = "AGMT_ACCESS";
const keyFor = (email: string) => `access:v1:${normaliseEmail(email)}`;

export function kvAccessStore(kv: KvLike): AccessStore {
  return {
    async get(email) {
      const raw = await kv.get(keyFor(email));
      if (!raw) return null;
      try {
        return JSON.parse(raw) as AccessRecord;
      } catch {
        return null;
      }
    },
    async put(record) {
      await kv.put(keyFor(record.email), JSON.stringify({ ...record, email: normaliseEmail(record.email) }));
    },
  };
}

export function memoryAccessStore(map = new Map<string, string>()): AccessStore {
  return kvAccessStore({
    get: async (k) => map.get(k) ?? null,
    put: async (k, v) => {
      map.set(k, v);
    },
  });
}

export class AccessStoreUnavailable extends Error {
  constructor() {
    super(`The ${ACCESS_BINDING} KV binding is not configured`);
    this.name = "AccessStoreUnavailable";
  }
}

function cloudflareWorkerRuntime(): boolean {
  return typeof navigator === "object" && navigator !== null && navigator.userAgent === "Cloudflare-Workers";
}

const devStore = globalThis as typeof globalThis & { __agmtAccessMemory__?: Map<string, string> };
let override: AccessStore | null = null;

/** Tests swap in their own store. */
export function setAccessStoreForTests(store: AccessStore | null): void {
  override = store;
}

/**
 * The store for this request. In the Worker a missing binding is an error,
 * never a silent in-memory fallback that would forget approvals.
 */
export function accessStore(): AccessStore {
  if (override) return override;
  const kv = runtimeBinding<KvLike>(ACCESS_BINDING);
  if (kv && typeof kv.get === "function") return kvAccessStore(kv);
  if (cloudflareWorkerRuntime()) throw new AccessStoreUnavailable();
  devStore.__agmtAccessMemory__ ??= new Map();
  return memoryAccessStore(devStore.__agmtAccessMemory__);
}

export function accessStoreConfigured(): boolean {
  const kv = runtimeBinding<KvLike>(ACCESS_BINDING);
  return Boolean(kv && typeof kv.get === "function");
}
