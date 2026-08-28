import { getSql } from "@/lib/db";
import { newId } from "@/lib/agmt/ids";
import { sha256Hex } from "@/lib/agmt/crypto";
import { auditLog } from "@/lib/agmt/log";

export async function writeAudit(input: {
  ownerUserId?: string | null;
  userId?: string | null;
  matterId?: string | null;
  action: string;
  subjectType?: string | null;
  subjectId?: string | null;
  detailCodes?: unknown;
  ip?: string | null;
  ua?: string | null;
}): Promise<void> {
  const sql = await getSql();
  await sql`
    insert into audit_event (
      audit_id, owner_user_id, user_id, matter_id, action, subject_type, subject_id,
      ip_hash, user_agent_hash, detail_codes
    ) values (
      ${newId()}, ${input.ownerUserId ?? null}, ${input.userId ?? null}, ${input.matterId ?? null},
      ${input.action}, ${input.subjectType ?? null}, ${input.subjectId ?? null},
      ${input.ip ? sha256Hex(input.ip) : null},
      ${input.ua ? sha256Hex(input.ua) : null},
      ${JSON.stringify(input.detailCodes ?? null)}
    )
  `;
  auditLog(input.action, {
    owner_user_id: input.ownerUserId,
    matter_id: input.matterId ?? undefined,
    subject_type: input.subjectType ?? undefined,
    subject_id: input.subjectId ?? undefined,
  });
}
