import { createServer } from "node:http";
import { app } from "./app.js";
import { env } from "./lib/env.js";
import { attachSessionWsServer } from "./ws/sessionWsServer.js";

const server = createServer(app);
const handleSessionUpgrade = attachSessionWsServer();

server.on("upgrade", (req, socket, head) => {
    const handled = handleSessionUpgrade(req, socket, head);
    if (handled) return;

    socket.destroy();
});

server.listen(env.port, "0.0.0.0", () => {
    console.log(`runner listening on http://0.0.0.0:${env.port}`);
});