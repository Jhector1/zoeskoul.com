import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { sharedFullStackPreviews } from "../services/build/sharedPreviewRegistry.js";
import { openOwnedTanstackDevelopmentHmrRelay } from "../services/build/tanstackPreviewHmrDockerRelay.js";
import {
  developmentHmrTickets, type DevelopmentHmrIdentity,
  allowedDevelopmentHmrOrigin, validDevelopmentHmrClientMessage,
} from "../services/build/tanstackDevelopmentHmrTickets.js";

const PATH = /^\/build\/previews\/(preview_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/development-hmr\/ws$/i;
const MAX_CLIENT_BYTES = 4096;
const MAX_CONNECTIONS = 32;
const MAX_PER_PREVIEW = 2;

function deny(socket: Duplex, status: number) {
  try { socket.end(`HTTP/1.1 ${status} Denied\r\nConnection: close\r\nCache-Control: no-store\r\nContent-Length: 0\r\n\r\n`); }
  catch { socket.destroy(); }
}

const active = new Map<string, number>();
let totalActive = 0;

export function attachTanstackDevelopmentHmrWsServer() {
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false,
    maxPayload: MAX_CLIENT_BYTES, clientTracking: false });

  return (req: IncomingMessage, socket: Duplex, head: Buffer): boolean => {
    let url: URL;
    try { url = new URL(req.url ?? "/", "http://localhost"); }
    catch { return false; }
    const match = PATH.exec(url.pathname);
    if (!match) return false;
    if (process.env.RUNNER_EXECUTION_POOL !== "zoebuild" ||
        process.env.ZOEBUILD_DEVELOPMENT_HMR_GATEWAY_ENABLED !== "true") {
      deny(socket, 404); return true;
    }
    const origin = req.headers.origin;
    const allowedOrigins = [
      ...(process.env.ALLOWED_WEB_ORIGINS ?? "").split(","),
      process.env.WEB_URL ?? "",
    ].map(item => item.trim()).filter(Boolean);
    if (!allowedDevelopmentHmrOrigin(origin, allowedOrigins) ||
        url.searchParams.size !== 1 || !url.searchParams.has("ticket") ||
        req.headers["sec-websocket-protocol"] !== "vite-hmr" ||
        req.headers.upgrade?.toLowerCase() !== "websocket" ||
        totalActive >= MAX_CONNECTIONS || (active.get(match[1]) ?? 0) >= MAX_PER_PREVIEW) {
      deny(socket, 403); return true;
    }
    let identity: DevelopmentHmrIdentity;
    try {
      identity = developmentHmrTickets.consume(url.searchParams.get("ticket"), match[1], origin);
      sharedFullStackPreviews.assertDevelopmentReadOpen(identity);
    } catch { deny(socket, 403); return true; }

    const key = identity.previewId;
    totalActive++;
    active.set(key, (active.get(key) ?? 0) + 1);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      totalActive--;
      const count = (active.get(key) ?? 1) - 1;
      if (count <= 0) active.delete(key); else active.set(key, count);
    };
    try {
      wss.handleUpgrade(req, socket, head, async ws => {
        let relay: Awaited<ReturnType<typeof openOwnedTanstackDevelopmentHmrRelay>> | null = null;
        let closed = false;
        let ready = false;
        const close = () => {
          if (closed) return;
          closed = true;
          release();
          try { relay?.close(); } catch { /* no details exposed */ }
          try { ws.close(1000); } catch { ws.terminate(); }
        };
        ws.on("close", close);
        ws.on("error", close);
        // Require connecting clients to wait until the private relay is open.
        ws.on("message", (raw, isBinary) => {
          if (!ready || isBinary || !validDevelopmentHmrClientMessage(raw.toString("utf8"))) {
            close(); return;
          }
          try { relay?.sendText(raw.toString("utf8")); }
          catch { close(); }
        });
        try {
          const opened = await openOwnedTanstackDevelopmentHmrRelay({
            identity,
            onText: text => {
              if (ws.readyState !== WebSocket.OPEN) return;
              try { ws.send(text, { binary: false, compress: false }); }
              catch { close(); }
            },
            onClose: close,
          });
          if (closed) { opened.close(); return; }
          relay = opened;
          ready = true;
        } catch { close(); }
      });
    } catch { release(); deny(socket, 403); }
    return true;
  };
}
