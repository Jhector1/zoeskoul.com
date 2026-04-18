import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import { getSession, subscribeSession } from "../services/sessions/sessionStore.js";
import { writeInput } from "../services/docker/writeInput.js";
import { killSession } from "../services/docker/killSession.js";
import { resizeSession } from "../services/docker/resizeSession.js";
import { verifyAttachToken } from "../lib/ptyAttachToken.js";

type ClientToServerMessage =
    | { type: "input"; data: string }
    | { type: "resize"; cols: number; rows: number }
    | { type: "cancel" }
    | { type: "ping" };

function getSessionIdFromRequest(req: IncomingMessage) {
    const url = new URL(req.url ?? "/", "http://localhost");

    const patterns = [
        /^\/sessions\/([^/]+)\/ws$/,
        /^\/api\/pty\/sessions\/([^/]+)\/ws$/,
        /^\/api\/run\/pty\/sessions\/([^/]+)\/ws$/,
    ];

    for (const pattern of patterns) {
        const match = url.pathname.match(pattern);
        if (match?.[1]) {
            return decodeURIComponent(match[1]);
        }
    }

    return null;
}

function getAttachToken(req: IncomingMessage) {
    const url = new URL(req.url ?? "/", "http://localhost");
    return url.searchParams.get("token");
}

function safeSend(ws: WebSocket, payload: unknown) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
    }
}

function safeDeny(socket: Duplex, statusCode: number, message: string) {
    socket.write(
        `HTTP/1.1 ${statusCode} ${message}\r\n` +
        "Connection: close\r\n" +
        "Content-Type: text/plain\r\n" +
        "\r\n" +
        message,
    );
    socket.destroy();
}

function bindSessionSocket(ws: WebSocket, sessionId: string, actorKey: string) {
    const session = getSession(sessionId);
    if (!session || session.ownerKey !== actorKey) {
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

    ws.on("message", async (raw) => {
        try {
            const current = getSession(sessionId);
            if (!current || current.ownerKey !== actorKey) {
                safeSend(ws, { type: "error", message: "Forbidden." });
                ws.close();
                return;
            }

            const data = typeof raw === "string" ? raw : raw.toString("utf8");

            let msg: ClientToServerMessage;
            try {
                msg = JSON.parse(data) as ClientToServerMessage;
            } catch {
                throw new Error("Invalid websocket JSON.");
            }

            if (msg.type === "ping") {
                safeSend(ws, { type: "pong" });
                return;
            }

            if (msg.type === "input") {
                await writeInput(sessionId, String(msg.data ?? ""), actorKey);
                return;
            }

            if (msg.type === "resize") {
                await resizeSession(sessionId, msg.cols, msg.rows);
                return;
            }

            if (msg.type === "cancel") {
                await killSession(sessionId, "canceled");
                return;
            }

            throw new Error("Unsupported websocket message type.");
        } catch (e: any) {
            console.error("RUNNER WS error", {
                sessionId,
                message: e?.message ?? "Invalid websocket message.",
            });

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
}

export function attachSessionWsServer() {
    const wss = new WebSocketServer({ noServer: true });

    return (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        const sessionId = getSessionIdFromRequest(req);
        if (!sessionId) return false;

        const token = getAttachToken(req) ?? "";



        let claims: { sid: string; actor: string; exp: number };
        try {
            claims = verifyAttachToken(token);


        } catch (err) {
            console.error("RUNNER WS token verify failed", {
                sessionId,
                message: err instanceof Error ? err.message : String(err),
            });
            safeDeny(socket, 401, "Unauthorized");
            return true;
        }

        if (claims.sid !== sessionId) {
            console.error("RUNNER WS token/session mismatch", {
                sessionId,
                claimsSid: claims.sid,
            });
            safeDeny(socket, 401, "Unauthorized");
            return true;
        }

        const session = getSession(sessionId);
        if (!session || session.ownerKey !== claims.actor) {
            console.error("RUNNER WS forbidden", {
                sessionId,
                hasSession: !!session,
                ownerKey: session?.ownerKey,
                actor: claims.actor,
            });
            safeDeny(socket, 403, "Forbidden");
            return true;
        }

        wss.handleUpgrade(req, socket as any, head, (ws) => {
            bindSessionSocket(ws, sessionId, claims.actor);
        });

        return true;
    };
}