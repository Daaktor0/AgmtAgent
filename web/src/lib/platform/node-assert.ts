function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return false;
  return true;
}

function fail(message?: string): never {
  throw new Error(message || "assertion_failed");
}

export function equal(actual: unknown, expected: unknown, message?: string): void {
  if (actual !== expected) fail(message || `assert.equal ${String(actual)} !== ${String(expected)}`);
}

export function strictEqual(actual: unknown, expected: unknown, message?: string): void {
  equal(actual, expected, message);
}

export function deepEqual(actual: unknown, expected: unknown, message?: string): void {
  if (actual instanceof Uint8Array && expected instanceof Uint8Array) {
    if (!bytesEqual(actual, expected)) fail(message || "assert.deepEqual bytes");
    return;
  }
  if (actual === expected) return;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(message || "assert.deepEqual");
}

export function ok(value: unknown, message?: string): void {
  if (!value) fail(message || "assert.ok");
}

const api = { equal, strictEqual, deepEqual, ok };
export default api;
