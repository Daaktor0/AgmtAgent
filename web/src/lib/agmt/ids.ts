import { randomUUID } from "node:crypto";

/** Opaque UUID text. owner_user_id stays Better Auth's text id. */
export function newId(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
