import { describe, expect, it } from "vitest";

import { appendRunEventToStream } from "./useRunSession";

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
