import { Container, getContainer } from "@cloudflare/containers";

/**
 * Isolated ClamAV scan Container (PWC-22). One attempt per request name.
 * No database, auth, or model secrets are passed into the image.
 * Do not deploy while the four-month no-overage freeze is in force:
 * Cloudflare Containers have no hard included-allotment stop.
 */
export class ProofScanContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "15s";
  enableInternet = false;
}

type ComputeEnv = {
  PROOF_SCAN: DurableObjectNamespace;
};

export default {
  async fetch(request: Request, env: ComputeEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      const container = getContainer(env.PROOF_SCAN, "health");
      return container.fetch(new Request("http://scan/health", { method: "GET" }));
    }
    if (url.pathname === "/scan" && request.method === "POST") {
      const id = crypto.randomUUID();
      const container = getContainer(env.PROOF_SCAN, id);
      return container.fetch(new Request("http://scan/scan", {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body: request.body,
      }));
    }
    return Response.json({ error: "not_found" }, { status: 404 });
  },
};
