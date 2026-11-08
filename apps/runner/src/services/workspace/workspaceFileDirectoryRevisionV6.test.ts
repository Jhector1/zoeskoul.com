import { describe, expect, it } from "vitest";
import { parseWorkspaceFileRequest } from "./workspaceFileProtocol.js";

const sha = `sha256:${"c".repeat(64)}`;

describe("V6B4e2 revisioned directory operations boundary", () => {
  it("accepts a bounded directory inspect", () => {
    expect(parseWorkspaceFileRequest({ op: "inspect", path: "src/folder" }))
      .toMatchObject({ op: "inspect", path: "src/folder" });
  });
  it("requires an explicit revision to move a nonempty folder", () => {
    expect(parseWorkspaceFileRequest({ op: "move_directory", path: "src/folder", destinationPath: "dest/folder", expectedRevision: sha }))
      .toMatchObject({ op: "move_directory", path: "src/folder", destinationPath: "dest/folder", expectedRevision: sha });
    expect(() => parseWorkspaceFileRequest({ op: "move_directory", path: "src/folder", destinationPath: "dest/folder", expectedRevision: null }))
      .toThrowError("PRECONDITION_REQUIRED");
    expect(() => parseWorkspaceFileRequest({ op: "move_directory", path: "src/folder", destinationPath: "dest/folder" }))
      .toThrowError("PRECONDITION_REQUIRED");
  });
  it("keeps file-move extension restrictions unchanged", () => {
    expect(() => parseWorkspaceFileRequest({ op: "move", path: "src/main.py", destinationPath: "src/main.unrecognizedxyz", expectedRevision: sha }))
      .toThrowError("INVALID_REQUEST");
  });
  it("rejects traversal in a directory destination", () => {
    expect(() => parseWorkspaceFileRequest({ op: "move_directory", path: "src/folder", destinationPath: "../outside", expectedRevision: sha }))
      .toThrowError("INVALID_REQUEST");
  });
  it("does not authorize recursive deletion with a directory SHA", () => {
    expect(() => parseWorkspaceFileRequest({ op: "rmdir", path: "src/folder", expectedRevision: sha }))
      .toThrowError("INVALID_REQUEST");
  });
});
