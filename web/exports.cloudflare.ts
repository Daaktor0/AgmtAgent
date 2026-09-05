/**
 * Compatibility exports for the existing Cloudflare deployment.
 *
 * The first Agmt Worker version created an `AgmtContainer` Durable Object.
 * Cloudflare requires every later version of the same script to continue
 * exporting that class, even though the current web app no longer routes
 * requests through the legacy container. Keep the class export wired to the
 * original implementation so existing object state is not treated as a
 * delete-class migration during deployment.
 */
export { AgmtContainer } from "../src/worker.ts";
