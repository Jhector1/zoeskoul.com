import { createServer } from "node:http";
import { app } from "./app.js";
import { env } from "./lib/env.js";
import { attachSessionWsServer } from "./ws/sessionWsServer.js";
import { cleanupRunnerOrphansOnStartup } from "./services/docker/runnerReaper.js";
import { pruneStartRateLimitBuckets } from "./services/sessions/startRateLimit.js";
import { startSessionCleanupLoop } from "./services/sessions/timeoutManager.js";

async function main() {
  const server = createServer(app);
  const handleSessionUpgrade = attachSessionWsServer();

  server.on("upgrade", (req, socket, head) => {
    const handled = handleSessionUpgrade(req, socket, head);
    if (handled) return;

    socket.destroy();
  });

  await cleanupRunnerOrphansOnStartup().catch((err) => {
    console.error("RUNNER startup orphan cleanup failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  });

  const rateLimitPruneTimer = setInterval(pruneStartRateLimitBuckets, 60_000);
  if (typeof rateLimitPruneTimer.unref === "function") {
    rateLimitPruneTimer.unref();
  }

  startSessionCleanupLoop();

  server.listen(env.port, "0.0.0.0", () => {
    console.log(`runner listening on 0.0.0.0:${env.port}`);
  });
}

void main();
