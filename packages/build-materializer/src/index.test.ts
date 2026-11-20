import { describe, expect, it } from "vitest";
import type {
  BuildRequirements,
  BuildStackDefinition,
  ProjectSpecification,
} from "@zoeskoul/build-contracts";
import { BUILD_STACKS_V1 } from "@zoeskoul/build-registry";
import { BUILD_TEMPLATES_V1, type BuildTemplateDefinition } from "@zoeskoul/build-template-registry";
import { materializeBuildProject, materializeRegisteredBuildProject } from "./index";

const noManagedCapabilities: BuildRequirements = {
  backend: false,
  database: false,
  auth: false,
  storage: false,
  payments: false,
  email: false,
  commerce: false,
};

function specification(stackId = "tanstack-start-v1"): ProjectSpecification {
  return {
    version: 1,
    name: "Materializer test",
    projectType: "fullstack-app",
    targets: ["web"],
    requirements: noManagedCapabilities,
    pages: ["Home"],
    stackId,
    deployment: { preference: "managed-runtime" },
  };
}

describe("build materializer", () => {
  it("materializes the canonical TanStack template to WorkspaceStateV2", () => {
    const project = materializeRegisteredBuildProject({
      specification: specification(),
      createdAt: 123,
    });
    expect(project.workspace).toMatchObject({
      version: 2,
      language: "web",
      activeFileId: "src/routes/index.tsx",
      entryFileId: "src/router.tsx",
      stdin: "",
      leftPct: 26,
    });
    expect(project.workspace.nodes.some((node) => node.id === "src/routes/index.tsx")).toBe(true);
    expect(project.workspace.nodes.some((node) => node.id === "src/server/siteInfo.server.ts")).toBe(true);
    expect(project.workspace.expanded).toContain("src/routes");
  });

  it("scaffolds distinct planned routes with safe literal labels and shared layout", () => {
    const pages = ["Home", "ABOUT", "Menu", "Menu!", "index", "../../foo", "<script>alert(1)</script>", "菜单"];
    const project = materializeRegisteredBuildProject({ specification: { ...specification(), pages }, createdAt: 1 });
    const files = new Map(project.workspace.nodes.filter(node => node.kind === "file").map(node => [node.id, node.content ?? ""]));
    for (const path of ["menu", "menu-2", "index-2", "foo", "script-alert-1-script", "page-8"]) {
      expect(files.get(`src/routes/${path}.tsx`)).toContain(`createFileRoute("/${path}")`);
    }
    expect(files.get("src/routes/script-alert-1-script.tsx")).toContain('title={"<script>alert(1)</script>"}');
    expect(files.get("src/data/site.ts")).toContain('"to": "/menu-2"');
    expect(files.get("src/components/PlannedPage.tsx")).toContain("still need implementation");
    expect(files.get("src/routes/api.health.ts")).toContain('createFileRoute("/api/health")');
    expect([...files.keys()].some(path => path.includes(".."))).toBe(false);
  });

  it("is deterministic and requires a generated dependency lock", () => {
    const first = materializeRegisteredBuildProject({
      specification: specification(), createdAt: 456,
    });
    const second = materializeRegisteredBuildProject({
      specification: specification(), createdAt: 456,
    });
    expect(second).toEqual(first);
    expect(first.workspace.nodes.some((node) => node.id === "package.json")).toBe(true);
    expect(first.workspace.nodes.some((node) => node.id === "pnpm-lock.yaml")).toBe(false);
    expect(first.dependencyLock).toEqual({
      manager: "pnpm", policy: "generate-once", lockfilePath: "pnpm-lock.yaml",
    });
  });

  it("keeps every registered stack bound to a registered template", () => {
    expect(BUILD_STACKS_V1.map((stack) => stack.id)).toEqual(["tanstack-start-v1"]);
    for (const stack of BUILD_STACKS_V1) {
      const template = BUILD_TEMPLATES_V1.find((candidate) => candidate.id === stack.templateId);
      expect(template, stack.id).toBeDefined();
      expect(template?.stackIds).toContain(stack.id);
    }
  });

  it("rejects path traversal and file/folder ambiguity before creating a workspace", () => {
    const stack: BuildStackDefinition = {
      id: "unsafe-test",
      projectTypes: ["fullstack-app"],
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
    expect(() => materializeBuildProject({
      specification: specification("unsafe-test"),
      stack,
      template: unsafeTemplate,
      createdAt: 1,
    })).toThrow("Unsafe ZoeBuild template path");
  });

  it("fails closed on unsupported database capabilities", () => {
    expect(() => materializeRegisteredBuildProject({
      specification: {
        ...specification(),
        requirements: { ...noManagedCapabilities, database: true },
      },
      createdAt: 1,
    })).toThrow("ZoeBuild stack is incompatible");
  });
});
