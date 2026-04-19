import express from "express";
import { requireServiceAuth } from "./middleware/serviceAuth.js";
import { startSessionRoute } from "./routes/sessions.start.js";
import { inputSessionRoute } from "./routes/sessions.input.js";
import { cancelSessionRoute } from "./routes/sessions.cancel.js";
import { streamSessionRoute } from "./routes/sessions.stream.js";
import { resizeSessionRoute } from "./routes/sessions.resize.js";
import { snapshotWorkspaceRoute } from "./routes/sessions.snapshotWorkspace.js";
import { sessionsReplaceWorkspaceRoute } from "./routes/sessions.replaceWorkspaceRoute.js";

export const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

// 5 MB workspace + JSON overhead
app.use(express.json({ limit: "8mb" }));
app.use(requireServiceAuth);

app.get("/health", (_req, res) => {
    res.json({ ok: true });
});

app.post("/sessions/start", startSessionRoute);
app.post("/sessions/:sessionId/input", inputSessionRoute);
app.post("/sessions/:sessionId/resize", resizeSessionRoute);
app.post("/sessions/:sessionId/cancel", cancelSessionRoute);
app.get("/sessions/:sessionId/stream", streamSessionRoute);
app.post("/sessions/:sessionId/snapshot-workspace", snapshotWorkspaceRoute);
app.post("/sessions/:sessionId/replace-workspace", sessionsReplaceWorkspaceRoute);