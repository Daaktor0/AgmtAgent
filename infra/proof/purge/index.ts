/**
 * Independent Proof purge Worker (PWC-27). List/delete only. Writes a health
 * receipt onto R2 so admission can see that purge is alive.
 */
import { dueKeys } from "./worker.ts";

type PurgeEnv = {
  PROOF_OBJECTS: {
    list(input: { prefix: string; cursor?: string; limit: number }): Promise<{
      objects: Array<{ key: string; customMetadata?: Record<string, string> }>;
      truncated: boolean;
      cursor?: string;
    }>;
    delete(key: string): Promise<void>;
    put(key: string, value: string): Promise<void>;
  };
};

function deadlineFromKey(key: string): number | null {
  const match = /^proof\/v2\/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})\//.exec(key);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
}

async function sweep(env: PurgeEnv, now: number): Promise<number> {
  let cursor: string | undefined;
  let deleted = 0;
  const seen: Array<{ key: string; deadlineMs: number }> = [];
  do {
    const page = await env.PROOF_OBJECTS.list({ prefix: "proof/v2/", cursor, limit: 100 });
    for (const object of page.objects) {
      const fromMeta = Number(object.customMetadata?.deadlineMs ?? "");
      const deadlineMs = Number.isFinite(fromMeta) && fromMeta > 0 ? fromMeta : deadlineFromKey(object.key);
      if (deadlineMs == null) continue;
      seen.push({ key: object.key, deadlineMs });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  for (const key of dueKeys(seen, now)) {
    await env.PROOF_OBJECTS.delete(key);
    deleted += 1;
  }
  return deleted;
}

export default {
  async fetch(): Promise<Response> {
    return new Response("agmt-proof-purge", { headers: { "cache-control": "no-store" } });
  },
  async scheduled(_event: unknown, env: PurgeEnv): Promise<void> {
    const now = Date.now();
    await sweep(env, now);
    await env.PROOF_OBJECTS.put("proof/health/purge.json", JSON.stringify({
      signal: "purge",
      readyAt: now,
      version: "proof-purge-v1",
    }));
  },
};
