export const WEB_PREVIEW_BRIDGE_MESSAGE = "zoeskoul-web-preview:bridge";

export type WebPreviewConsoleLevel =
    | "log"
    | "info"
    | "warn"
    | "error"
    | "debug";

export type WebPreviewSerializedValue =
    | string
    | number
    | boolean
    | null
    | { type: "undefined" }
    | { type: "bigint"; value: string }
    | { type: "symbol"; value: string }
    | { type: "function"; name: string }
    | { type: "circular" }
    | { type: "truncated"; reason: "depth" | "size" }
    | { type: "dom-node"; value: string }
    | {
          type: "error";
          name: string;
          message: string;
          stack?: string;
      }
    | {
          type: "array";
          items: WebPreviewSerializedValue[];
          truncated?: boolean;
      }
    | {
          type: "object";
          entries: Array<[string, WebPreviewSerializedValue]>;
          truncated?: boolean;
      };

export type WebPreviewConsoleEntry = {
    id: string;
    level: WebPreviewConsoleLevel;
    kind: "console" | "runtime-error" | "unhandled-rejection";
    arguments: WebPreviewSerializedValue[];
    timestamp: number;
    sequence: number;
    source?: string;
    line?: number;
    column?: number;
};

export type WebPreviewConsoleState = {
    sessionId: string;
    entries: WebPreviewConsoleEntry[];
};

export type WebPreviewConsoleAction =
    | { type: "reset-session"; sessionId: string }
    | { type: "append"; sessionId: string; entry: WebPreviewConsoleEntry }
    | { type: "clear"; sessionId: string };

export function webPreviewConsoleReducer(
    state: WebPreviewConsoleState,
    action: WebPreviewConsoleAction,
): WebPreviewConsoleState {
    if (action.type === "reset-session") {
        return action.sessionId === state.sessionId && state.entries.length === 0
            ? state
            : { sessionId: action.sessionId, entries: [] };
    }

    if (action.sessionId !== state.sessionId) return state;
    if (action.type === "clear") {
        return state.entries.length === 0 ? state : { ...state, entries: [] };
    }

    return {
        ...state,
        entries: [...state.entries, action.entry].slice(-500),
    };
}

export type WebPreviewBridgeMessage =
    | {
          type: typeof WEB_PREVIEW_BRIDGE_MESSAGE;
          bridgeId: string;
          kind: "navigate";
          path: string;
      }
    | {
          type: typeof WEB_PREVIEW_BRIDGE_MESSAGE;
          bridgeId: string;
          kind: "console-entry";
          entry: WebPreviewConsoleEntry;
      }
    | {
          type: typeof WEB_PREVIEW_BRIDGE_MESSAGE;
          bridgeId: string;
          kind: "ready";
      };

