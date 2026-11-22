/**
 * Phase 4E3C4A: editor-origin WebSocket transport admission, NOT native iframe HMR.
 *
 * The ZoeBuild editor (a normal, authenticated origin) may request a single-use
 * HMR ticket, then connect to the public Caddy ingress. The opaque-origin
 * preview iframe must never receive the ticket or the raw Vite event payload.
 * Raw Vite frames may optionally be handed only to the sandboxed iframe
 * bridge; ordinary editor status callbacks still receive coarse TYPES only.
 *
 * No connection is created merely by importing this module. Callers must use
 * an explicit feature flag; Vite-client integration remains separately gated.
 */

const PROJECT = /^[A-Za-z0-9_-]{1,128}$/;
const PREVIEW = /^preview_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TICKET = /^[A-Za-z0-9_-]{43}$/;
const TICKET_TTL_MS = 20_000;
const MAX_SIGNAL_BYTES = 64 * 1024;
const SOCKET_CONNECT_MS = 8_000;
const SIGNALS = new Set(["connected", "update", "full-reload", "prune", "error", "custom"]);

export type DevelopmentHmrSignal = "connected" | "update" | "full-reload" | "prune" | "error" | "custom";
export type DevelopmentHmrConnectionStatus = "connecting" | "connected" | "disconnected" | "unavailable";

/** Minimum browser WebSocket surface, injectable for deterministic unit tests. */
export type DevelopmentHmrWebSocket = {
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  close: (code?: number) => void;
};

export class DevelopmentHmrBrowserSocketError extends Error {
  constructor() {
    super("Development HMR connection unavailable.");
    this.name = "DevelopmentHmrBrowserSocketError";
  }
}

/** The value comes from deployment configuration, never from a request body.
 * HTTPS only; reject internal DNS names, IP literals, credentials and paths.
 * The browser's actual Origin header is independently checked by the Runner.
 */
export function requirePublicDevelopmentHmrIngress(origin: string): string {
  if (typeof origin !== "string" || origin.length > 256) throw new DevelopmentHmrBrowserSocketError();
  let value: URL;
  try { value = new URL(origin); } catch { throw new DevelopmentHmrBrowserSocketError(); }
  const hostname = value.hostname.toLowerCase();
  if (value.protocol !== "https:" || value.origin !== origin || value.pathname !== "/" ||
      value.username || value.password || value.search || value.hash || !hostname.includes(".") ||
      hostname === "localhost" || hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") || hostname.endsWith(".internal") ||
      /^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(":"))
    throw new DevelopmentHmrBrowserSocketError();
  return origin;
}

/** Only the fixed public Runner /build route is allowed, not arbitrary paths. */
export function developmentHmrBrowserWebSocketUrl(input: Readonly<{
  publicIngressOrigin: string;
  previewId: string;
  ticket: string;
}>): string {
  const origin = requirePublicDevelopmentHmrIngress(input.publicIngressOrigin);
  if (!PREVIEW.test(input.previewId) || !TICKET.test(input.ticket))
    throw new DevelopmentHmrBrowserSocketError();
  const url = new URL(origin);
  url.protocol = "wss:";
  url.pathname = `/build/previews/${input.previewId}/development-hmr/ws`;
  url.searchParams.set("ticket", input.ticket);
  return url.toString();
}

function requireTicketBody(raw: unknown): string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new DevelopmentHmrBrowserSocketError();
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).some(key => !["ok", "ticket", "expiresInMs", "requestId"].includes(key)) ||
      value.ok !== true || value.expiresInMs !== TICKET_TTL_MS ||
      typeof value.ticket !== "string" || !TICKET.test(value.ticket) ||
      (value.requestId !== undefined && (typeof value.requestId !== "string" || value.requestId.length > 256)))
    throw new DevelopmentHmrBrowserSocketError();
  return value.ticket;
}

/** Only forward a Vite message TYPE to the editor status callbacks.
 * The iframe bridge is separately allowed raw bounded Vite frames, without
 * ever receiving the WebSocket ticket or Runner's private capability. */
export function parseDevelopmentHmrSignal(raw: unknown): DevelopmentHmrSignal | null {
  if (typeof raw !== "string" || new TextEncoder().encode(raw).length > MAX_SIGNAL_BYTES)
    return null;
  try {
    const object: unknown = JSON.parse(raw);
    if (!object || typeof object !== "object" || Array.isArray(object)) return null;
    const type = (object as { type?: unknown }).type;
    return typeof type === "string" && SIGNALS.has(type) ? type as DevelopmentHmrSignal : null;
  } catch { return null; }
}

/**
 * One-shot editor connection. No automatic reconnect or retry; each new
 * connection must fetch its own one-use ticket after revalidating the current
 * saved revision. Never expose the ticket in logs, callbacks, or errors.
 */
