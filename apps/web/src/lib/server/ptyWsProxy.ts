import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import { verifyAttachToken } from "@/lib/server/ptyAttachToken";

function getRunnerWsBase() {
    const explicit = process.env.RUNNER_WS_BASE_URL?.trim();
    if (!explicit) {
        throw new Error("Missing RUNNER_WS_BASE_URL");
    }

    const normalized = explicit.replace(/\/+$/, "");
    if (!/^wss?:\/\//i.test(normalized)) {
        throw new Error(
            `RUNNER_WS_BASE_URL must start with ws:// or wss://. Got: ${normalized}`,
        );
    }

    return normalized;
}

function getRunnerSecret() {
    const secret = process.env.RUNNER_SHARED_SECRET;
    if (!secret) {
        throw new Error("Missing RUNNER_SHARED_SECRET");
    }
    return secret;
}

function safeSend(ws: WebSocket, payload: unknown) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(typeof payload === "string" ? payload : JSON.stringify(payload));
    }
}

function getSessionIdFromRequest(req: IncomingMessage) {
    const url = new URL(req.url ?? "/", "http://localhost");

    const patterns = [
        /^\/api\/run\/pty\/sessions\/([^/]+)\/ws$/,
        /^\/api\/pty\/sessions\/([^/]+)\/ws$/,
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

function bindProxy(browserWs: WebSocket, sessionId: string, actorKey: string) {
    const runnerWs = new WebSocket(
        `${getRunnerWsBase()}/sessions/${encodeURIComponent(sessionId)}/ws`,
        {
            headers: {
                "x-runner-secret": getRunnerSecret(),
                "x-actor-key": actorKey,
            },
        },
    );

    let runnerOpen = false;
    const pendingToRunner: string[] = [];

    runnerWs.on("open", () => {
        runnerOpen = true;

        for (const msg of pendingToRunner.splice(0)) {
            if (runnerWs.readyState === WebSocket.OPEN) {
                runnerWs.send(msg);
            } else {
                break;
            }
        }
    });

    runnerWs.on("message", (data) => {
        const text = typeof data === "string" ? data : data.toString("utf8");
        safeSend(browserWs, text);
    });

    runnerWs.on("close", (code, reason) => {
        if (browserWs.readyState === WebSocket.OPEN) {
            browserWs.close(code || 1000, reason.toString() || "runner closed");
        }
    });

    runnerWs.on("error", (err) => {
        console.error("WEB PTY PROXY runner error", {
            sessionId,
            message: err instanceof Error ? err.message : String(err),
        });

        safeSend(browserWs, {
            type: "error",
            message: "Runner websocket connection failed.",
        });

        try {
            browserWs.close(1011, "runner websocket error");
        } catch {}
    });

    browserWs.on("message", (data) => {
        const text = typeof data === "string" ? data : data.toString("utf8");

        if (!runnerOpen || runnerWs.readyState === WebSocket.CONNECTING) {
            pendingToRunner.push(text);
            return;
        }

        if (runnerWs.readyState === WebSocket.OPEN) {
            runnerWs.send(text);
        }
    });

    browserWs.on("close", (code, reason) => {
        try {
            runnerWs.close(code || 1000, reason.toString() || "browser closed");
        } catch {}
    });

    browserWs.on("error", () => {
        try {
            runnerWs.close(1011, "browser websocket error");
        } catch {}
    });
}

function safeDeny(socket: Duplex, statusCode: number, message: string) {
    socket.write(
        `HTTP/1.1 ${statusCode} ${message}\r\n` +
        "Connection: close\r\n" +
        "Content-Type: text/plain\r\n" +
        "\r\n" +
        `${message}`,
    );
    socket.destroy();
}

export function createPtyUpgradeHandler() {
    const wss = new WebSocketServer({ noServer: true });

    return (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        const sessionId = getSessionIdFromRequest(req);
        if (!sessionId) return false;

        const token = getAttachToken(req) ?? "";

        let claims: { sid: string; actor: string; exp: number };
        try {
            claims = verifyAttachToken(token);
        } catch (err) {
            console.error("WEB PTY PROXY token verify failed", {
                sessionId,
                message: err instanceof Error ? err.message : String(err),
            });
            safeDeny(socket, 401, "Unauthorized");
            return true;
        }

        if (claims.sid !== sessionId) {
            safeDeny(socket, 401, "Unauthorized");
            return true;
        }



        wss.handleUpgrade(req, socket as any, head, (browserWs) => {
            bindProxy(browserWs, sessionId, claims.actor);
        });

        return true;
    };
}