import { describe, expect, it } from "vitest";
import { resolveSaveProjectTarget } from "./resolveSaveProjectTarget";

describe("project save target resolution", () => {
    it("creates a new project for explicit null even if old IDs exist", () => {
        expect(resolveSaveProjectTarget({targetProjectId:null}, "old-project", "cached-project")).toBeNull();
    });
    it("updates an explicitly selected project", () => {
        expect(resolveSaveProjectTarget({targetProjectId:"chosen"}, "old", "cached")).toBe("chosen");
    });
    it("uses the active project for ordinary Save", () => {
        expect(resolveSaveProjectTarget(undefined, "active", "cached")).toBe("active");
    });
    it("falls back to persisted session identity when needed", () => {
        expect(resolveSaveProjectTarget(undefined, null, "cached")).toBe("cached");
    });
    it("creates when no project identity exists", () => {
        expect(resolveSaveProjectTarget(undefined, null, null)).toBeNull();
    });
});
