import { describe, expect, it } from "vitest";
import { newerProjectVersionFromOtherTab as check } from "./v6ProjectTabVersion";

const current = { projectId: "project-a", baseVersion: 4, clientInstanceId: "tab-a" };
const meta = (changes: Record<string, unknown> = {}) => JSON.stringify({
    projectId: "project-a", baseVersion: 5, clientInstanceId: "tab-b",
    lastSavedAt: "2026-11-08T18:00:00.000Z", currentProjectName: "Lesson",
    ...changes,
});

describe("V6 cross-tab cloud revision notice", () => {
    it("detects a newer version from another mounted editor", () => {
        expect(check(meta(), current)).toEqual({
            version: 5, savedAt: "2026-11-08T18:00:00.000Z", title: "Lesson",
        });
    });
    it("does not warn for this tab or the same revision", () => {
        expect(check(meta({ clientInstanceId: "tab-a" }), current)).toBeNull();
        expect(check(meta({ baseVersion: 4 }), current)).toBeNull();
    });
    it("does not associate a different project with the current draft", () => {
        expect(check(meta({ projectId: "project-b" }), current)).toBeNull();
    });
    it("rejects malformed, forged, or unversioned local metadata", () => {
        expect(check("{", current)).toBeNull();
        expect(check(meta({ baseVersion: "10" }), current)).toBeNull();
        expect(check(meta({ baseVersion: 3.5 }), current)).toBeNull();
        expect(check(meta({ clientInstanceId: "" }), current)).toBeNull();
    });
    it("reports only advisory metadata; it does not mutate any workspace", () => {
        const input = JSON.stringify(current);
        expect(check(meta(), current)?.version).toBe(5);
        expect(JSON.stringify(current)).toBe(input);
    });
});
