import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(fileURLToPath(new URL("sessions.snapshotWorkspace.ts", import.meta.url)), "utf8");

describe("workspace snapshot restricted-permission safety", () => {
  it("maps EACCES and EPERM to a controlled 409 without host paths", () => {
    expect(source).toContain('code === "EACCES" || code === "EPERM"');
    expect(source).toContain('res.status(409).json({');
    expect(source).toContain('WORKSPACE_SNAPSHOT_ACCESS_RESTRICTED');
  });
  it("does not skip unreadable files and return a partial successful snapshot", () => {
    expect(source).toContain('snapshotWorkspaceFiles(session.workspaceDir!)');
    expect(source).not.toContain('files: []');
    expect(source).toContain('No files were synchronized.');
  });
});
