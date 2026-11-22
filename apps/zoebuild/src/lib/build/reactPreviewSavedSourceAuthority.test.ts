import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBuildProjectCommand } from "@zoeskoul/build-application";
import {
  createRegisteredProductionBuildJob,
  prepareRegisteredBuildArtifactPlan,
} from "@zoeskoul/build-preparation";
import { parseBuildWorkspaceMutation } from "./buildWorkspaceMutation";
import {
  createOwnedReactPreviewBuildRequestFromSavedSource,
} from "./reactPreviewServer";

vi.mock("server-only", () => ({}));
vi.mock("@zoeskoul/build-application", () => ({
  BuildAccessError: class BuildAccessError extends Error {},
  getBuildProjectCommand: vi.fn(),
}));
vi.mock("@zoeskoul/build-preparation", () => ({
  BuildPreparationError: class BuildPreparationError extends Error {},
  createRegisteredProductionBuildJob: vi.fn(),
  prepareRegisteredBuildArtifactPlan: vi.fn(),
}));
vi.mock("@zoeskoul/platform-server/prisma", () => ({ prisma: {} }));
vi.mock("./readBuildProjects", () => ({
  createPrismaBuildProjectReader: vi.fn(() => ({})),
}));
vi.mock("./buildWorkspaceMutation", () => ({
  BuildWorkspaceMutationError: class BuildWorkspaceMutationError extends Error {},
  parseBuildWorkspaceMutation: vi.fn((workspace: unknown) => workspace),
}));
vi.mock("./previewSourceIdentity", () => ({
  previewWorkspaceMatchesSavedSource: vi.fn(() => true),
}));

const workspace = { nodes: [{ id: "one", name: "index.tsx", kind: "file", content: "saved bytes" }] };
const project = {
  buildProjectId: "build-project-1",
  stackId: "tanstack-start-v1",
  specification: { stackId: "tanstack-start-v1" },
  sourceVersion: 8,
  workspace,
};
const access = { userId: "owner-1" } as never;
const call = (sourceVersion: unknown = 8) =>
  createOwnedReactPreviewBuildRequestFromSavedSource({
    access, buildProjectId: "build-project-1", sourceVersion,
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getBuildProjectCommand).mockResolvedValue(project as never);
  vi.mocked(parseBuildWorkspaceMutation).mockImplementation(value => value as never);
  vi.mocked(prepareRegisteredBuildArtifactPlan).mockReturnValue({
    dependencyLock: { state: "ready" },
  } as never);
  vi.mocked(createRegisteredProductionBuildJob).mockReturnValue({
    operation: "production-build", sourceVersion: 8, files: [],
  } as never);
});

describe("Phase 4A saved-source preview authority (not routed)", () => {
  it("reads the owned project and builds only from persisted workspace bytes", async () => {
    await expect(call()).resolves.toMatchObject({ sourceVersion: 8 });
    expect(getBuildProjectCommand).toHaveBeenCalledOnce();
    expect(vi.mocked(getBuildProjectCommand).mock.calls[0]?.[0]).toMatchObject({
      access, buildProjectId: "build-project-1",
    });
    expect(parseBuildWorkspaceMutation).toHaveBeenCalledExactlyOnceWith(workspace);
    expect(prepareRegisteredBuildArtifactPlan).toHaveBeenCalledWith(
      expect.objectContaining({workspace,sourceVersion:8,buildProjectId:"build-project-1"}),
    );
    expect(createRegisteredProductionBuildJob).toHaveBeenCalledWith(
      expect.objectContaining({workspace,sourceVersion:8,buildProjectId:"build-project-1"}),
    );
  });

  it("rejects stale, future, string, and fractional versions before consuming saved files", async () => {
    for (const value of [7,9,"8",8.5,null]) {
      await expect(call(value)).rejects.toMatchObject({
        code:"BUILD_PREVIEW_SOURCE_CONFLICT",status:409,
      });
    }
    expect(prepareRegisteredBuildArtifactPlan).not.toHaveBeenCalled();
    expect(createRegisteredProductionBuildJob).not.toHaveBeenCalled();
  });

  it("rejects invalid persisted workspace and never forwards it to build preparation", async () => {
    vi.mocked(parseBuildWorkspaceMutation).mockImplementation(() => {throw new Error("unsafe saved source");});
    await expect(call()).rejects.toMatchObject({
      code:"BUILD_PREVIEW_SOURCE_CONFLICT",status:409,
    });
    expect(prepareRegisteredBuildArtifactPlan).not.toHaveBeenCalled();
  });

  it("rejects missing frozen dependency approval without constructing a Runner request", async () => {
    vi.mocked(prepareRegisteredBuildArtifactPlan).mockReturnValue({
      dependencyLock:{state:"bootstrap-required"},
    } as never);
    await expect(call()).rejects.toMatchObject({
      code:"BUILD_DEPENDENCY_LOCK_INVALID",status:409,
    });
    expect(createRegisteredProductionBuildJob).not.toHaveBeenCalled();
  });

  it("rejects nonexistent projects or a different stack", async () => {
    vi.mocked(getBuildProjectCommand).mockResolvedValueOnce(null as never);
    await expect(call()).rejects.toMatchObject({status:404});
    vi.mocked(getBuildProjectCommand).mockResolvedValueOnce({
      ...project,stackId:"react-vite-v1",
    } as never);
    await expect(call()).rejects.toMatchObject({status:409});
    expect(createRegisteredProductionBuildJob).not.toHaveBeenCalled();
  });
});
