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
import { getSessionStats } from "./services/sessions/sessionStore.js";

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

app.get("/metrics", (_req, res) => {
  res.status(200).json({ ok: true, stats: getSessionStats() });
});

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
