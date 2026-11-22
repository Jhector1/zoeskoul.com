import type { UnifiedAttachGate } from "../services/execution/unifiedLinuxBrowserAdmission.js";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import { isUnifiedTerminalId, type UnifiedLinuxTerminalTransport, type UnifiedTerminalPeer } from "../services/execution/unifiedLinuxTerminalTransport.js";
import {
    getSession,
    subscribeSession,
    setSessionTransportAttached,
    touchSession,
} from "../services/sessions/sessionStore.js";
import { writeInput } from "../services/docker/writeInput.js";
import { killSession } from "../services/docker/killSession.js";
import { resizeSession } from "../services/docker/resizeSession.js";
import { verifyAttachToken } from "../lib/ptyAttachToken.js";
import { isGlobalAdminShell, mayAttachGlobalAdminShell } from "../services/execution/adminReattachPolicy.js";
import { adminLabSwitchStatus } from "../services/execution/learningAdminSwitch.js";

function globalAdminTransportAllowed(session: NonNullable<ReturnType<typeof getSession>>, actorKey: string) {
    return !isGlobalAdminShell(session) || mayAttachGlobalAdminShell(session, actorKey,
        process.env.ZOESKOUL_LEARNING_ADMIN_LABS_ENABLED === "true" && adminLabSwitchStatus().enabled, Date.now());
}

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

const sessionSockets = new Map<string, Set<WebSocket>>();

function registerSessionSocket(sessionId: string, ws: WebSocket) {
    let set = sessionSockets.get(sessionId);
    if (!set) {
        set = new Set();
        sessionSockets.set(sessionId, set);
    }
    set.add(ws);
    setSessionTransportAttached(sessionId, true);
}

function unregisterSessionSocket(sessionId: string, ws: WebSocket) {
    const set = sessionSockets.get(sessionId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) {
        sessionSockets.delete(sessionId);
        setSessionTransportAttached(sessionId, false);
    }
}

export function closeSessionSockets(
    sessionId: string,
    code = 1012,
    reason = "Session closed",
) {
    const sockets = sessionSockets.get(sessionId);
    if (!sockets) return;

    for (const ws of sockets) {
        try {
            ws.close(code, reason);
        } catch {}
    }

    sessionSockets.delete(sessionId);
}

function bindSessionSocket(ws: WebSocket, sessionId: string, actorKey: string) {
    const session = getSession(sessionId);
    if (!session || session.ownerKey !== actorKey || !globalAdminTransportAllowed(session, actorKey)) {
        safeSend(ws, { type: "error", message: "Session not found." });
        ws.close();
        return;
    }

    safeSend(ws, {
        type: "ready",
        sessionId,
        state: session.state,
    });
    registerSessionSocket(sessionId, ws);
    if (!isGlobalAdminShell(session)) touchSession(sessionId);

    for (const ev of session.events) {
        safeSend(ws, { type: "event", event: ev });
    }

    // Global admin clients can distinguish replay completion from transport ready.
    // This frame does not renew the session or alter ordinary terminal protocols.
    if (isGlobalAdminShell(session)) {
        safeSend(ws, { type: "admin_replay_complete", sessionId, seq: session.seq });
    }

    const unsubscribe = subscribeSession(sessionId, (event) => {
        safeSend(ws, { type: "event", event });
    });

    ws.on("message", async (raw) => {
        try {
            const current = getSession(sessionId);
            if (!current || current.ownerKey !== actorKey || !globalAdminTransportAllowed(current, actorKey)) {
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
                if (!isGlobalAdminShell(current)) touchSession(sessionId);
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
        unregisterSessionSocket(sessionId, ws);
    });

    ws.on("error", () => {
        unsubscribe();
        unregisterSessionSocket(sessionId, ws);
    });
}

/** The optional transport is only injected by a trusted future unified runtime
 * composition. Normal startup does not provide it; a flag cannot activate it. */
export function attachSessionWsServer(unified?: UnifiedLinuxTerminalTransport, gate?: UnifiedAttachGate) {
    const wss = new WebSocketServer({ noServer: true });
    const unifiedWss = unified ? new WebSocketServer({noServer:true,maxPayload:16384,perMessageDeflate:false}) : undefined;

    return (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        const sessionId = getSessionIdFromRequest(req);
        if (!sessionId) return false;

        const token = getAttachToken(req) ?? "";



        if (isUnifiedTerminalId(sessionId)) {
            const authority = gate?.consume(sessionId, token, req.headers.origin);
            if (!unified || !unifiedWss || !authority || !authority.mayAttach() || !unified.canConnect(sessionId, authority.actor)) {
                safeDeny(socket, 403, "Forbidden");
                return true;
            }
            unifiedWss.handleUpgrade(req, socket as any, head, (ws) => {
                const peer: UnifiedTerminalPeer = {
                    send: (frame) => {
                        if (ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > 256*1024) return false;
                        ws.send(JSON.stringify(frame)); return true;
                    },
                    close: (code, reason) => ws.close(code, reason),
                };
                const detach = () => unified.disconnect(sessionId, peer);
                ws.on("close", detach);
                ws.on("error", () => {detach(); ws.terminate();});
                ws.on("message", (raw, binary) => {
                    if (binary) {detach(); ws.close(1003, "Text messages required"); return;}
                    const text = Array.isArray(raw) ? Buffer.concat(raw).toString("utf8") : Buffer.isBuffer(raw) ? raw.toString("utf8") : Buffer.from(raw).toString("utf8");
                    if (!authority.stillAllowed()) {detach(); ws.close(1008, "Terminal authorization required"); return;}
                    void unified.receive(sessionId, peer, text).catch(() => {detach(); ws.close(1011, "Terminal transport failed");});
                });
                // Recheck after the upgrade; another socket may have connected.
                if (!authority.mayAttach() || !unified.connect(sessionId, authority.actor, peer)) {
                    ws.close(1008, "Terminal unavailable");
                } else if (!authority.stillAllowed()) {
                    detach();ws.close(1008, "Terminal authorization required");
                }
            });
            return true;
        }


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
        if (!session || session.ownerKey !== claims.actor || !globalAdminTransportAllowed(session, claims.actor)) {
            console.error("RUNNER WS forbidden", {
                sessionId,
                hasSession: !!session,
                ownerMatches: session?.ownerKey === claims.actor,
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