const CONSOLE_LEVELS = new Set<WebPreviewConsoleLevel>([
    "log",
    "info",
    "warn",
    "error",
    "debug",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object";
}

function sanitizeSerializedValues(values: unknown[]): WebPreviewSerializedValue[] {
    const seen = new WeakSet<object>();
    const budget = { remaining: 500 };

    function sanitize(value: unknown, depth: number): WebPreviewSerializedValue {
        if (budget.remaining <= 0) return { type: "truncated", reason: "size" };
        budget.remaining -= 1;

        if (
            value === null ||
            typeof value === "boolean" ||
            typeof value === "number"
        ) {
            return value;
        }
        if (typeof value === "string") return value.slice(0, 8_000);
        if (!isRecord(value)) return "[Unsupported value]";
        if (seen.has(value)) return { type: "circular" };
        if (depth >= 6) return { type: "truncated", reason: "depth" };
        seen.add(value);

        switch (value.type) {
            case "undefined":
                return { type: "undefined" };
            case "bigint":
            case "symbol":
                return {
                    type: value.type,
                    value:
                        typeof value.value === "string"
                            ? value.value.slice(0, 8_000)
                            : "",
                };
            case "function":
                return {
                    type: "function",
                    name:
                        typeof value.name === "string"
                            ? value.name.slice(0, 200)
                            : "anonymous",
                };
            case "circular":
                return { type: "circular" };
            case "truncated":
                return {
                    type: "truncated",
                    reason: value.reason === "depth" ? "depth" : "size",
                };
            case "dom-node":
                return {
                    type: "dom-node",
                    value:
                        typeof value.value === "string"
                            ? value.value.slice(0, 1_000)
                            : "<node>",
                };
            case "error":
                return {
                    type: "error",
                    name:
                        typeof value.name === "string"
                            ? value.name.slice(0, 200)
                            : "Error",
                    message:
                        typeof value.message === "string"
                            ? value.message.slice(0, 8_000)
                            : "Unknown error",
                    ...(typeof value.stack === "string"
                        ? { stack: value.stack.slice(0, 16_000) }
                        : {}),
                };
            case "array":
                return {
                    type: "array",
                    items: Array.isArray(value.items)
                        ? value.items
                              .slice(0, 50)
                              .map((item) => sanitize(item, depth + 1))
                        : [],
                    ...(value.truncated === true ? { truncated: true } : {}),
                };
            case "object": {
                const entries = Array.isArray(value.entries)
                    ? value.entries.slice(0, 50).flatMap((entry) => {
                          if (!Array.isArray(entry) || entry.length < 2) return [];
                          const key = String(entry[0]).slice(0, 1_000);
                          return [
                              [key, sanitize(entry[1], depth + 1)] as [
                                  string,
                                  WebPreviewSerializedValue,
                              ],
                          ];
                      })
                    : [];
                return {
                    type: "object",
                    entries,
                    ...(value.truncated === true ? { truncated: true } : {}),
                };
            }
            default:
                return "[Unsupported value]";
        }
    }

    return values.slice(0, 50).map((value) => sanitize(value, 0));
}

export function readWebPreviewBridgeMessage(
    data: unknown,
    bridgeId: string,
): WebPreviewBridgeMessage | null {
    if (!isRecord(data)) return null;
    if (data.type !== WEB_PREVIEW_BRIDGE_MESSAGE || data.bridgeId !== bridgeId) {
        return null;
    }

    if (data.kind === "ready") {
        return { type: WEB_PREVIEW_BRIDGE_MESSAGE, bridgeId, kind: "ready" };
    }

    if (data.kind === "navigate" && typeof data.path === "string") {
        return {
            type: WEB_PREVIEW_BRIDGE_MESSAGE,
            bridgeId,
            kind: "navigate",
            path: data.path.slice(0, 2_048),
        };
    }

    if (data.kind !== "console-entry" || !isRecord(data.entry)) return null;

    const entry = data.entry;
    if (
        typeof entry.level !== "string" ||
        !CONSOLE_LEVELS.has(entry.level as WebPreviewConsoleLevel) ||
        (entry.kind !== "console" &&
            entry.kind !== "runtime-error" &&
            entry.kind !== "unhandled-rejection") ||
        !Array.isArray(entry.arguments) ||
        typeof entry.timestamp !== "number" ||
        !Number.isFinite(entry.timestamp) ||
        typeof entry.sequence !== "number" ||
        !Number.isFinite(entry.sequence)
    ) {
        return null;
    }

    const sequence = Math.max(0, Math.floor(entry.sequence));
    return {
        type: WEB_PREVIEW_BRIDGE_MESSAGE,
        bridgeId,
        kind: "console-entry",
        entry: {
            id: `${bridgeId}:${sequence}`,
            level: entry.level as WebPreviewConsoleLevel,
            kind: entry.kind,
            arguments: sanitizeSerializedValues(entry.arguments),
            timestamp: entry.timestamp,
            sequence,
            ...(typeof entry.source === "string"
                ? { source: entry.source.slice(0, 2_048) }
                : {}),
            ...(typeof entry.line === "number" && Number.isFinite(entry.line)
                ? { line: Math.max(0, Math.floor(entry.line)) }
                : {}),
            ...(typeof entry.column === "number" && Number.isFinite(entry.column)
                ? { column: Math.max(0, Math.floor(entry.column)) }
                : {}),
        },
    };
}

export function acceptWebPreviewBridgeMessage(args: {
    eventSource: MessageEventSource | null;
    activeIframeWindow: Window | null | undefined;
    data: unknown;
    bridgeId: string;
}) {
    if (!args.activeIframeWindow || args.eventSource !== args.activeIframeWindow) {
        return null;
    }

    return readWebPreviewBridgeMessage(args.data, args.bridgeId);
}

/**
 * Runs inside the sandboxed preview iframe. Keep this function self-contained:
 * buildWebPreviewBridgeScript serializes it into srcDoc before learner scripts.
 */
export function installWebPreviewBridge(
    target: Window,
    documentTarget: Document,
    bridgeId: string,
) {
    const MESSAGE_TYPE = "zoeskoul-web-preview:bridge";
    const MAX_DEPTH = 4;
    const MAX_ITEMS = 50;
    const MAX_NODES = 250;
    const MAX_STRING_LENGTH = 4_000;
    let sequence = 0;
    let connected = false;
    const pendingMessages: Array<Record<string, unknown>> = [];

    function clipped(value: unknown, limit = MAX_STRING_LENGTH) {
        try {
            const text = String(value);
            return text.length > limit ? `${text.slice(0, limit)}…` : text;
        } catch {
            return "[Unprintable value]";
        }
    }

    function serializeArguments(values: unknown[]) {
        const seen = new WeakSet<object>();
        const budget = { remaining: MAX_NODES };

        function serialize(value: unknown, depth: number): unknown {
            if (budget.remaining <= 0) return { type: "truncated", reason: "size" };
            budget.remaining -= 1;

            if (value === null) return null;
            if (typeof value === "string") return clipped(value);
            if (typeof value === "number" || typeof value === "boolean") return value;
            if (typeof value === "undefined") return { type: "undefined" };
            if (typeof value === "bigint") return { type: "bigint", value: String(value) };
            if (typeof value === "symbol") return { type: "symbol", value: clipped(value) };
            if (typeof value === "function") {
                return { type: "function", name: clipped(value.name || "anonymous", 200) };
            }
            if (typeof value !== "object") return clipped(value);
            if (seen.has(value)) return { type: "circular" };
            if (depth >= MAX_DEPTH) return { type: "truncated", reason: "depth" };
            seen.add(value);

            try {
                const possibleNode = value as {
                    nodeType?: unknown;
                    nodeName?: unknown;
                    id?: unknown;
                    className?: unknown;
                };
                if (
                    typeof possibleNode.nodeType === "number" &&
                    typeof possibleNode.nodeName === "string"
                ) {
                    const name = possibleNode.nodeName.toLowerCase();
                    const id =
                        typeof possibleNode.id === "string" && possibleNode.id
                            ? `#${possibleNode.id}`
                            : "";
                    const className =
                        typeof possibleNode.className === "string" && possibleNode.className
                            ? `.${possibleNode.className.trim().split(/\s+/).join(".")}`
                            : "";
                    return { type: "dom-node", value: `<${name}${id}${className}>` };
                }

                if (
                    value instanceof Error ||
                    (typeof (value as { name?: unknown }).name === "string" &&
                        typeof (value as { message?: unknown }).message === "string" &&
                        typeof (value as { stack?: unknown }).stack === "string")
                ) {
                    const error = value as Error;
                    return {
                        type: "error",
                        name: clipped(error.name || "Error", 200),
                        message: clipped(error.message),
                        ...(typeof error.stack === "string"
                            ? { stack: clipped(error.stack, 8_000) }
                            : {}),
                    };
                }

                if (Array.isArray(value)) {
                    return {
                        type: "array",
                        items: value
                            .slice(0, MAX_ITEMS)
                            .map((item) => serialize(item, depth + 1)),
                        ...(value.length > MAX_ITEMS ? { truncated: true } : {}),
                    };
                }

                const keys = Object.keys(value).slice(0, MAX_ITEMS);
                const entries = keys.map((key) => {
                    try {
                        return [key, serialize((value as Record<string, unknown>)[key], depth + 1)];
                    } catch {
                        return [key, "[Thrown while reading property]"];
                    }
                });
                return {
                    type: "object",
                    entries,
                    ...(Object.keys(value).length > MAX_ITEMS ? { truncated: true } : {}),
                };
            } catch {
                return "[Unserializable value]";
            }
        }

        return values.slice(0, MAX_ITEMS).map((value) => serialize(value, 0));
    }

    function post(kind: string, payload?: Record<string, unknown>) {
        const message = { type: MESSAGE_TYPE, bridgeId, kind, ...(payload ?? {}) };
        if (!connected) {
            pendingMessages.push(message);
            if (pendingMessages.length > 500) pendingMessages.shift();
            return;
        }
        try {
            target.parent.postMessage(message, "*");
        } catch {
            // Diagnostics must never interrupt learner code.
        }
    }

    target.addEventListener("message", (event) => {
        if (event.source !== target.parent) return;
        const data = event.data;
        if (
            !data ||
            typeof data !== "object" ||
            data.type !== MESSAGE_TYPE ||
            data.bridgeId !== bridgeId ||
            data.kind !== "connect"
        ) {
            return;
        }

        connected = true;
        for (const message of pendingMessages.splice(0)) {
            try {
                target.parent.postMessage(message, "*");
            } catch {
                // Keep flushing other diagnostics if one host post fails.
            }
        }
        post("ready");
    });

    function emitEntry(
        level: string,
        kind: string,
        values: unknown[],
        location?: { source?: string; line?: number; column?: number },
    ) {
        sequence += 1;
        post("console-entry", {
            entry: {
                level,
                kind,
                arguments: serializeArguments(values),
                timestamp: Date.now(),
                sequence,
                ...(location ?? {}),
            },
        });
    }

    const targetConsole = (target as Window & { console: Console }).console;
    (["log", "info", "warn", "error", "debug"] as const).forEach((level) => {
        const original = targetConsole[level];
        targetConsole[level] = function (...values: unknown[]) {
            try {
                Reflect.apply(original, targetConsole, values);
            } catch {
                // A host console implementation must not break learner code.
            }
            emitEntry(level, "console", values);
        };
    });

    target.addEventListener("error", (event) => {
        emitEntry(
            "error",
            "runtime-error",
            [event.error ?? event.message ?? "Unknown runtime error"],
            {
                ...(event.filename ? { source: event.filename } : {}),
                ...(event.lineno ? { line: event.lineno } : {}),
                ...(event.colno ? { column: event.colno } : {}),
            },
        );
    });

    target.addEventListener("unhandledrejection", (event) => {
        emitEntry("error", "unhandled-rejection", [event.reason]);
    });

    documentTarget.addEventListener("click", (event) => {
        const node = event.target as Element | null;
        const anchor = node?.closest?.("a[data-zoeskoul-preview-path]");
        if (!anchor) return;

        const path = anchor.getAttribute("data-zoeskoul-preview-path");
        if (!path) return;

        event.preventDefault();
        post("navigate", { path });
    });

}

export function buildWebPreviewBridgeScript(bridgeId: string) {
    const safeBridgeId = JSON.stringify(bridgeId).replace(/</g, "\\u003c");
    return `<script data-zoeskoul-preview-bridge>\n;(${installWebPreviewBridge.toString()})(window, document, ${safeBridgeId});\n</script>`;
}
