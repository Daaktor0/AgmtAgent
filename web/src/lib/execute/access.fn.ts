import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import type { ExecuteAccess } from "./server.ts";

/** Whether this visitor may open executed copies (public, or a valid invite). */
export const getExecuteAccess = createServerFn({ method: "GET" }).handler(async (): Promise<ExecuteAccess> => {
  const { executeAccess, INVITE_COOKIE } = await import("./server.ts");
  return executeAccess(getCookie(INVITE_COOKIE));
});
