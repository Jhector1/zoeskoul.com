import { describe, expect, it } from "vitest";
import { parseWorkspaceFileRequest } from "./workspaceFileProtocol.js";

const sha = `sha256:${"a".repeat(64)}`;

describe("V6B4e Learning workspace structural operation boundary", () => {
  it("accepts revision-checked file moves with validated destination", () => {
    expect(parseWorkspaceFileRequest({
      op: "move", path: "src/main.py", destinationPath: "src/renamed.py",
      expectedRevision: sha,
    })).toMatchObject({
      op: "move", path: "src/main.py", destinationPath: "src/renamed.py",
      expectedRevision: sha,
    });
  });

  it("allows only explicit null revision for an empty folder move", () => {
    expect(parseWorkspaceFileRequest({
      op: "move", path: "src/empty", destinationPath: "src/renamed",
      expectedRevision: null,
    })).toMatchObject({ expectedRevision: null });
  });

  it("requires a revision field for structural mutations", () => {
    for (const body of [
      { op: "move", path: "src/main.py", destinationPath: "src/new.py" },
      { op: "rmdir", path: "src/empty" },
    ]) {
      expect(() => parseWorkspaceFileRequest(body)).toThrowError("PRECONDITION_REQUIRED");
    }
  });

  it("removes only explicitly requested empty directories", () => {
    expect(parseWorkspaceFileRequest({
      op: "rmdir", path: "src/empty", expectedRevision: null,
    })).toMatchObject({ op: "rmdir", path: "src/empty", expectedRevision: null });
    expect(() => parseWorkspaceFileRequest({
      op: "rmdir", path: "src", expectedRevision: sha,
    })).toThrow();
  });

  it("denies traversal and managed paths in source and destination", () => {
    const blocked = ["../private.py", "src/../../escape.py", "src/node_modules/x.py",
      ".git/config", "src/.zoe-v6-file-abcd", "src/target/x.py"];
    for (const path of blocked.slice(0, 5)) {
      expect(() => parseWorkspaceFileRequest({
        op: "move", path: "src/main.py", destinationPath: path,
        expectedRevision: sha,
      })).toThrow();
    }
    expect(() => parseWorkspaceFileRequest({
      op: "move", path: "src/../escape.py", destinationPath: "src/new.py",
      expectedRevision: sha,
    })).toThrow();
    expect(() => parseWorkspaceFileRequest({
      op: "move", path: "src/main.py", destinationPath: "src/main.py",
      expectedRevision: sha,
    })).toThrow();
  });

  it("rejects unsupported source or destination file capabilities", () => {
    expect(() => parseWorkspaceFileRequest({
      op: "move", path: "src/main.py", destinationPath: "src/evil.unknownextensionxyz",
      expectedRevision: sha,
    })).toThrow();
  });
});
