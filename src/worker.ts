import { Container, getContainer } from "@cloudflare/containers";
import { env } from "cloudflare:workers";

type WorkerEnv = Env & { OPENROUTER_API_KEY?: string };

function openRouterKey(): string {
	const value = (env as WorkerEnv).OPENROUTER_API_KEY;
	return typeof value === "string" ? value : "";
}

/**
 * One durable Agmt instance. FastAPI listens on 8787 inside the container.
 * Disk is ephemeral: SQLite is wiped when the instance sleeps.
 */
export class AgmtContainer extends Container {
	defaultPort = 8787;
	sleepAfter = "30m";
	envVars = {
		BIND_HOST: "0.0.0.0",
		TLS: "0",
		HOSTED: "1",
		PORT: "8787",
		AGMT_DB: "/tmp/agmt.db",
		OPENROUTER_API_KEY: openRouterKey(),
	};
}

export default {
	async fetch(request: Request, workerEnv: WorkerEnv): Promise<Response> {
		const container = getContainer(workerEnv.AGMT, "primary");
		return container.fetch(request);
	},
};
