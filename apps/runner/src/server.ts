import { createServer } from "node:http";
import { app } from "./app.js";
import { env } from "./lib/env.js";
import { attachSessionWsServer } from "./ws/sessionWsServer.js";
import { cleanupRunnerOrphansOnStartup } from "./services/docker/runnerReaper.js";
import { pruneBuildPreviewOperationJournals } from "./routes/build.previews.operations.js";
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

  // Fail-closed: no listener or admission while a previous process may still
  // have Docker containers, workspaces or unreconciled recovery journals.
  await cleanupRunnerOrphansOnStartup();

  const rateLimitPruneTimer = setInterval(pruneStartRateLimitBuckets, 60_000);
  if (typeof rateLimitPruneTimer.unref === "function") {
    rateLimitPruneTimer.unref();
  }

  await pruneBuildPreviewOperationJournals().catch(error => {
    console.error("RUNNER preview operation journal cleanup failed", {message: error instanceof Error ? error.message : "unknown"});
  });
  const previewJournalTimer = setInterval(() => { void pruneBuildPreviewOperationJournals().catch(() => undefined); }, 60_000);
  previewJournalTimer.unref?.();

  startSessionCleanupLoop();

  server.listen(env.port, "0.0.0.0", () => {
    console.log(`runner listening on 0.0.0.0:${env.port}`);
  });
}

void main().catch((error) => {
  console.error("RUNNER startup refused: orphan reconciliation failed", {
    message: error instanceof Error ? error.message : "unknown",
  });
  process.exit(1);
});
