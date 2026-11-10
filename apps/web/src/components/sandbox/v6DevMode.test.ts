import { describe, expect, it } from "vitest";
import { selectDevV6FileSyncMode } from "./v6DevMode";

describe("ZoeLearning V6: development-only sandbox activation", () => {
    it("uses V5 unless deliberately enabled", () => {
        expect(selectDevV6FileSyncMode({ nodeEnv: "development", enabled: undefined, hasUser: true })).toBe("v5");
        expect(selectDevV6FileSyncMode({ nodeEnv: "development", enabled: "false", hasUser: true })).toBe("v5");
        expect(selectDevV6FileSyncMode({ nodeEnv: "development", enabled: "TRUE", hasUser: true })).toBe("v5");
    });
    it("allows V6 in a signed-in local development session", () => {
        expect(selectDevV6FileSyncMode({ nodeEnv: "development", enabled: "true", hasUser: true })).toBe("v6");
    });
    it("rejects V6 in a production or test build, even if explicitly enabled", () => {
        for (const nodeEnv of ["production", "test", undefined]) {
            expect(selectDevV6FileSyncMode({ nodeEnv, enabled: "true", hasUser: true })).toBe("v5");
        }
    });
    it("requires a signed-in account even in development", () => {
        expect(selectDevV6FileSyncMode({ nodeEnv: "development", enabled: "true", hasUser: false })).toBe("v5");
    });
});
