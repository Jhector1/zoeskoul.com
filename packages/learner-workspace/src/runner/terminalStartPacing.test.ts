import { describe, expect, it } from "vitest";
import { getAutomaticTerminalStartWaitMs } from "./terminalStartPacing";

const wait = (starts: number[], now: number, limit = 4) =>
    getAutomaticTerminalStartWaitMs({ starts, now, limit, windowMs: 60_000 });

describe("automatic PTY start pacing", () => {
    it("permits a cold start and up to four starts within one minute", () => {
        expect(wait([], 100_000)).toBe(0);
        expect(wait([60_000, 70_000, 80_000], 100_000)).toBe(0);
    });
    it("defers the fifth automatic start until the earliest slot expires", () => {
        expect(wait([60_000, 70_000, 80_000, 90_000], 100_000)).toBe(20_001);
        expect(wait([60_000, 70_000, 80_000, 90_000], 120_001)).toBe(0);
    });
    it("uses a rolling window, not fixed wall-clock minute boundaries", () => {
        expect(wait([99_999, 100_001, 100_002, 100_003], 100_004)).toBe(59_996);
        expect(wait([99_999, 100_001, 100_002, 100_003], 159_999)).toBe(0);
    });
    it("ignores timestamps outside the active window", () => {
        expect(wait([10, 40_000, 50_000, 60_000], 100_001)).toBe(0);
    });
    it("rejects invalid limits instead of silently changing safety policy", () => {
        expect(() => wait([1], 100, 0)).toThrow();
    });
});
