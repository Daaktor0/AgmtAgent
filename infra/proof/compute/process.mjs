#!/usr/bin/env node
/**
 * Isolated process entry (PWC-23). This wrapper does not contact the web
 * Worker database. Live Container execution is not authorized by this file.
 *
 * Local development should call the TypeScript compute module instead:
 * `web/src/lib/server/proof-compute.ts`.
 */
process.stdout.write(JSON.stringify({
  version: "proof-compute-v1",
  status: "compute_unprovisioned",
}) + "\n");
process.exit(3);
