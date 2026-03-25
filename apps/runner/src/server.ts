import { createServer } from "node:http";
import { app } from "./app.js";
import { env } from "./lib/env.js";
import { attachSessionWsServer } from "./ws/sessionWsServer.js";

const server = createServer(app);

attachSessionWsServer(server);

server.listen(env.port, "0.0.0.0", () => {
    console.log(`runner listening on ${env.appUrl ?? `http://0.0.0.0:${env.port}`}`);
});