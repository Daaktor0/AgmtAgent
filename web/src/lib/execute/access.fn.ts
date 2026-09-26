import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { DecisionView, ExecuteAccess, SessionPerson } from "./server.ts";

/** The signed-in person, from Better Auth's verified session only. */
async function sessionPerson(): Promise<SessionPerson> {
  const request = getRequest();
  if (!request) return null;
  try {
    const { auth } = await import("../auth/server.ts");
    const session = await auth.api.getSession({ headers: request.headers });
    const user = session?.user;
    if (!user?.email) return null;
    return { email: user.email, emailVerified: Boolean(user.emailVerified), name: user.name ?? null };
  } catch {
    return null;
  }
}

/** Whether this visitor may open executed copies, and if not, why. */
export const getExecuteAccess = createServerFn({ method: "GET" }).handler(async (): Promise<ExecuteAccess> => {
  const { accessModeNow, executeAccess } = await import("./server.ts");
  // Public mode must never wait on the Auth database (AGENTS.md); only the
  // closed beta asks who is signed in.
  return executeAccess(accessModeNow() === "invite" ? await sessionPerson() : null);
});

/** What the founder's decision page shows. The token is the only credential. */
export const getDecision = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => ({ token: String(data?.token ?? "").slice(0, 1024) }))
  .handler(async ({ data }): Promise<DecisionView & { join?: string }> => {
    const { decisionView, joinLinkFor } = await import("./server.ts");
    const view = await decisionView(data.token);
    const request = getRequest();
    return view.ok && request ? { ...view, join: joinLinkFor(request, view.record) } : view;
  });
