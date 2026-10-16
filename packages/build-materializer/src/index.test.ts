import { describe, expect, it } from "vitest";
import type {
  BuildRequirements,
  BuildStackDefinition,
  ProjectSpecification,
} from "@zoeskoul/build-contracts";
import { BUILD_STACKS_V1 } from "@zoeskoul/build-registry";
import {
  BUILD_TEMPLATES_V1,
  type BuildTemplateDefinition,
} from "@zoeskoul/build-template-registry";
import {
  materializeBuildProject,
  materializeRegisteredBuildProject,
} from "./index";

const noManagedCapabilities: BuildRequirements = {
  backend: false,
  database: false,
  auth: false,
  storage: false,
  payments: false,
  email: false,
  commerce: false,
};

function specification(
  stackId: string,
  projectType: ProjectSpecification["projectType"] = "static-site",
): ProjectSpecification {
  return {
    version: 1,
    name: "Materializer test",
    projectType,
    targets: ["web"],
    requirements: noManagedCapabilities,
    pages: ["home"],
    stackId,
    deployment: { preference: "static" },
  };
}

describe("build materializer", () => {
  it("materializes static-html-v1 into the canonical WorkspaceStateV2 shape", () => {
    const project = materializeRegisteredBuildProject({
      specification: specification("static-html-v1"),
      createdAt: 123,
    });

    expect(project.workspace).toMatchObject({
      version: 2,
      language: "web",
      activeFileId: "index.html",
      entryFileId: "index.html",
      stdin: "",
      expanded: [],
      leftPct: 26,
    });
    expect(project.workspace.nodes.map((node) => node.id)).toEqual([
      "index.html",
      "script.js",
      "styles.css",
    ]);
    expect(project.dependencyLock).toBeNull();
  });

  it("materializes React/Vite deterministically and marks dependency lock creation explicitly", () => {
    const first = materializeRegisteredBuildProject({
      specification: specification("react-vite-v1", "frontend-app"),
      createdAt: 456,
    });
    const second = materializeRegisteredBuildProject({
      specification: specification("react-vite-v1", "frontend-app"),
      createdAt: 456,
    });

    expect(second).toEqual(first);
    expect(first.workspace.activeFileId).toBe("src/App.tsx");
    expect(first.workspace.entryFileId).toBe("src/main.tsx");
    expect(first.workspace.expanded).toEqual(["src"]);
    expect(first.workspace.nodes.some((node) => node.id === "src")).toBe(true);
    expect(first.workspace.nodes.some((node) => node.id === "package.json")).toBe(true);
    expect(first.workspace.nodes.some((node) => node.id === "pnpm-lock.yaml")).toBe(false);
    expect(first.dependencyLock).toEqual({
      manager: "pnpm",
      policy: "generate-once",
      lockfilePath: "pnpm-lock.yaml",
    });
  });

  it("keeps every registered stack bound to a registered template", () => {
    for (const stack of BUILD_STACKS_V1) {
      const template = BUILD_TEMPLATES_V1.find(
        (candidate) => candidate.id === stack.templateId,
      );
      expect(template, stack.id).toBeDefined();
      expect(template?.stackIds).toContain(stack.id);
    }
  });

  it("rejects path traversal and file/folder ambiguity before creating a workspace", () => {
    const stack: BuildStackDefinition = {
      id: "unsafe-test",
      projectTypes: ["static-site"],
      targets: ["web"],
      runtimeProfileId: "disabled-test",
      templateId: "unsafe-test",
      commands: { build: [] },
      preview: { type: "static" },
      supportedCapabilities: [],
      deploymentAdapterId: "disabled-test",
    };
    const unsafeTemplate: BuildTemplateDefinition = {
      id: "unsafe-test",
      stackIds: ["unsafe-test"],
      workspaceLanguage: "web",
      files: [{ path: "../secret.txt", content: "no" }],
      entryPath: "../secret.txt",
      dependencyLock: null,
    };

    expect(() =>
      materializeBuildProject({
        specification: {
          ...specification("static-html-v1"),
          stackId: "unsafe-test",
        },
        stack,
        template: unsafeTemplate,
        createdAt: 1,
      }),
    ).toThrow("Unsafe ZoeBuild template path");
  });

  it("fails closed when managed backend capabilities are requested", () => {
    expect(() =>
      materializeRegisteredBuildProject({
        specification: {
          ...specification("react-vite-v1", "frontend-app"),
          requirements: {
            ...noManagedCapabilities,
            database: true,
          },
        },
        createdAt: 1,
      }),
    ).toThrow("ZoeBuild stack is incompatible");
  });
});
