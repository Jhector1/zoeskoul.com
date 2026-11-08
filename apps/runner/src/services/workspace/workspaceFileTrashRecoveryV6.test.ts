import { describe, expect, it } from "vitest";
import { parseWorkspaceFileRequest } from "./workspaceFileProtocol.js";

const sha = `sha256:${"e".repeat(64)}`;
const token = "0123456789abcdef0123456789abcdef";

describe("V6B4e3 recoverable directory trash boundary", () => {
  it("requires a last-inspected subtree revision for trash", () => {
    expect(parseWorkspaceFileRequest({ op: "trash_directory", path: "src/folder", expectedRevision: sha }))
      .toMatchObject({ op: "trash_directory", path: "src/folder", expectedRevision: sha });
    expect(() => parseWorkspaceFileRequest({ op: "trash_directory", path: "src/folder" }))
      .toThrowError("PRECONDITION_REQUIRED");
    expect(() => parseWorkspaceFileRequest({ op: "trash_directory", path: "src/folder", expectedRevision: null }))
      .toThrowError("PRECONDITION_REQUIRED");
  });
  it("permits listing trash only at the workspace root", () => {
    expect(parseWorkspaceFileRequest({ op: "list_trash", path: "" }))
      .toMatchObject({ op: "list_trash", path: "" });
    expect(() => parseWorkspaceFileRequest({ op: "list_trash", path: "src" })).toThrowError("INVALID_REQUEST");
  });
  it("validates restore tokens and explicit null destination precondition", () => {
    expect(parseWorkspaceFileRequest({ op: "restore_directory", path: "src/folder", trashId: token, expectedRevision: null }))
      .toMatchObject({ op: "restore_directory", path: "src/folder", trashId: token, expectedRevision: null });
    expect(() => parseWorkspaceFileRequest({ op: "restore_directory", path: "src/folder", trashId: token }))
      .toThrowError("PRECONDITION_REQUIRED");
    expect(() => parseWorkspaceFileRequest({ op: "restore_directory", path: "src/folder", trashId: "../etc", expectedRevision: null }))
      .toThrowError("INVALID_REQUEST");
    expect(() => parseWorkspaceFileRequest({ op: "restore_directory", path: "src/folder", trashId: token, expectedRevision: sha }))
      .toThrowError("INVALID_REQUEST");
  });
  it("denies the internal trash directory and parent traversal", () => {
    expect(() => parseWorkspaceFileRequest({ op: "inspect", path: ".zoe-v6-trash/d-" + token })).toThrowError("INVALID_REQUEST");
    expect(() => parseWorkspaceFileRequest({ op: "trash_directory", path: "../src", expectedRevision: sha })).toThrowError("INVALID_REQUEST");
    expect(() => parseWorkspaceFileRequest({ op: "restore_directory", path: ".zoe-v6-trash", trashId: token, expectedRevision: null })).toThrowError("INVALID_REQUEST");
  });
  it("keeps recursive rmdir unavailable", () => {
    expect(() => parseWorkspaceFileRequest({ op: "rmdir", path: "src/folder", expectedRevision: sha }))
      .toThrowError("INVALID_REQUEST");
  });
});
