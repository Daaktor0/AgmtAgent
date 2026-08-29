import { createServerFn } from "@tanstack/react-start";
import { assertSameSiteRequest } from "@/lib/auth/isolation.server";
import { openAnonymousTestSession } from "@/lib/server/session";
import { ensureAccount } from "@/lib/server/account";
import { writeAudit } from "@/lib/server/audit";

/**
 * Temporary product-testing entrypoint. It removes the interactive auth step but
 * still creates a real, isolated Better Auth user/session for each browser.
 * Delete this function when production login is restored.
 */
export const openTestWorkspace = createServerFn({ method: "POST" }).handler(async () => {
  assertSameSiteRequest();
  const opened = await openAnonymousTestSession();
  await ensureAccount(opened.userId);
  await writeAudit({
    ownerUserId: opened.userId,
    userId: opened.userId,
    action: "auth.test_workspace_open",
    subjectType: "user_account",
    subjectId: opened.userId,
  });
  return { ok: true as const };
});
