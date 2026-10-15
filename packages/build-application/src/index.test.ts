import { describe, expect, it, vi } from "vitest";
import type {
  BuildProjectPersistence,
  InitialBuildProjectPersistenceInput,
} from "./index";
import { createBuildProject } from "./index";

const noManagedCapabilities = {
  backend: false,
  database: false,
  auth: false,
  storage: false,
  payments: false,
  email: false,
  commerce: false,
} as const;

function staticSpecification() {
  return {
    version: 1 as const,
    name: "  My Zoe Site  ",
    projectType: "static-site" as const,
    targets: ["web"] as const,
    requirements: noManagedCapabilities,
    pages: ["home"] as const,
    stackId: "static-html-v1",
    deployment: { preference: "static" as const },
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
      specification: staticSpecification(),
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
      entryPath: "index.html",
      activePath: "index.html",
      stackId: "static-html-v1",
      templateId: "static-html-v1",
      dependencyLock: null,
    });
    expect(persistedInput.workspace).toMatchObject({
      version: 2,
      entryFileId: "index.html",
      activeFileId: "index.html",
    });
    expect(result).toEqual({
      codeProjectId: "code_1",
      buildProjectId: "build_1",
      sourceVersion: 1,
      stackId: "static-html-v1",
      templateId: "static-html-v1",
      dependencyLock: null,
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
        specification: staticSpecification(),
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
        specification: staticSpecification(),
        createdAt: 123,
        persistence,
      }),
    ).rejects.toThrow("initial source revision must be version 1");
  });
});