export function createDevelopmentHmrBrowserSocket(input: Readonly<{
  buildProjectId: string;
  previewId: string;
  sourceVersion: number;
  publicIngressOrigin: string;
  fetchClient: (path: string, init: RequestInit) => Promise<Response>;
  openWebSocket: (url: string, protocol: "vite-hmr") => DevelopmentHmrWebSocket;
  onStatus?: (status: DevelopmentHmrConnectionStatus) => void;
  onSignal?: (signal: DevelopmentHmrSignal) => void;
  /** Raw Vite frames must ONLY go to the opaque iframe bridge, never editor UI. */
  onViteFrame?: (frame: string) => void;
  connectTimeoutMs?: number;
}>) {
  if (!PROJECT.test(input.buildProjectId) || !PREVIEW.test(input.previewId) ||
      !Number.isSafeInteger(input.sourceVersion) || input.sourceVersion < 1 ||
      typeof input.fetchClient !== "function" || typeof input.openWebSocket !== "function")
    throw new DevelopmentHmrBrowserSocketError();
  requirePublicDevelopmentHmrIngress(input.publicIngressOrigin);
  const timeoutMs = input.connectTimeoutMs ?? SOCKET_CONNECT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > SOCKET_CONNECT_MS)
    throw new DevelopmentHmrBrowserSocketError();
  let closed = false;
  let attempted = false;
  let generation = 0;
  let ws: DevelopmentHmrWebSocket | null = null;
  let rejectOpening: ((error: DevelopmentHmrBrowserSocketError) => void) | null = null;

  async function connect(): Promise<void> {
    if (closed || attempted) throw new DevelopmentHmrBrowserSocketError();
    attempted = true;
    const stamp = ++generation;
    input.onStatus?.("connecting");
    try {
      const response = await input.fetchClient(
        `/api/build/projects/${encodeURIComponent(input.buildProjectId)}/preview/${encodeURIComponent(input.previewId)}/development/hmr-ticket`,
        {
          method: "POST", credentials: "same-origin", cache: "no-store",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ sourceVersion: input.sourceVersion }),
        },
      );
      if (closed || stamp !== generation || !response.ok ||
          !(response.headers.get("content-type") ?? "").startsWith("application/json"))
        throw new DevelopmentHmrBrowserSocketError();
      const raw: unknown = await response.json();
      if (closed || stamp !== generation) throw new DevelopmentHmrBrowserSocketError();
      const ticket = requireTicketBody(raw);
      const url = developmentHmrBrowserWebSocketUrl({
        publicIngressOrigin: input.publicIngressOrigin,
        previewId: input.previewId, ticket,
      });
      if (closed || stamp !== generation) throw new DevelopmentHmrBrowserSocketError();
      const socket = input.openWebSocket(url, "vite-hmr");
      ws = socket;
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        let opened = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          rejectOpening = null;
          try { socket.close(); } catch { /* ignore */ }
          reject(new DevelopmentHmrBrowserSocketError());
        }, timeoutMs);
        const openingFailure = (error: DevelopmentHmrBrowserSocketError) => {
          if (settled) return;
          settled = true;
          rejectOpening = null;
          clearTimeout(timer);
          reject(error);
        };
        rejectOpening = openingFailure;
        socket.onopen = () => {
          if (closed || stamp !== generation) {
            openingFailure(new DevelopmentHmrBrowserSocketError());
            try { socket.close(); } catch { /* ignore */ }
            return;
          }
          if (settled) return;
          settled = true;
          opened = true;
          rejectOpening = null;
          clearTimeout(timer);
          input.onStatus?.("connected");
          resolve();
        };
        socket.onmessage = event => {
          if (!opened || closed || stamp !== generation) return;
          const type = parseDevelopmentHmrSignal(event.data);
          if (type !== null) {
            input.onSignal?.(type);
            if (typeof event.data === "string") input.onViteFrame?.(event.data);
          }
        };
        socket.onclose = () => {
          if (!opened) { openingFailure(new DevelopmentHmrBrowserSocketError()); return; }
          if (!closed && stamp === generation) input.onStatus?.("disconnected");
        };
        socket.onerror = () => {
          if (!opened) openingFailure(new DevelopmentHmrBrowserSocketError());
          else if (!closed && stamp === generation) input.onStatus?.("disconnected");
        };
      });
    } catch {
      if (!closed && stamp === generation) input.onStatus?.("unavailable");
      throw new DevelopmentHmrBrowserSocketError();
    }
  }

  function close(): void {
    if (closed) return;
    closed = true;
    generation++;
    rejectOpening?.(new DevelopmentHmrBrowserSocketError());
    rejectOpening = null;
    try { ws?.close(1000); } catch { /* ignore */ }
    ws = null;
  }
  return { connect, close };
}
