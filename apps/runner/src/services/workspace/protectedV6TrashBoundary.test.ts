import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isWorkspacePreservedPath,
  isWorkspaceProtectedTrashPath,
  isWorkspaceSnapshotHiddenDirPath,
} from "./runnerManagedWorkspace.js";
import { snapshotWorkspaceFiles } from "./snapshotWorkspaceFiles.js";
import { replaceWorkspaceFiles } from "./replaceWorkspaceFiles.js";
import { normalizeWorkspaceEntries } from "./workspacePolicy.js";

describe("V6 protected trash boundaries", () => {
  let root: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "zoe-v6-trash-boundary-"));
  });
  afterEach(async () => {
    // Tests may deliberately set the protected subtree to mode 000.
    const trash = path.join(root, ".zoe-v6-trash");
    await fs.chmod(trash, 0o700).catch(() => {});
    await fs.rm(root, { recursive: true, force: true });
  });

  it("recognizes protected trash at root or nested path", () => {
    expect(isWorkspaceProtectedTrashPath(".zoe-v6-trash")).toBe(true);
    expect(isWorkspaceProtectedTrashPath(".zoe-v6-trash/entry/notes.txt")).toBe(true);
    expect(isWorkspaceProtectedTrashPath("src/.zoe-v6-trash/entry")).toBe(true);
    expect(isWorkspaceProtectedTrashPath("src/notes.txt")).toBe(false);
    expect(isWorkspaceSnapshotHiddenDirPath(".zoe-v6-trash")).toBe(true);
    expect(isWorkspacePreservedPath(".zoe-v6-trash/d-123/notes.txt")).toBe(true);
  });

  it("does not enumerate a protected trash directory in an ordinary snapshot", async () => {
    await fs.writeFile(path.join(root, "main.py"), "print('ok')\n");
    const trash = path.join(root, ".zoe-v6-trash");
    await fs.mkdir(path.join(trash, "entry"), { recursive: true });
    await fs.writeFile(path.join(trash, "entry", "secret.txt"), "recover me\n");
    await fs.chmod(trash, 0o000);
    const snapshot = await snapshotWorkspaceFiles(root);
    expect(snapshot).toEqual(expect.arrayContaining([
      { kind: "file", path: "main.py", content: "print('ok')\n" },
    ]));
    expect(snapshot.some((item) => item.path.includes(".zoe-v6-trash"))).toBe(false);
  });

  it("preserves mode-0700 recovery data across full workspace replacement", async () => {
    const trash = path.join(root, ".zoe-v6-trash");
    await fs.mkdir(path.join(trash, "entry"), { recursive: true });
    await fs.writeFile(path.join(trash, "entry", "secret.txt"), "recover me\n");
    await fs.chmod(trash, 0o700);
    await replaceWorkspaceFiles(root, [
      { kind: "file", path: "main.py", content: "print('new')\n" },
    ]);
    expect((await fs.stat(trash)).mode & 0o777).toBe(0o700);
    expect(await fs.readFile(path.join(trash, "entry", "secret.txt"), "utf8"))
      .toBe("recover me\n");
    expect(await fs.readFile(path.join(root, "main.py"), "utf8"))
      .toBe("print('new')\n");
  });

  it("drops caller-supplied protected trash entries from replacement", () => {
    expect(normalizeWorkspaceEntries([
      { kind: "directory", path: ".zoe-v6-trash" },
      { kind: "file", path: "main.py", content: "print('ok')\n" },
    ], { dropRunnerManaged: true }).map((e) => e.path)).toEqual(["main.py"]);
  });
});
