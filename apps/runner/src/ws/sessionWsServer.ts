import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import crypto from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { env } from "../lib/env.js";
import { getSession, subscribeSession } from "../services/sessions/sessionStore.js";
import { writeInput } from "../services/docker/writeInput.js";
import { killSession } from "../services/docker/killSession.js";
import { resizeSession } from "../services/docker/resizeSession.js";

type ClientToServerMessage =
    | { type: "input"; data: string }
    | { type: "resize"; cols: number; rows: number }
    | { type: "cancel" }
    | { type: "ping" };

function getHeader(req: IncomingMessage, name: string) {
    const value = req.headers[name];
    return Array.isArray(value) ? value[0] : value ?? "";
}

function safeEqualText(a: string, b: string) {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
}

function getSessionIdFromRequest(req: IncomingMessage) {
    const url = new URL(req.url ?? "/", "http://localhost");
    const match = url.pathname.match(/^\/sessions\/([^/]+)\/ws$/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function safeSend(ws: WebSocket, payload: unknown) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
    }
}

function previewText(value: unknown, max = 120) {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    if (!text) return "";
    return text.length > max ? `${text.slice(0, max)}…` : text;
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

    ws.on("error", (err) => {

        unsubscribe();
    });
}

export function attachSessionWsServer() {
    const wss = new WebSocketServer({ noServer: true });

    return (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        const providedSecret = String(getHeader(req, "x-runner-secret"));
        const actorKey = String(getHeader(req, "x-actor-key"));
        const sessionId = getSessionIdFromRequest(req);

        if (!sessionId) return false;

        if (!providedSecret || !safeEqualText(providedSecret, env.runnerSharedSecret)) {
            socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
            socket.destroy();
            return true;
        }

        if (!actorKey) {
            socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
            socket.destroy();
            return true;
        }

        const session = getSession(sessionId);
        if (!session || session.ownerKey !== actorKey) {
            socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
            socket.destroy();
            return true;
        }

        wss.handleUpgrade(req, socket as any, head, (ws) => {
            bindSessionSocket(ws, sessionId, actorKey);
        });

        return true;
    };
}