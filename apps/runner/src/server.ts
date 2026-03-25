import express from "express";
import cors from "cors";
import { env } from "./lib/env";
import { startSessionRoute } from "./routes/sessions.start";
import { inputSessionRoute } from "./routes/sessions.input";
import { cancelSessionRoute } from "./routes/sessions.cancel";
import { streamSessionRoute } from "./routes/sessions.stream";

const app = express();

app.set("trust proxy", 1);

app.use(
    cors({
        origin: [env.webUrl],
        credentials: true,
    })
);

app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => {
    res.json({ ok: true });
});

app.post("/sessions/start", startSessionRoute);
app.post("/sessions/:sessionId/input", inputSessionRoute);
app.post("/sessions/:sessionId/cancel", cancelSessionRoute);
app.get("/sessions/:sessionId/stream", streamSessionRoute);

app.listen(env.port, "0.0.0.0", () => {
    console.log(`runner listening on ${env.appUrl}`);
});