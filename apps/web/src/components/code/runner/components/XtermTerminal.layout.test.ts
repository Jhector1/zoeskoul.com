import { afterEach, describe, expect, it, vi } from "vitest";
import {
    isHostLargeEnoughForTerminalLayout,
    isHostVisibleForTerminalInteraction,
} from "@/components/code/runner/components/XtermTerminal";

function makeHost(args: { width: number; height: number; connected?: boolean }) {
    return {
        isConnected: args.connected ?? true,
        getBoundingClientRect: vi.fn(() => ({
            width: args.width,
            height: args.height,
            top: 0,
            left: 0,
            right: args.width,
            bottom: args.height,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        })),
    } as unknown as HTMLDivElement;
}

describe("XtermTerminal layout guards", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("allows interaction with short but visible hosts", () => {
        const host = makeHost({ width: 400, height: 90 });

        vi.stubGlobal("window", {
            getComputedStyle: vi.fn(() => ({
                display: "block",
                visibility: "visible",
            })),
        });

        expect(isHostVisibleForTerminalInteraction(host)).toBe(true);
        expect(isHostLargeEnoughForTerminalLayout(host)).toBe(false);
    });

    it("rejects hidden hosts for both interaction and layout", () => {
        const host = makeHost({ width: 400, height: 180 });

        vi.stubGlobal("window", {
            getComputedStyle: vi.fn(() => ({
                display: "none",
                visibility: "visible",
            })),
        });

        expect(isHostVisibleForTerminalInteraction(host)).toBe(false);
        expect(isHostLargeEnoughForTerminalLayout(host)).toBe(false);
    });
});
