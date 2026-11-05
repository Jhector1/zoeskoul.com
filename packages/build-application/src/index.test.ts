import { describe, expect, it, vi } from "vitest";
import type {
  BuildProjectPersistence,
  InitialBuildProjectPersistenceInput,
} from "./index";
import { createBuildProject } from "./index";

const noManagedCapabilities = {
  backend: true,
  database: false,
  auth: false,
  storage: false,
  payments: false,
  email: false,
  commerce: false,
} as const;

function tanstackSpecification() {
  return {
    version: 1 as const,
    name: "  My Zoe Site  ",
    projectType: "fullstack-app" as const,
    targets: ["web"] as const,
    requirements: noManagedCapabilities,
    pages: ["home"] as const,
    stackId: "tanstack-start-v1",
    deployment: { preference: "managed-runtime" as const },
  };
}

describe("build application service", () => {
  it("materializes first, then persists one canonical initial source revision", async () => {
    const received: InitialBuildProjectPersistenceInput[] = [];
    const persist = vi.fn(async (input: InitialBuildProjectPersistenceInput) => {
      received.push(input);
      return {
        codeProjectId: "code_1",
        buildProjectId: "build_1",
        sourceVersion: 1,
      };
    });

    const persistence: BuildProjectPersistence = {
      createInitialBuildProject: persist,
    };

    const result = await createBuildProject({
      ownerId: " user_1 ",
      specification: tanstackSpecification(),
      createdAt: 123,
      persistence,
    });

    expect(persist).toHaveBeenCalledTimes(1);
    const persistedInput = received[0];
    expect(persistedInput).toBeDefined();
    if (!persistedInput) {
      throw new Error("Expected one persisted ZoeBuild bootstrap input.");
    }
    expect(persistedInput).toMatchObject({
      ownerId: "user_1",
      title: "My Zoe Site",
      language: "web",
      entryPath: "src/router.tsx",
      activePath: "src/routes/index.tsx",
      stackId: "tanstack-start-v1",
      templateId: "tanstack-start-v1",
      dependencyLock: { manager: "pnpm", policy: "generate-once", lockfilePath: "pnpm-lock.yaml" },
    });
    expect(persistedInput.workspace).toMatchObject({
      version: 2,
      entryFileId: "src/router.tsx",
      activeFileId: "src/routes/index.tsx",
    });
    expect(result).toEqual({
      codeProjectId: "code_1",
      buildProjectId: "build_1",
      sourceVersion: 1,
      stackId: "tanstack-start-v1",
      templateId: "tanstack-start-v1",
      dependencyLock: { manager: "pnpm", policy: "generate-once", lockfilePath: "pnpm-lock.yaml" },
    });
  });

  it("fails before persistence when owner identity is missing", async () => {
    const persistence: BuildProjectPersistence = {
      createInitialBuildProject: vi.fn(async () => ({
        codeProjectId: "never",
        buildProjectId: "never",
        sourceVersion: 1,
      })),
    };

    await expect(
      createBuildProject({
        ownerId: "   ",
        specification: tanstackSpecification(),
        createdAt: 123,
        persistence,
      }),
    ).rejects.toThrow("ZoeBuild owner id is required");
    expect(persistence.createInitialBuildProject).not.toHaveBeenCalled();
  });

  it("fails closed if persistence does not create version 1", async () => {
    const persistence: BuildProjectPersistence = {
      createInitialBuildProject: vi.fn(async () => ({
        codeProjectId: "code_2",
        buildProjectId: "build_2",
        sourceVersion: 2,
      })),
    };

    await expect(
      createBuildProject({
        ownerId: "user_2",
        specification: tanstackSpecification(),
        createdAt: 123,
        persistence,
      }),
    ).rejects.toThrow("initial source revision must be version 1");
  });
});
