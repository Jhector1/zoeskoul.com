import { describe, expect, it } from "vitest";
import { isValidCloudProjectSnapshot, workspaceChangedDuringCloudReload, canSkipUnchangedCloudSave } from "./v6CloudReloadSafety";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
const ws: WorkspaceStateV2 = {
    version: 2, language: "python", nodes: [{id: "a", name: "main.py", kind: "file", content: "one", parentId: null, createdAt: 1, updatedAt: 1}],
    openTabs: ["a"], activeFileId: "a", entryFileId: "a", stdin: "", expanded: [], leftPct: 26,
};
const response = {ok: true, project: {id: "p1", title: "Project", currentVersion: 3, updatedAt: "2026-11-09T10:00:00.000Z", workspace: ws}};
describe("verified cloud reload lifecycle", () => {
    it("accepts the matching versioned project snapshot", () => expect(isValidCloudProjectSnapshot(response, "p1")).toBe(true));
    it("rejects an unrelated project ID", () => expect(isValidCloudProjectSnapshot(response, "p2")).toBe(false));
    it("rejects a missing version, date or workspace", () => {
        expect(isValidCloudProjectSnapshot({ok: true, project: {...response.project, currentVersion: null}}, "p1")).toBe(false);
        expect(isValidCloudProjectSnapshot({ok: true, project: {...response.project, updatedAt: "invalid"}}, "p1")).toBe(false);
        expect(isValidCloudProjectSnapshot({ok: true, project: {...response.project, workspace: null}}, "p1")).toBe(false);
    });
    it("does not discard local edits made during the network request", () => {
        expect(workspaceChangedDuringCloudReload(ws, {...ws, nodes: ws.nodes.map(n => n.kind === "file" ? {...n, content: "two"} : n)})).toBe(true);
        expect(workspaceChangedDuringCloudReload(ws, {...ws, leftPct: 60, expanded: ["a"]})).toBe(false);
    });
    it("skips an unchanged, acknowledged save", () => {
        expect(canSkipUnchangedCloudSave({projectId: "p1", baseVersion: 3, isDirty: false, hasConflict: false})).toBe(true);
    });
    it("never skips a new project, pending change or unresolved conflict", () => {
        expect(canSkipUnchangedCloudSave({projectId: null, baseVersion: null, isDirty: false, hasConflict: false})).toBe(false);
        expect(canSkipUnchangedCloudSave({projectId: "p1", baseVersion: 3, isDirty: true, hasConflict: false})).toBe(false);
        expect(canSkipUnchangedCloudSave({projectId: "p1", baseVersion: 3, isDirty: false, hasConflict: true})).toBe(false);
    });
});
