import { describe, expect, it } from "vitest";
import { cloudSaveIntent, isUnresolvedCloudUpdate } from "./v6CloudConflictPolicy";

describe("cloud conflict safety", () => {
    it("routes conflicting Save to review, never a stale PATCH", () => {
        expect(cloudSaveIntent(true)).toBe("resolve");
        expect(cloudSaveIntent(false)).toBe("save");
    });
    it("blocks updates to a cloud head with unresolved conflict", () => {
        expect(isUnresolvedCloudUpdate({targetProjectId:"original", conflictProjectId:"original"})).toBe(true);
    });
    it("permits a separate Save Copy POST while the old project conflicts", () => {
        expect(isUnresolvedCloudUpdate({targetProjectId:null, conflictProjectId:"original"})).toBe(false);
    });
    it("does not block unrelated projects", () => {
        expect(isUnresolvedCloudUpdate({targetProjectId:"other", conflictProjectId:"original"})).toBe(false);
    });
    it("treats a dismissed dialog as unresolved until version is reconciled", () => {
        const unresolved = {targetProjectId:"original", conflictProjectId:"original"};
        expect(isUnresolvedCloudUpdate(unresolved)).toBe(true);
    });
});
