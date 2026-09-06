import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env } from "../../lib/env.js";
import { cleanupAllRunnerWorkspaceDirs } from "./runnerReaper.js";

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

describe("runner startup workspace reaper", () => {
  beforeEach(async () => {
    await fs.rm(env.workspaceRoot, { recursive: true, force: true });
    await fs.mkdir(env.workspaceRoot, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(env.workspaceRoot, { recursive: true, force: true });
  });

  it("removes every runner-owned workspace after process restart", async () => {
    const leakedA = path.join(env.workspaceRoot, "zoeskoul-run-a");
    const leakedB = path.join(env.workspaceRoot, "zoeskoul-run-b");
    const unrelated = path.join(env.workspaceRoot, "keep-me");

    await fs.mkdir(leakedA, { recursive: true });
    await fs.mkdir(leakedB, { recursive: true });
    await fs.mkdir(unrelated, { recursive: true });
    await fs.writeFile(path.join(leakedA, "recent.txt"), "recent");

    await cleanupAllRunnerWorkspaceDirs();

    expect(await exists(leakedA)).toBe(false);
    expect(await exists(leakedB)).toBe(false);
    expect(await exists(unrelated)).toBe(true);
  });
});
