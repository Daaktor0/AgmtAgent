import { definePlugin } from "nitro";
import { withDatabaseContext } from "../../src/lib/db-context.server";
import { getSql } from "../../src/lib/db";
import { getOwnedProductRun } from "../../src/lib/server/product-runs";
import { purgeDueProofRuns } from "../../src/lib/server/proof-service";
import {
  createLiveProofRuntime,
  dispatchOwnedProofDeletion,
  dispatchOwnedProofPipeline,
  refreshLocalOperatorHealth,
} from "../../src/lib/server/proof-runtime";

export default definePlugin((nitro) => {
  nitro.hooks.hook("cloudflare:scheduled", async () => {
    try {
      await refreshLocalOperatorHealth();
    } catch (error) {
      console.info("[proof.health] refresh_failed", error instanceof Error ? error.name : "error");
    }
    try {
      const sql = await getSql();
      const runtime = createLiveProofRuntime(sql);
      if (runtime) {
        const jobs = await withDatabaseContext({
          userId: "agmt-proof-worker",
          tenantId: "agmt-maintenance",
          runtimeRole: "worker",
        }, () => sql.query<{ runId: string; tenantId: string; ownerUserId: string; status: string }>(
          "select run_id as \"runId\", tenant_id as \"tenantId\", owner_user_id as \"ownerUserId\", status from agmt_private.list_active_proof_jobs($1)",
          [25],
        ));
        for (const job of jobs) {
          await withDatabaseContext({
            userId: job.ownerUserId,
            tenantId: job.tenantId,
            runtimeRole: "worker",
          }, async () => {
            const run = await getOwnedProductRun(sql, job);
            if (!run) return;
            if (run.status === "deleting") await dispatchOwnedProofDeletion(sql, run, runtime);
            else await dispatchOwnedProofPipeline(sql, run, runtime);
          });
        }
      }
    } catch (error) {
      console.info("[proof.dispatch] failed", error instanceof Error ? error.name : "error");
    }
    try {
      const deleted = await purgeDueProofRuns();
      console.info(`[proof.purge] deleted_runs=${deleted}`);
    } catch (error) {
      console.info("[proof.purge] failed", error instanceof Error ? error.name : "error");
    }
  });
});
