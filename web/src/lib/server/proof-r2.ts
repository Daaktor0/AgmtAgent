/**
 * Cloudflare R2 adapter for the new Proof object lane (PWC-17/19).
 *
 * Uses the existing approved `AGMT_OBJECTS` binding. Source and output keys
 * already distinguish quarantine vs temporary roles; dedicated buckets can
 * replace this wrapper without changing the key contract.
 */
import { runtimeBinding } from "../runtime-env.server.ts";
import { ObjectStoreError } from "./object-store.ts";
import {
  createProofObjectStore,
  type ProofObjectStore,
  type ProofR2Bucket,
  type ProofR2ListPage,
} from "./proof-objects.ts";

type CloudflareR2Object = {
  size?: number;
  etag?: string | null;
  customMetadata?: Readonly<Record<string, string>>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
};

type CloudflareR2Bucket = {
  head(key: string): Promise<CloudflareR2Object | null>;
  get(key: string): Promise<CloudflareR2Object | ArrayBuffer | Uint8Array | null>;
  put(
    key: string,
    value: Uint8Array,
    options?: {
      httpMetadata?: { contentType?: string | null };
      customMetadata?: Readonly<Record<string, string>>;
    },
  ): Promise<{ etag?: string | null } | null | void>;
  delete(key: string): Promise<void>;
  list?(input: {
    prefix?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{
    objects?: Array<{ key?: string }>;
    truncated?: boolean;
    cursor?: string;
  }>;
  createMultipartUpload?(key: string): Promise<{ uploadId: string }>;
  abortMultipartUpload?(key: string, uploadId: string): Promise<void>;
};

export const AGMT_OBJECTS_BINDING = "AGMT_OBJECTS";

export function wrapCloudflareR2(bucket: CloudflareR2Bucket): ProofR2Bucket {
  return {
    async head(key: string) {
      const object = await bucket.head(key);
      if (!object) return null;
      return {
        size: Number(object.size ?? 0),
        etag: object.etag ?? null,
        customMetadata: object.customMetadata ?? {},
      };
    },
    async put(key, body, options) {
      const result = await bucket.put(key, body, {
        httpMetadata: options.httpMetadata,
        customMetadata: options.customMetadata,
      });
      return { etag: result && typeof result === "object" ? result.etag ?? null : null };
    },
    async get(key: string) {
      const object = await bucket.get(key);
      if (!object) return null;
      if (object instanceof Uint8Array) return object;
      if (object instanceof ArrayBuffer) return new Uint8Array(object);
      if (typeof object.arrayBuffer === "function") {
        return new Uint8Array(await object.arrayBuffer());
      }
      return null;
    },
    async delete(key: string) {
      await bucket.delete(key);
    },
    async list(input: { prefix: string; cursor?: string; limit: number }): Promise<ProofR2ListPage> {
      if (typeof bucket.list !== "function") {
        throw new ObjectStoreError("object_store_unconfigured", "R2 list is not available on this binding");
      }
      const page = await bucket.list({ prefix: input.prefix, cursor: input.cursor, limit: input.limit });
      const keys = (page.objects ?? []).map((object) => object.key).filter((key): key is string => typeof key === "string");
      return { keys, cursor: page.truncated && page.cursor ? page.cursor : null };
    },
    async createMultipartUpload(key: string) {
      if (typeof bucket.createMultipartUpload !== "function") {
        throw new ObjectStoreError("object_store_unconfigured", "R2 multipart is not available on this binding");
      }
      return bucket.createMultipartUpload(key);
    },
    async abortMultipartUpload(key: string, uploadId: string) {
      if (typeof bucket.abortMultipartUpload !== "function") return;
      await bucket.abortMultipartUpload(key, uploadId);
    },
  };
}

export function liveProofR2Bucket(): ProofR2Bucket | null {
  const bucket = runtimeBinding<CloudflareR2Bucket>(AGMT_OBJECTS_BINDING);
  if (!bucket || typeof bucket.put !== "function" || typeof bucket.head !== "function") return null;
  return wrapCloudflareR2(bucket);
}

export function liveProofObjectStore(): ProofObjectStore | null {
  const bucket = liveProofR2Bucket();
  if (!bucket) return null;
  return createProofObjectStore({ mode: "deployed", quarantine: bucket, temporary: bucket });
}
