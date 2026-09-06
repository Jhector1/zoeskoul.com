import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDirectoryUsage } from "./workspacePolicy.js";

describe("workspace disk usage scanner", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "zoe-workspace-usage-"));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("counts nested bytes and entries", async () => {
    await fs.mkdir(path.join(root, "nested"), { recursive: true });
    await fs.writeFile(path.join(root, "a.txt"), "1234");
    await fs.writeFile(path.join(root, "nested", "b.txt"), "123456");

    await expect(getDirectoryUsage(root)).resolves.toEqual({
      bytes: 10,
      entries: 3,
    });
  });

  it("stops scanning once a byte or entry ceiling is exceeded", async () => {
    await fs.writeFile(path.join(root, "a.txt"), "123456");
    await fs.writeFile(path.join(root, "b.txt"), "abcdef");

    const byBytes = await getDirectoryUsage(root, { maxBytes: 5 });
    expect(byBytes.bytes).toBeGreaterThan(5);

    const byEntries = await getDirectoryUsage(root, { maxEntries: 1 });
    expect(byEntries.entries).toBeGreaterThan(1);
  });
});
