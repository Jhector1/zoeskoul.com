import { describe, expect, it } from "vitest";
import { parseWorkspaceFileRequest, WorkspaceFileInputError } from "./workspaceFileProtocol.js";

const digest = `sha256:${"a".repeat(64)}`;

describe("V6A file-worker protocol", () => {
  it("derives max bytes on the server, not from user input", () => {
    const result = parseWorkspaceFileRequest({ op: "read", path: "src/main.c", maxBytes: 999999999 });
    expect(result.maxBytes).toBeLessThanOrEqual(5 * 1024 * 1024);
  });
  it("requires exact revision for overwrites", () => {
    expect(() => parseWorkspaceFileRequest({ op: "write", path: "src/main.c", data: "YQ==" }))
      .toThrow(WorkspaceFileInputError);
    expect(parseWorkspaceFileRequest({ op: "write", path: "src/main.c", expectedRevision: digest, data: "YQ==" }))
      .toMatchObject({ expectedRevision: digest });
  });
  it("permits explicit create-if-absent", () => {
    expect(parseWorkspaceFileRequest({ op: "write", path: "src/main.c", expectedRevision: null, data: "YQ==" }))
      .toMatchObject({ expectedRevision: null });
  });
  it("rejects path escapes and hidden runtime state", () => {
    for (const path of ["../outside.c", ".git/config", "build/app.js", "src/node_modules/index.js", ".bash_history", "src/.zoe-v6-file-temp"])
      expect(() => parseWorkspaceFileRequest({ op: "read", path })).toThrow();
  });
  it("does not allow file edits without a supported file capability", () => {
    expect(() => parseWorkspaceFileRequest({ op: "write", path: "src/evil.exe", expectedRevision: null, data: "YQ==" })).toThrow();
  });
  it("permits only root directory listing with blank path", () => {
    expect(parseWorkspaceFileRequest({ op: "list", path: "" })).toMatchObject({ op: "list", path: "" });
    expect(() => parseWorkspaceFileRequest({ op: "write", path: "", expectedRevision: null, data: "" })).toThrow();
  });
  it("does not accept a client-defined worker command or operation", () => {
    expect(() => parseWorkspaceFileRequest({ op: "execute", path: "src/main.c", command: "/bin/sh" })).toThrow();
  });
});
