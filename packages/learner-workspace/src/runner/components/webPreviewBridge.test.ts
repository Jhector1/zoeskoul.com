import { describe, expect, it, vi } from "vitest";

import {
    acceptWebPreviewBridgeMessage,
    installWebPreviewBridge,
    WEB_PREVIEW_BRIDGE_MESSAGE,
    webPreviewConsoleReducer,
    type WebPreviewConsoleEntry,
} from "./webPreviewBridge";

function createBridgeHarness() {
    type CapturedMessage = {
        type?: unknown;
        bridgeId?: unknown;
        kind?: unknown;
        path?: unknown;
        entry?: WebPreviewConsoleEntry;
    };
    const messages: CapturedMessage[] = [];
    const windowListeners = new Map<string, (event: unknown) => void>();
    const documentListeners = new Map<string, (event: unknown) => void>();
    const originalConsole = {
        log: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    };
    const target = {
        parent: {
            postMessage: (message: unknown) =>
                messages.push(message as CapturedMessage),
        },
        console: { ...originalConsole },
        addEventListener: (type: string, listener: (event: unknown) => void) => {
            windowListeners.set(type, listener);
        },
    };
    const documentTarget = {
        addEventListener: (type: string, listener: (event: unknown) => void) => {
            documentListeners.set(type, listener);
        },
    };

    installWebPreviewBridge(
        target as unknown as Window,
        documentTarget as unknown as Document,
        "session-current",
    );
    windowListeners.get("message")?.({
        source: target.parent,
        data: {
            type: WEB_PREVIEW_BRIDGE_MESSAGE,
            bridgeId: "session-current",
            kind: "connect",
        },
    });

    return {
        target,
        messages,
        originalConsole,
        windowListeners,
        documentListeners,
        entries: () =>
            messages
                .filter((message) => message.kind === "console-entry")
                .map((message) => message.entry as WebPreviewConsoleEntry),
    };
}

describe("web preview iframe bridge", () => {
    it.each(["log", "info", "warn", "error", "debug"] as const)(
        "captures console.%s and preserves the original console call",
        (level) => {
            const harness = createBridgeHarness();

            harness.target.console[level]("Welcome Fair", 20, true);

            expect(harness.originalConsole[level]).toHaveBeenCalledWith(
                "Welcome Fair",
                20,
                true,
            );
            expect(harness.entries()).toEqual([
                expect.objectContaining({
                    level,
                    kind: "console",
                    arguments: ["Welcome Fair", 20, true],
                    sequence: 1,
                }),
            ]);
        },
    );

    it("safely serializes arrays, objects, errors, functions, DOM nodes, and cycles", () => {
        const harness = createBridgeHarness();
        const circular: Record<string, unknown> = { label: "event" };
        circular.self = circular;
        const node = { nodeType: 1, nodeName: "BUTTON", id: "save", className: "primary large" };

        harness.target.console.log(
            [1, { active: true }],
            circular,
            new Error("failure"),
            function loadEvents() {},
            node,
            undefined,
        );

        const values = harness.entries()[0].arguments;
        expect(values[0]).toEqual({
            type: "array",
            items: [
                1,
                { type: "object", entries: [["active", true]] },
            ],
        });
        expect(values[1]).toEqual({
            type: "object",
            entries: [
                ["label", "event"],
                ["self", { type: "circular" }],
            ],
        });
        expect(values[2]).toEqual(
            expect.objectContaining({ type: "error", name: "Error", message: "failure" }),
        );
        expect(values[3]).toEqual({ type: "function", name: "loadEvents" });
        expect(values[4]).toEqual({ type: "dom-node", value: "<button#save.primary.large>" });
        expect(values[5]).toEqual({ type: "undefined" });
    });

    it("captures runtime errors and unhandled rejections with structured diagnostics", () => {
        const harness = createBridgeHarness();
        harness.windowListeners.get("error")?.({
            error: new ReferenceError("missingEvent"),
            message: "missingEvent is not defined",
            filename: "script.js",
            lineno: 12,
            colno: 4,
        });
        harness.windowListeners.get("unhandledrejection")?.({
            reason: new Error("fetch failed"),
        });

        expect(harness.entries()[0]).toEqual(
            expect.objectContaining({
                level: "error",
                kind: "runtime-error",
                source: "script.js",
                line: 12,
                column: 4,
            }),
        );
        expect(harness.entries()[1]).toEqual(
            expect.objectContaining({
                level: "error",
                kind: "unhandled-rejection",
            }),
        );
    });

    it("keeps virtual navigation on the same structured bridge", () => {
        const harness = createBridgeHarness();
        const preventDefault = vi.fn();
        harness.documentListeners.get("click")?.({
            target: {
                closest: () => ({
                    getAttribute: () => "/about.html",
                }),
            },
            preventDefault,
        });

        expect(preventDefault).toHaveBeenCalledOnce();
        expect(harness.messages).toContainEqual({
            type: WEB_PREVIEW_BRIDGE_MESSAGE,
            bridgeId: "session-current",
            kind: "navigate",
            path: "/about.html",
        });
    });

    it("buffers early learner output until the parent connects", () => {
        const messages: unknown[] = [];
        const listeners = new Map<string, (event: unknown) => void>();
        const parent = { postMessage: (message: unknown) => messages.push(message) };
        const target = {
            parent,
            console: {
                log: vi.fn(),
                info: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
                debug: vi.fn(),
            },
            addEventListener: (type: string, listener: (event: unknown) => void) => {
                listeners.set(type, listener);
            },
        };
        installWebPreviewBridge(
            target as unknown as Window,
            { addEventListener: vi.fn() } as unknown as Document,
            "buffered-session",
        );
        target.console.log("early");
        expect(messages).toEqual([]);

        listeners.get("message")?.({
            source: parent,
            data: {
                type: WEB_PREVIEW_BRIDGE_MESSAGE,
                bridgeId: "buffered-session",
                kind: "connect",
            },
        });
        expect(messages).toEqual([
            expect.objectContaining({ kind: "console-entry" }),
            expect.objectContaining({ kind: "ready" }),
        ]);
    });
});

