import express from "express";
import cors from "cors";
import { isAllowedOrigin, getAllowedOrigins } from "./lib/allowedOrigins.js";
import { startSessionRoute } from "./routes/sessions.start.js";
import { inputSessionRoute } from "./routes/sessions.input.js";
import { cancelSessionRoute } from "./routes/sessions.cancel.js";
import { streamSessionRoute } from "./routes/sessions.stream.js";

export const app = express();

app.set("trust proxy", 1);

app.use(
    cors({
        origin(origin, callback) {
            if (!origin) {
                return callback(null, true);
            }

            if (isAllowedOrigin(origin)) {
                return callback(null, true);
            }

            console.error("CORS reject", {
                origin,
                allowedOrigins: [...getAllowedOrigins()],
            });

            return callback(null, false);
        },
        credentials: true,
    }),
);

app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => {
    res.json({ ok: true });
});

app.post("/sessions/start", startSessionRoute);
app.post("/sessions/:sessionId/input", inputSessionRoute);
app.post("/sessions/:sessionId/cancel", cancelSessionRoute);
app.get("/sessions/:sessionId/stream", streamSessionRoute);