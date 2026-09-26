/**
 * Structured logs. MUST NOT contain document text, quotes, prompts, map values,
 * or signed blob URLs (SPEC §10.3 / §10.4).
 */

type Meta = Record<string, string | number | boolean | null | undefined>;

export function auditLog(action: string, meta: Meta = {}): void {
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined) continue;
    const key = k.toLowerCase();
    if (
      key.includes("quote") ||
      key.includes("text") ||
      key.includes("prompt") ||
      key.includes("body") ||
      key.includes("map_value") ||
      key.includes("identifier") ||
      key.includes("ciphertext")
    ) {
      continue;
    }
    safe[k] = v;
  }
  console.info(JSON.stringify({ src: "agmt", action, ...safe }));
}
