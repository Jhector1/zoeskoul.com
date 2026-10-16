import { describe, expect, it, vi } from "vitest";
import type { BuildProjectPersistence } from "./index";
import {
  BuildAccessError,
  BuildProjectDefinitionError,
  createBuildProjectCommand,
  resolveBuildAccess,
} from "./index";

const requirements = {
  backend: false,
  database: false,
  auth: false,
  storage: false,
  payments: false,
  email: false,
  commerce: false,
} as const;

function specification(stackId = "static-html-v1") {
  return {
    version: 1 as const,
    name: "My Site",
    projectType: "static-site" as const,
    targets: ["web"] as const,
    requirements,
    pages: ["home"] as const,
    stackId,
    deployment: { preference: "static" as const },
  };
}

function persistence(): BuildProjectPersistence {
  return {
    createInitialBuildProject: vi.fn(async () => ({
      codeProjectId: "code_1",
      buildProjectId: "build_1",
      sourceVersion: 1,
    })),
  };
}

describe("ZoeBuild access and create command", () => {
  it("allows source-only project bootstrap for an authenticated free account", () => {
    const decision = resolveBuildAccess({ userId: " user_1 ", entitlements: [] });
    expect(decision).toMatchObject({
      authenticated: true,
      userId: "user_1",
      canCreateProject: true,
      canGenerateWithAi: false,
      canPublish: false,
      canProvisionDatabase: false,
    });
  });

  it("fails closed for an unauthenticated actor", async () => {
    await expect(
      createBuildProjectCommand({
        access: { userId: null, entitlements: ["build_create"] },
        specification: specification(),
        createdAt: 1,
        persistence: persistence(),
      }),
    ).rejects.toMatchObject({
      code: "BUILD_AUTH_REQUIRED",
    });
  });

  it("can later require an explicit build_create entitlement without changing the command", async () => {
    const store = persistence();
    await expect(
      createBuildProjectCommand({
        access: { userId: "user_1", entitlements: [] },
        policy: { allowAuthenticatedCreate: false },
        specification: specification(),
        createdAt: 1,
        persistence: store,
      }),
    ).rejects.toMatchObject({
      code: "BUILD_ACCESS_DENIED",
    });

    await expect(
      createBuildProjectCommand({
        access: { userId: "user_1", entitlements: ["build_create"] },
        policy: { allowAuthenticatedCreate: false },
        specification: specification(),
        createdAt: 1,
        persistence: store,
      }),
    ).resolves.toMatchObject({ sourceVersion: 1 });
  });

  it("classifies unsupported stack/template combinations before persistence", async () => {
    const store = persistence();
    await expect(
      createBuildProjectCommand({
        access: { userId: "user_1", entitlements: [] },
        specification: specification("unknown-stack-v1"),
        createdAt: 1,
        persistence: store,
      }),
    ).rejects.toBeInstanceOf(BuildProjectDefinitionError);
    expect(store.createInitialBuildProject).not.toHaveBeenCalled();
  });
});
