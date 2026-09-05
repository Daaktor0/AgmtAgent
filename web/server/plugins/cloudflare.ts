import { definePlugin } from "nitro";
import { purgeDueProofRuns } from "../../src/lib/server/proof-service";

export default definePlugin((nitro) => {
  nitro.hooks.hook("cloudflare:scheduled", async () => {
    try {
      const deleted = await purgeDueProofRuns();
      console.info(`[proof.purge] deleted_runs=${deleted}`);
    } catch (error) {
      console.error("[proof.purge] failed", error);
      throw error;
    }
  });
});
