/**
 * Signings saved on this device, in the browser's own database (IndexedDB).
 * Nothing here is sent anywhere. The user can delete a signing, and with it
 * every stored file, at any time.
 */
import type { Signing } from "../model.ts";

const DB_NAME = "agmt-execute";
const DB_VERSION = 1;
const SIGNINGS = "signings";
const FILES = "files";

let opened: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  opened ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(SIGNINGS)) d.createObjectStore(SIGNINGS, { keyPath: "id" });
      if (!d.objectStoreNames.contains(FILES)) {
        const files = d.createObjectStore(FILES, { keyPath: "id" });
        files.createIndex("signingId", "signingId");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("storage_unavailable"));
  });
  opened.catch(() => {
    opened = null;
  });
  return opened;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("storage_failed"));
    tx.onabort = () => reject(tx.error ?? new Error("storage_aborted"));
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("storage_failed"));
  });
}

export async function storageAvailable(): Promise<boolean> {
  try {
    await db();
    return true;
  } catch {
    return false;
  }
}

/** Ask the browser not to clear this data under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function listSignings(): Promise<Signing[]> {
  const d = await db();
  const all = await request(d.transaction(SIGNINGS, "readonly").objectStore(SIGNINGS).getAll() as IDBRequest<Signing[]>);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveSigning(signing: Signing): Promise<void> {
  const d = await db();
  const tx = d.transaction(SIGNINGS, "readwrite");
  tx.objectStore(SIGNINGS).put(signing);
  await done(tx);
}

export async function saveFile(signingId: string, id: string, bytes: Uint8Array, type: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(FILES, "readwrite");
  tx.objectStore(FILES).put({ id, signingId, type, blob: new Blob([bytes as BlobPart], { type }) });
  await done(tx);
}

export async function loadFile(id: string): Promise<Uint8Array | null> {
  const d = await db();
  const row = (await request(d.transaction(FILES, "readonly").objectStore(FILES).get(id))) as { blob: Blob } | undefined;
  return row ? new Uint8Array(await row.blob.arrayBuffer()) : null;
}

export async function deleteFile(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(FILES, "readwrite");
  tx.objectStore(FILES).delete(id);
  await done(tx);
}

export async function deleteSigning(id: string): Promise<void> {
  const d = await db();
  const keys = await request(d.transaction(FILES, "readonly").objectStore(FILES).index("signingId").getAllKeys(IDBKeyRange.only(id)));
  const tx = d.transaction([SIGNINGS, FILES], "readwrite");
  tx.objectStore(SIGNINGS).delete(id);
  for (const key of keys) tx.objectStore(FILES).delete(key);
  await done(tx);
}
