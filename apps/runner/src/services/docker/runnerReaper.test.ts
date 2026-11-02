import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Use a private, dynamically selected root so parallel workspace tests cannot
// delete each other's fixtures. Never remove the shared RUNNER_WORKSPACE_ROOT.
const fixture = vi.hoisted(() => ({ root: "" }));
vi.mock("../../lib/env.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../lib/env.js")>();
  return {
    env: {
      ...original.env,
      get workspaceRoot() {
        return fixture.root;
      },
    },
  };
});

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
  let privateRoot: string;

  beforeEach(async () => {
    privateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "zoeskoul-runner-reaper-test-"));
    fixture.root = privateRoot;
  });

  afterEach(async () => {
    await fs.rm(privateRoot, { recursive: true, force: true });
    fixture.root = "";
  });

  it("removes every runner-owned workspace after process restart", async () => {
    const leakedA = path.join(privateRoot, "zoeskoul-run-a");
    const leakedB = path.join(privateRoot, "zoeskoul-run-b");
    const unrelated = path.join(privateRoot, "keep-me");

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
