import { describe, expect, it, vi } from "vitest";
import { createBuildProject, type InitialBuildProjectPersistenceInput } from "./index";
import { parseProjectSpecification } from "@zoeskoul/build-contracts";

const base = {
  version: 1, name: "TanStack App", projectType: "fullstack-app",
  targets: ["web"], pages: ["Home"], stackId: "tanstack-start-v1",
  requirements: { backend: true, database: false, auth: false,
    storage: false, payments: false, email: false, commerce: false },
  deployment: { preference: "managed-runtime" },
} as const;

const persistence = () => ({
  createInitialBuildProject: vi.fn(async (_input: InitialBuildProjectPersistenceInput) => ({
    codeProjectId: "code_test", buildProjectId: "build_test", sourceVersion: 1 as const,
  })),
});

describe("TanStack-only project bootstrap", () => {
  it("persists the canonical SSR source layout once", async () => {
    const storage = persistence();
    const result = await createBuildProject({
      ownerId: "owner", specification: parseProjectSpecification(base),
      createdAt: 123, persistence: storage,
    });
    expect(result.stackId).toBe("tanstack-start-v1");
    expect(storage.createInitialBuildProject).toHaveBeenCalledTimes(1);
    const saved = storage.createInitialBuildProject.mock.calls[0]?.[0];
    expect(saved).toMatchObject({
      stackId: "tanstack-start-v1", templateId: "tanstack-start-v1",
      activePath: "src/routes/index.tsx", entryPath: "src/router.tsx",
    });
  });
  it("rejects old stack identifiers before persistence", async () => {
    const storage = persistence();
    for (const id of ["static-html-v1", "react-vite-v1", "commerce-react-vite-v1"]) {
      await expect(createBuildProject({
        ownerId: "owner",
        specification: parseProjectSpecification({ ...base, stackId: id }),
        createdAt: 123, persistence: storage,
      })).rejects.toThrow("TanStack Start web projects only");
    }
    expect(storage.createInitialBuildProject).not.toHaveBeenCalled();
  });
  it("materializes the TanStack commerce contract without falling back to static checkout", async () => {
    const storage = persistence();
    const spec = parseProjectSpecification({
      ...base,
      requirements: { ...base.requirements, payments: true, commerce: true },
      commerce: { storefrontRuntime: "tanstack-start" },
    });
    await createBuildProject({ ownerId: "owner", specification: spec,
      createdAt: 123, persistence: storage });
    expect(storage.createInitialBuildProject).toHaveBeenCalledTimes(1);
  });
});
