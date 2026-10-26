import { describe, expect, it } from "vitest";
import { applyZoeEditsToWorkspace, listZoeEditableFiles, sha256, validateZoeEdits } from "./zoeTargetedSourceEdit";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
const source: WorkspaceStateV2 = {
  version: 2, language: "web", leftPct: 30, stdin: "", expanded: [],
  activeFileId: "a", entryFileId: "a", openTabs: ["a"],
  nodes: [
    { id: "a", kind: "file", name: "index.html", parentId: null, content: "<h1>Old</h1>", createdAt: 1, updatedAt: 1 },
    { id: "b", kind: "file", name: "styles.css", parentId: null, content: "h1 { color: black; }", createdAt: 1, updatedAt: 1 },
  ],
};
const edit = { path: "index.html", beforeSha256: sha256("<h1>Old</h1>"), content: "<h1>New</h1>" };
describe("Zoé targeted edits", () => {
  it("limits AI source context to supported visible text files", () => {
    expect(listZoeEditableFiles(source, "index.html").map((f) => f.path)).toEqual(["index.html", "styles.css"]);
  });
  it("changes only the approved existing file and preserves other project files", () => {
    const next = applyZoeEditsToWorkspace(source, [edit]);
    expect((next.nodes[0] as {content: string}).content).toBe("<h1>New</h1>");
    expect(next.nodes[1]).toEqual(source.nodes[1]);
  });
  it("rejects stale content, empty diffs and forbidden files", () => {
    expect(() => validateZoeEdits(source, [{ ...edit, beforeSha256: sha256("different") }])).toThrow();
    expect(() => validateZoeEdits(source, [{ ...edit, content: "<h1>Old</h1>" }])).toThrow();
    expect(() => validateZoeEdits(source, [{ ...edit, path: ".env" }])).toThrow();
    const secretFixture: WorkspaceStateV2 = {
      ...source,
      // Only exercise the read-only allowlist: .env cannot be persisted by the
      // canonical workspace validator and must never reach the save path.
      nodes: [...source.nodes, {
        id: "secret", kind: "file", name: ".env", parentId: null,
        content: "SECRET=never-exposed", createdAt: 1, updatedAt: 1,
      }],
    };
    expect(listZoeEditableFiles(secretFixture, "index.html").map((f) => f.path)).not.toContain(".env");
    expect(() => validateZoeEdits(secretFixture, [{...edit, path: ".env"}])).toThrow();
  });
  it("rejects duplicate targets", () => {
    expect(() => validateZoeEdits(source, [edit, edit])).toThrow();
  });
});
