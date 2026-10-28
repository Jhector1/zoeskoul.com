import { describe, expect, it } from "vitest";
import type { ProjectSpecification } from "@zoeskoul/build-contracts";
import { materializeRegisteredBuildProject } from "@zoeskoul/build-materializer";
import type { WorkspaceStateV2 } from "@zoeskoul/workspace-contracts";

import {
  BuildPreparationError,
  prepareRegisteredBuildArtifactPlan,
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

function specification(
  stackId: "static-html-v1" | "react-vite-v1",
): ProjectSpecification {
  return {
    version: 1,
    name: "Preparation test",
    projectType:
      stackId === "static-html-v1" ? "static-site" : "frontend-app",
    targets: ["web"],
    requirements,
    pages: ["Home"],
    stackId,
    deployment: { preference: "static" },
  };
}

function materialized(
  stackId: "static-html-v1" | "react-vite-v1",
): WorkspaceStateV2 {
  return materializeRegisteredBuildProject({
    specification: specification(stackId),
    createdAt: 1,
  }).workspace;
}

function addTextFile(
  workspace: WorkspaceStateV2,
  path: string,
  content: string,
): WorkspaceStateV2 {
  return {
    ...workspace,
    nodes: [
      ...workspace.nodes,
      {
        id: path,
        kind: "file",
        name: path,
        parentId: null,
        content,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  };
}

describe("ZoeBuild artifact preparation", () => {
  it("rejects the retired static HTML template without reviving legacy publishing", () => {
    // The removed template cannot be materialized. Supply a valid React
    // workspace so the preparation API must itself refuse the old stack.
    expect(() => prepareRegisteredBuildArtifactPlan({
      specification: specification("static-html-v1"),
      workspace: materialized("react-vite-v1"),
      sourceVersion: 3,
    })).toThrow(BuildPreparationError);
    expect(() => prepareRegisteredBuildArtifactPlan({
      specification: specification("static-html-v1"),
      workspace: materialized("react-vite-v1"),
      sourceVersion: 3,
    })).toThrow(/Unsupported ZoeBuild template: static-html-v1/);
  });

  it("allows lock bootstrap only for the registered React dependency manifest", () => {
    const plan = prepareRegisteredBuildArtifactPlan({
      specification: specification("react-vite-v1"),
      workspace: materialized("react-vite-v1"),
      sourceVersion: 1,
    });

    expect(plan).toMatchObject({
      dependencyLock: {
        state: "bootstrap-required",
        manager: "pnpm",
        path: "pnpm-lock.yaml",
        trustedTemplateManifest: true,
        bootstrap: {
          command: [
            "pnpm",
            "install",
            "--lockfile-only",
            "--ignore-scripts",
          ],
        },
        installCommand: ["pnpm", "install", "--frozen-lockfile", "--ignore-scripts"],
      },
      buildCommand: ["pnpm", "build"],
      artifact: {
        type: "static-directory",
        outputPath: "dist",
      },
      buildReady: false,
    });
  });

  it("becomes build-ready after a non-empty lockfile is part of source", () => {
    const workspace = addTextFile(
      materialized("react-vite-v1"),
      "pnpm-lock.yaml",
      "lockfileVersion: '9.0'\n",
    );

    const plan = prepareRegisteredBuildArtifactPlan({
      specification: specification("react-vite-v1"),
      workspace,
      sourceVersion: 2,
    });

    expect(plan.dependencyLock.state).toBe("present");
    expect(plan.dependencyLock.bootstrap).toBeNull();
    expect(plan.buildReady).toBe(true);
  });

  it("fails closed when package dependencies diverge from the registered template", () => {
    const workspace = materialized("react-vite-v1");
    const nodes = workspace.nodes.map((node) => {
      if (node.kind !== "file" || node.name !== "package.json") return node;
      const content = JSON.parse(node.content) as Record<string, unknown>;
      content.dependencies = {
        ...(content.dependencies as Record<string, string>),
        "left-pad": "1.3.0",
      };
      return {
        ...node,
        content: `${JSON.stringify(content, null, 2)}\n`,
      };
    });

    expect(() =>
      prepareRegisteredBuildArtifactPlan({
        specification: specification("react-vite-v1"),
        workspace: { ...workspace, nodes },
        sourceVersion: 2,
      }),
    ).toThrow(BuildPreparationError);
  });

  it("rejects empty lockfiles rather than treating them as ready", () => {
    const workspace = addTextFile(
      materialized("react-vite-v1"),
      "pnpm-lock.yaml",
      "   ",
    );

    expect(() =>
      prepareRegisteredBuildArtifactPlan({
        specification: specification("react-vite-v1"),
        workspace,
        sourceVersion: 2,
      }),
    ).toThrow(/lock.*empty/i);
  });
});
