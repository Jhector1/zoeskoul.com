import type { Server } from "node:http";

/** The dedicated Caddy upstream uses a 120s idle timeout by default.
 * Give it a margin to retire idle HTTP/1.1 sockets before Node does.
 * Leave request/header limits, active responses and upgrades unchanged. */
export function configureZoebuildHttpServer(server: Server, pool = process.env.RUNNER_EXECUTION_POOL): void {
  if (pool === "zoebuild") server.keepAliveTimeout = 130_000;
}
