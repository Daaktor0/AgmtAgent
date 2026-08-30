import { getSql, type Sql } from "@/lib/db";
import { encryptBytes, decryptBytes, sha256Hex, type Envelope } from "@/lib/agmt/crypto";
import { newId } from "@/lib/agmt/ids";

export async function putBlob(
  ownerUserId: string,
  kind: string,
  bytes: Buffer,
  transactionSql?: Sql,
): Promise<{ objectKey: string; sha256: string; envelope: Envelope }> {
  const sql = transactionSql ?? (await getSql());
  const envelope = encryptBytes(bytes);
  const objectKey = `obj_${newId()}`;
  const sha = sha256Hex(bytes);
  await sql`
    insert into object_blob (
      object_key, owner_user_id, kind, wrapped_data_key, cipher_metadata, ciphertext, sha256, byte_size
    ) values (
      ${objectKey}, ${ownerUserId}, ${kind}, ${envelope.wrappedDataKey},
      ${JSON.stringify(envelope.cipherMetadata)}, ${envelope.ciphertext}, ${sha}, ${bytes.byteLength}
    )
  `;
  return { objectKey, sha256: sha, envelope };
}

export async function getBlob(ownerUserId: string, objectKey: string): Promise<Buffer | null> {
  const sql = await getSql();
  const rows = await sql<{
    wrapped_data_key: string;
    cipher_metadata: unknown;
    ciphertext: string;
  }>`
    select wrapped_data_key, cipher_metadata, ciphertext
    from object_blob
    where object_key = ${objectKey} and owner_user_id = ${ownerUserId}
  `;
  const r = rows[0];
  if (!r) return null;
  const meta =
    typeof r.cipher_metadata === "string" ? JSON.parse(r.cipher_metadata) : r.cipher_metadata;
  return decryptBytes({
    wrappedDataKey: r.wrapped_data_key,
    cipherMetadata: meta as Envelope["cipherMetadata"],
    ciphertext: r.ciphertext,
  });
}