describe("web preview host isolation", () => {
    const activeWindow = {} as Window;
    const entryMessage = {
        type: WEB_PREVIEW_BRIDGE_MESSAGE,
        bridgeId: "current-session",
        kind: "console-entry",
        entry: {
            level: "log",
            kind: "console",
            arguments: ["hello"],
            timestamp: 1,
            sequence: 1,
        },
    };

    it("accepts a well-formed message only from the active iframe", () => {
        expect(
            acceptWebPreviewBridgeMessage({
                eventSource: activeWindow,
                activeIframeWindow: activeWindow,
                data: entryMessage,
                bridgeId: "current-session",
            }),
        ).toEqual(
            expect.objectContaining({
                kind: "console-entry",
                entry: expect.objectContaining({ id: "current-session:1" }),
            }),
        );

        expect(
            acceptWebPreviewBridgeMessage({
                eventSource: {} as Window,
                activeIframeWindow: activeWindow,
                data: entryMessage,
                bridgeId: "current-session",
            }),
        ).toBeNull();
    });

    it("rejects delayed messages from an obsolete preview session", () => {
        expect(
            acceptWebPreviewBridgeMessage({
                eventSource: activeWindow,
                activeIframeWindow: activeWindow,
                data: { ...entryMessage, bridgeId: "obsolete-session" },
                bridgeId: "current-session",
            }),
        ).toBeNull();
    });

    it("bounds and sanitizes iframe-provided structured values on the host", () => {
        const forged: Record<string, unknown> = { type: "array" };
        forged.items = [forged];
        const message = acceptWebPreviewBridgeMessage({
            eventSource: activeWindow,
            activeIframeWindow: activeWindow,
            data: {
                ...entryMessage,
                entry: { ...entryMessage.entry, arguments: [forged] },
            },
            bridgeId: "current-session",
        });

        expect(message?.kind).toBe("console-entry");
        if (message?.kind !== "console-entry") throw new Error("missing entry");
        expect(message.entry.arguments).toEqual([
            { type: "array", items: [{ type: "circular" }] },
        ]);
    });
});

describe("web preview console lifecycle", () => {
    const entry: WebPreviewConsoleEntry = {
        id: "one:1",
        level: "log",
        kind: "console",
        arguments: ["hello"],
        timestamp: 1,
        sequence: 1,
    };

    it("clears the active session", () => {
        const state = { sessionId: "one", entries: [entry] };
        expect(
            webPreviewConsoleReducer(state, { type: "clear", sessionId: "one" }),
        ).toEqual({ sessionId: "one", entries: [] });
    });

    it("resets on refresh/rebuild and ignores entries from stale sessions", () => {
        const reset = webPreviewConsoleReducer(
            { sessionId: "one", entries: [entry] },
            { type: "reset-session", sessionId: "two" },
        );
        expect(reset).toEqual({ sessionId: "two", entries: [] });
        expect(
            webPreviewConsoleReducer(reset, {
                type: "append",
                sessionId: "one",
                entry,
            }),
        ).toBe(reset);
    });
});
