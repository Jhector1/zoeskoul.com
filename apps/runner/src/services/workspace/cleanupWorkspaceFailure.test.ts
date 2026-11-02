import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../docker/runnerWorkspaceReclamation.js", () => ({
  removeRunnerWorkspaceWithRecovery: vi.fn(),
}));

import { removeRunnerWorkspaceWithRecovery } from "../docker/runnerWorkspaceReclamation.js";
import { cleanupWorkspaceNow } from "./cleanupWorkspace.js";

const reclaim = vi.mocked(removeRunnerWorkspaceWithRecovery);

describe("strict Runner workspace cleanup for preview lifecycle", () => {
  beforeEach(() => { reclaim.mockReset(); });

  it("propagates failed recovery so preview cleanup is not accepted", async () => {
    reclaim.mockRejectedValueOnce(new Error("reclamation denied"));
    await expect(cleanupWorkspaceNow("/runner/test")).rejects.toThrow("reclamation denied");
    expect(reclaim).toHaveBeenCalledExactlyOnceWith("/runner/test");
  });

  it("succeeds only after recovery confirms removal", async () => {
    reclaim.mockResolvedValueOnce();
    await expect(cleanupWorkspaceNow("/runner/test")).resolves.toBeUndefined();
    expect(reclaim).toHaveBeenCalledExactlyOnceWith("/runner/test");
  });
});
