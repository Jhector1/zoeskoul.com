import { WebSocketServer, type WebSocket } from "ws";
import type { Server as HttpServer, IncomingMessage } from "node:http";
import { env } from "../lib/env.js";
import { getSession, subscribeSession } from "../services/sessions/sessionStore.js";
import { writeInput } from "../services/docker/writeInput.js";
import { killSession } from "../services/docker/killSession.js";
import { resizeSession } from "../services/docker/resizeSession.js";

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

function normalizeOrigin(value?: string | null) {
    if (!value) return null;
    try {
        return new URL(value).origin.toLowerCase();
    } catch {
        return null;
    }
}

const allowedOrigins = new Set(
    [env.webUrl]
        .map((v?:string) => normalizeOrigin(v))
        .filter((v:string|null): v is string => Boolean(v)),
);

// function originAllowed(origin: string | undefined) {
//     if (!origin) return true;
//
//     const normalized = normalizeOrigin(origin);
//     return !!normalized && allowedOrigins.has(normalized);
// }
function originAllowed(_origin: string | undefined) {
    return true;
}
export function attachSessionWsServer(server: HttpServer) {
    const wss = new WebSocketServer({ noServer: true });

    server.on("upgrade", (req, socket, head) => {
        console.log("WS upgrade incoming", {
            url: req.url,
            host: req.headers.host,
            origin: req.headers.origin,
        });

        const origin = req.headers.origin;
        const sessionId = getSessionIdFromRequest(req);

        if (!originAllowed(origin)) {
            console.error("WS origin reject", {
                origin,
                allowedOrigins: [...allowedOrigins],
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
            wss.emit("connection", ws, req, sessionId);
        });
    });

    wss.on("connection", (ws: any, _req: any, sessionId: string) => {
        console.log("WS connected", { sessionId });
        // existing code...
    });

    return wss;
}