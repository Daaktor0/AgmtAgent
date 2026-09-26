export type IsolationRecord = {
  networkAttempts: string[];
  storageWrites: string[];
};

export function createIsolationRecord(): IsolationRecord {
  return { networkAttempts: [], storageWrites: [] };
}

function targetOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (typeof input === "object" && input && "url" in input) return String((input as Request).url);
  return String(input);
}

/**
 * Document-processing worker isolation. Network and persistent storage are
 * forbidden. This is not a claim that browser memory is securely erased.
 */
export function installProofWorkerIsolation(record: IsolationRecord = createIsolationRecord()): IsolationRecord {
  const rejectNetwork = (target: unknown) => {
    record.networkAttempts.push(String(target));
    return Promise.reject(new Error("network_forbidden"));
  };

  globalThis.fetch = ((input: RequestInfo | URL) => rejectNetwork(targetOf(input))) as typeof fetch;

  globalThis.XMLHttpRequest = class {
    open(_method: string, url: string) { record.networkAttempts.push(String(url)); }
    send() { throw new Error("network_forbidden"); }
  } as unknown as typeof XMLHttpRequest;

  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon = (url: string | URL) => {
      record.networkAttempts.push(String(url));
      return false;
    };
  }

  const OriginalWebSocket = globalThis.WebSocket;
  if (OriginalWebSocket) {
    globalThis.WebSocket = class {
      constructor(url: string | URL) {
        record.networkAttempts.push(String(url));
        throw new Error("network_forbidden");
      }
    } as unknown as typeof OriginalWebSocket;
  }

  const wrapStorage = (storage: Storage | undefined, name: string) => {
    if (!storage) return;
    const proto = Object.getPrototypeOf(storage) as Storage;
    const original = proto.setItem;
    proto.setItem = function setItem(this: Storage, key: string, value: string) {
      record.storageWrites.push(`${name}:${key}:${value.length}`);
      if (value.includes("PK") && value.length > 64) throw new Error("document_storage_forbidden");
      original.call(this, key, value);
    };
  };
  try { wrapStorage(globalThis.localStorage, "localStorage"); } catch { /* worker may lack Storage */ }
  try { wrapStorage(globalThis.sessionStorage, "sessionStorage"); } catch { /* worker may lack Storage */ }

  if (globalThis.indexedDB?.open) {
    const originalOpen = globalThis.indexedDB.open.bind(globalThis.indexedDB);
    globalThis.indexedDB.open = ((name: string, version?: number) => {
      record.storageWrites.push(`indexedDB:${name}`);
      throw new Error("document_storage_forbidden");
      void originalOpen;
      void version;
    }) as typeof indexedDB.open;
  }

  return record;
}

export function installDocumentExfiltrationGuard(documentBytes: Uint8Array): () => void {
  const originalFetch = globalThis.fetch.bind(globalThis);
  const marker = documentBytes.subarray(0, Math.min(32, documentBytes.byteLength));
  const looksLikeDocument = (value: unknown): boolean => {
    if (value instanceof ArrayBuffer) return contains(new Uint8Array(value), marker);
    if (ArrayBuffer.isView(value)) {
      return contains(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), marker);
    }
    if (value instanceof Blob) return value.size === documentBytes.byteLength && value.type.includes("officedocument");
    if (typeof value === "string") return value.includes("PK") && value.length >= documentBytes.byteLength;
    if (typeof FormData !== "undefined" && value instanceof FormData) {
      for (const part of value.values()) {
        if (part instanceof Blob && part.size === documentBytes.byteLength) return true;
        if (typeof part === "string" && part.includes("PK") && part.length >= documentBytes.byteLength) return true;
      }
      return false;
    }
    return false;
  };

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.body && looksLikeDocument(init.body)) {
      throw new Error("document_network_forbidden");
    }
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (/\/api\/proof\/.*(upload|source|runs)/i.test(url) && init?.method && init.method !== "GET") {
      if (init.body) throw new Error("document_network_forbidden");
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  return () => {
    globalThis.fetch = originalFetch;
  };
}

function contains(haystack: Uint8Array, needle: Uint8Array): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

export function persistentStorageSnapshot(): { localStorage: string[]; sessionStorage: string[] } {
  const keys = (storage: Storage | undefined): string[] => {
    if (!storage) return [];
    const out: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key) out.push(key);
    }
    return out;
  };
  try {
    return { localStorage: keys(globalThis.localStorage), sessionStorage: keys(globalThis.sessionStorage) };
  } catch {
    return { localStorage: [], sessionStorage: [] };
  }
}
