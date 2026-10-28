import express from "express";
import { requireServiceAuth } from "./middleware/serviceAuth.js";
import { startSessionRoute } from "./routes/sessions.start.js";
import { inputSessionRoute } from "./routes/sessions.input.js";
import { cancelSessionRoute } from "./routes/sessions.cancel.js";
import { streamSessionRoute } from "./routes/sessions.stream.js";
import { resizeSessionRoute } from "./routes/sessions.resize.js";
import { snapshotWorkspaceRoute } from "./routes/sessions.snapshotWorkspace.js";
import { sessionsReplaceWorkspaceRoute } from "./routes/sessions.replaceWorkspaceRoute.js";
import { heartbeatSessionRoute } from "./routes/sessions.heartbeat.js";
import { activeSessionsRoute } from "./routes/sessions.active.js";
import { validateBuildJobRoute } from "./routes/build.jobs.validate.js";
import { executeBuildDependencyLockBootstrapRoute } from "./routes/build.jobs.dependencyLockBootstrap.js";
import { executeBuildProductionRoute } from "./routes/build.jobs.productionBuild.js";
import { startBuildPreviewRoute } from "./routes/build.previews.start.js";
import { syncBuildPreviewRoute } from "./routes/build.previews.sync.js";
import { fetchBuildPreviewRoute } from "./routes/build.previews.fetch.js";
import { proxyFetchBuildPreviewRoute } from "./routes/build.previews.proxyFetch.js";
import { resolveBuildPreviewCapabilityRoute } from "./routes/build.previews.resolveCapability.js";
import { cancelBuildPreviewRoute } from "./routes/build.previews.cancel.js";
import { drainBuildProjectPreviewsRoute, releaseBuildProjectPreviewDrainRoute } from "./routes/build.previews.projectDrain.js";
import { getSessionStats } from "./services/sessions/sessionStore.js";
import { env } from "./lib/env.js";
import {
  getDirectoryUsage,
  getRunnerFilesystemCapacity,
} from "./services/workspace/workspacePolicy.js";

export const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

// 5 MB workspace + JSON overhead
app.use(express.json({ limit: "8mb" }));

// Public container healthcheck. It reveals no sensitive state and must return exact 200.
app.get("/healthz", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.use(requireServiceAuth);

// Authenticated healthcheck for Caddy/smoke tests.
app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, stats: getSessionStats() });
});

app.get("/metrics", async (_req, res) => {
  try {
    const [workspace, filesystem] = await Promise.all([
      getDirectoryUsage(env.workspaceRoot, {
        maxBytes: env.maxWorkspaceRootBytes,
        maxEntries: env.maxRuntimeEntries * env.maxConcurrentGlobal,
      }),
      getRunnerFilesystemCapacity(env.workspaceRoot),
    ]);

    res.status(200).json({
      ok: true,
      stats: getSessionStats(),
      storage: {
        workspaceBytes: workspace.bytes,
        workspaceEntries: workspace.entries,
        maxWorkspaceRootBytes: env.maxWorkspaceRootBytes,
        filesystem,
      },
    });
  } catch (err) {
    res.status(200).json({
      ok: true,
      stats: getSessionStats(),
      storage: {
        error: err instanceof Error ? err.message : String(err),
      },
    });
  }
});

app.post("/build/jobs/validate", validateBuildJobRoute);
app.post("/build/jobs/dependency-lock-bootstrap", executeBuildDependencyLockBootstrapRoute);
app.post("/build/jobs/production-build", executeBuildProductionRoute);
app.post("/build/previews/start", startBuildPreviewRoute);
app.post("/build/previews/:previewId/sync", syncBuildPreviewRoute);
app.post("/build/previews/:previewId/fetch", fetchBuildPreviewRoute);
app.post("/build/previews/:previewId/proxy-fetch", proxyFetchBuildPreviewRoute);
app.post("/build/previews/:previewId/resolve-capability", resolveBuildPreviewCapabilityRoute);
app.post("/build/previews/:previewId/cancel", cancelBuildPreviewRoute);
app.post("/build/previews/project/drain", drainBuildProjectPreviewsRoute);
app.post("/build/previews/project/release", releaseBuildProjectPreviewDrainRoute);
app.post("/sessions/start", startSessionRoute);
app.post("/sessions/active", activeSessionsRoute);
app.post("/sessions/:sessionId/input", inputSessionRoute);
app.post("/sessions/:sessionId/resize", resizeSessionRoute);
app.post("/sessions/:sessionId/cancel", cancelSessionRoute);
app.post("/sessions/:sessionId/heartbeat", heartbeatSessionRoute);
app.get("/sessions/:sessionId/stream", streamSessionRoute);
app.post("/sessions/:sessionId/snapshot-workspace", snapshotWorkspaceRoute);
app.post(
  "/sessions/:sessionId/replace-workspace",
  sessionsReplaceWorkspaceRoute,
);
