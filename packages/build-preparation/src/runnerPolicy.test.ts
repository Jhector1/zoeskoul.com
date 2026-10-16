import { describe, expect, it } from "vitest";
import { materializeRegisteredBuildProject } from "@zoeskoul/build-materializer";
import type { ProjectSpecification } from "@zoeskoul/build-contracts";

import {
  BuildPreparationError,
  assertRegisteredDependencyBootstrapFiles,
} from "./index";

const specification: ProjectSpecification = {
  version: 1,
  name: "Runner policy",
  projectType: "frontend-app",
  targets: ["web"],
  requirements: {
    backend: false,
    database: false,
    auth: false,
    storage: false,
    payments: false,
    email: false,
    commerce: false,
  },
  pages: ["Home"],
  stackId: "react-vite-v1",
  deployment: { preference: "static" },
};

function files() {
  const workspace = materializeRegisteredBuildProject({
    specification,
    createdAt: 1,
  }).workspace;

  const byId = new Map(workspace.nodes.map((node) => [node.id, node]));
  const pathOf = (id: string): string => {
    const node = byId.get(id);
    if (!node) throw new Error(`missing node ${id}`);
    return node.parentId
      ? `${pathOf(node.parentId)}/${node.name}`
      : node.name;
  };

  return workspace.nodes.flatMap((node) =>
    node.kind === "file"
      ? [{ path: pathOf(node.id), content: node.content }]
      : [],
  );
}

describe("runner-side dependency bootstrap policy", () => {
  it("accepts the registered React template dependency manifest", () => {
    expect(() =>
      assertRegisteredDependencyBootstrapFiles({
        stackId: "react-vite-v1",
        templateId: "react-vite-v1",
        files: files(),
      }),
    ).not.toThrow();
  });

  it("rejects dependency mutation even for an otherwise valid executor request", () => {
    const mutated = files().map((file) => {
      if (file.path !== "package.json") return file;
      const parsed = JSON.parse(file.content) as Record<string, unknown>;
      parsed.dependencies = {
        ...(parsed.dependencies as Record<string, string>),
        "left-pad": "1.3.0",
      };
      return {
        ...file,
        content: `${JSON.stringify(parsed, null, 2)}\n`,
      };
    });

    expect(() =>
      assertRegisteredDependencyBootstrapFiles({
        stackId: "react-vite-v1",
        templateId: "react-vite-v1",
        files: mutated,
      }),
    ).toThrow(BuildPreparationError);
  });
});
