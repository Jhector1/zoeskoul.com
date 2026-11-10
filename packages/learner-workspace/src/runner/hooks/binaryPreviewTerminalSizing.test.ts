import { describe, expect, it } from "vitest";
import { preferredBottomTerminalSize } from "./binaryPreviewTerminalSizing";

describe("binary preview terminal sizing", () => {
    it("uses compact height for an image while keeping the terminal visible", () => {
        expect(preferredBottomTerminalSize(240, true)).toBe(184);
    });
    it("does not enlarge a deliberately small configured default", () => {
        expect(preferredBottomTerminalSize(140, true)).toBe(140);
    });
    it("uses normal sizing for a code or README editor", () => {
        expect(preferredBottomTerminalSize(240, false)).toBe(240);
    });
});
