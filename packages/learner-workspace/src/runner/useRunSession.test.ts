import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
    appendRunEventToStream,
    createAcceptedRunEventStreamUpdater,
} from "./useRunSession";

describe("useRunSession WebSocket event wiring", () => {
    it("never rechecks mutable transport identity inside the deferred event-stream updater", () => {
        const source = readFileSync(
            fileURLToPath(new URL("./useRunSession.ts", import.meta.url)),
            "utf8",
        );

        expect(source).toContain(
            "setEventStream(\n                        createAcceptedRunEventStreamUpdater({",
        );

        expect(source).not.toMatch(
            /setEventStream\(\(previous\)\s*=>\s*\{\s*if\s*\(!isCurrentConnection\(\)\)/,
        );
    });
});

describe("appendRunEventToStream", () => {
    it("does not append events from a previous terminal session into a new owner stream", () => {
        const terminalTwoStream = {
            sessionId: "session-terminal-2",
            ownerKey: "host:owner:terminal-2",
            events: [],
        };
        const oldTerminalOneEvent = {
            type: "stdout" as const,
            seq: 4,
            chunk: "[zoeskoul]~$ ls\r\n",
            ts: new Date(0).toISOString(),
        };

        const result = appendRunEventToStream(terminalTwoStream, {
            sessionId: "session-terminal-1",
            ownerKey: "host:owner:terminal-1",
            event: oldTerminalOneEvent,
        });

        expect(result).toBe(terminalTwoStream);
        expect(result.events).toEqual([]);
    });

    it("retains already accepted fast-exit output even if the transport finalizes before React applies the queued update", () => {
        const stream = {
            sessionId: "session-fast-python",
            ownerKey: null,
            events: [],
        };

        const stdoutEvent = {
            type: "stdout" as const,
            seq: 2,
            chunk: "Hello from Python!\\r\\n",
            ts: new Date(0).toISOString(),
        };

        // The socket handler accepted this event while the connection was
        // current. A subsequent final-status message may close the socket before
        // React executes this queued functional updater.
        const queuedUpdater = createAcceptedRunEventStreamUpdater({
            sessionId: "session-fast-python",
            ownerKey: null,
            event: stdoutEvent,
        });

        const result = queuedUpdater(stream);

        expect(result.events).toEqual([stdoutEvent]);
    });

    it("preserves fast-exit event ordering when React flushes accepted events after socket finalization", () => {
        const initialStream = {
            sessionId: "session-fast-exit",
            ownerKey: null,
            events: [],
        };

        const acceptedEvents = [
            {
                type: "stdout" as const,
                seq: 2,
                chunk: "FAST_OUTPUT_SENTINEL\\r\\n",
                ts: new Date(0).toISOString(),
            },
            {
                type: "exit" as const,
                seq: 3,
                code: 0,
                ts: new Date(1).toISOString(),
            },
            {
                type: "status" as const,
                seq: 4,
                state: "completed" as const,
                ts: new Date(2).toISOString(),
            },
        ];

        // These updaters are created while the WebSocket message handler has
        // synchronously verified the connection/session identity. In production
        // the socket may be finalized before React applies the queued updates.
        const queuedUpdaters = acceptedEvents.map((event) =>
            createAcceptedRunEventStreamUpdater({
                sessionId: "session-fast-exit",
                ownerKey: null,
                event,
            }),
        );

        let stream = initialStream;
        for (const apply of queuedUpdaters) {
            stream = apply(stream);
        }

        expect(stream.events).toEqual(acceptedEvents);
        expect(stream.events.map((event) => event.seq)).toEqual([2, 3, 4]);
        expect(stream.events[0]).toMatchObject({
            type: "stdout",
            chunk: "FAST_OUTPUT_SENTINEL\\r\\n",
        });
    });

    it("deduplicates the same replay/live event sequence", () => {
        const event = {
            type: "stdout" as const,
            seq: 7,
            chunk: "once\\r\\n",
            ts: new Date(0).toISOString(),
        };

        const stream = {
            sessionId: "session-dedupe",
            ownerKey: null,
            events: [event],
        };

        const result = appendRunEventToStream(stream, {
            sessionId: "session-dedupe",
            ownerKey: null,
            event,
        });

        expect(result).toBe(stream);
        expect(result.events).toEqual([event]);
    });

    it("appends events only to the exact session and terminal owner", () => {
        const stream = {
            sessionId: "session-terminal-2",
            ownerKey: "host:owner:terminal-2",
            events: [],
        };
        const event = {
            type: "status" as const,
            seq: 1,
            state: "waiting_for_input" as const,
            ts: new Date(0).toISOString(),
        };

        const result = appendRunEventToStream(stream, {
            sessionId: "session-terminal-2",
            ownerKey: "host:owner:terminal-2",
            event,
        });

        expect(result).not.toBe(stream);
        expect(result.events).toEqual([event]);
    });
});
