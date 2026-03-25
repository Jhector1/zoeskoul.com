import express from "express";
import cors from "cors";
import { startSessionRoute } from "./routes/sessions.start";
import { inputSessionRoute } from "./routes/sessions.input";
import { cancelSessionRoute } from "./routes/sessions.cancel";
import { streamSessionRoute } from "./routes/sessions.stream";

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.post("/sessions/start", startSessionRoute);
app.post("/sessions/:sessionId/input", inputSessionRoute);
app.post("/sessions/:sessionId/cancel", cancelSessionRoute);
app.get("/sessions/:sessionId/stream", streamSessionRoute);

const port = Number(process.env.PORT || 4001);
app.listen(port, () => {
    console.log(`runner listening on ${port}`);
});