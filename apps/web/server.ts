import { createServer } from "node:http";
import next from "next";
import { createPtyUpgradeHandler } from "./src/lib/server/ptyWsProxy";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3000);

async function main() {
    const server = createServer();

    const app = next({
        dev,
        hostname,
        port,
        httpServer: server,
    });

    await app.prepare();

    const handle = app.getRequestHandler();
    const nextUpgradeHandler = app.getUpgradeHandler();
    const handlePtyUpgrade = createPtyUpgradeHandler();

    server.on("request", (req, res) => {
        handle(req, res);
    });

    server.on("upgrade", (req, socket, head) => {
        const handled = handlePtyUpgrade(req, socket, head);
        if (handled) return;

        nextUpgradeHandler(req, socket, head);
    });

    server.listen(port, hostname, () => {
        console.log(`web listening on http://${hostname}:${port}`);
    });
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});