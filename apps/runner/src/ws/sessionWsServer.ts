import { WebSocketServer, type WebSocket } from "ws";
import type { Server as HttpServer, IncomingMessage } from "node:http";
import { getSession, subscribeSession } from "../services/sessions/sessionStore.js";
import { writeInput } from "../services/docker/writeInput.js";
import { killSession } from "../services/docker/killSession.js";
import { resizeSession } from "../services/docker/resizeSession.js";
import { isAllowedOrigin, getAllowedOrigins } from "../lib/allowedOrigins.js";

type ClientToServerMessage =
    | { type: "input"; data: string }
    | { type: "cancel" }
    | { type: "resize"; cols: number; rows: number }
    | { type: "ping" };

function safeSend(ws: WebSocket, payload: unknown) {
    if (ws.readyState !== ws.OPEN) return;
    ws.send(JSON.stringify(payload));
}

function getSessionIdFromRequest(req: IncomingMessage) {
    const url = new URL(req.url ?? "/", "http://localhost");
    const match = url.pathname.match(/^\/sessions\/([^/]+)\/ws$/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function attachSessionWsServer(server: HttpServer) {
    const wss = new WebSocketServer({ noServer: true });

    server.on("upgrade", (req, socket, head) => {
        console.log("WS upgrade incoming", {
            url: req.url,
            host: req.headers.host,
            origin: req.headers.origin,
            upgrade: req.headers.upgrade,
            connection: req.headers.connection,
        });

        const origin = req.headers.origin;
        const sessionId = getSessionIdFromRequest(req);

        if (!isAllowedOrigin(origin)) {
            console.error("WS origin reject", {
                origin,
                allowedOrigins: [...getAllowedOrigins()],
            });
            socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
            socket.destroy();
            return;
        }

        if (!sessionId) {
            console.error("WS no session id", { url: req.url });
            socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
            socket.destroy();
            return;
        }

        const session = getSession(sessionId);
        if (!session) {
            console.error("WS session not found", { sessionId });
            socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
            socket.destroy();
            return;
        }

        wss.handleUpgrade(req, socket, head, (ws) => {
            console.log("WS upgraded", { sessionId });
            console.log("WS upgrade incoming", {
                url: req.url,
                host: req.headers.host,
                origin: req.headers.origin,
            });

            console.log("WS upgraded", { sessionId });
            console.log("WS connected", { sessionId });
            wss.emit("connection", ws, req, sessionId);
        });
    });

    wss.on("connection", (ws: any, _req: any, sessionId: string) => {
        console.log("WS connected", { sessionId });

        const session = getSession(sessionId);
        if (!session) {
            safeSend(ws, { type: "error", message: "Session not found." });
            ws.close();
            return;
        }

        safeSend(ws, {
            type: "ready",
            sessionId,
            state: session.state,
        });

        for (const ev of session.events) {
            safeSend(ws, { type: "event", event: ev });
        }

        const unsubscribe = subscribeSession(sessionId, (event) => {
            safeSend(ws, { type: "event", event });
        });

        ws.on("message", async (raw: any) => {
            try {
                const msg = JSON.parse(String(raw)) as ClientToServerMessage;

                if (msg.type === "ping") {
                    safeSend(ws, { type: "pong" });
                    return;
                }

                if (msg.type === "input") {
                    await writeInput(sessionId, String(msg.data ?? ""));
                    return;
                }

                if (msg.type === "cancel") {
                    await killSession(sessionId, "canceled");
                    return;
                }

                if (msg.type === "resize") {
                    await resizeSession(sessionId, msg.cols, msg.rows);
                    return;
                }
            } catch (e: any) {
                safeSend(ws, {
                    type: "error",
                    message: e?.message ?? "Invalid websocket message.",
                });
            }
        });

        ws.on("close", () => {
            unsubscribe();
        });

        ws.on("error", () => {
            unsubscribe();
        });
    });

    return wss;
}