import { describe, expect, it } from "vitest";

import type { BuildStackDefinition, ProjectSpecification } from "@zoeskoul/build-contracts";
import { evaluateProjectStack } from "./index";

function specification(runtime: "static" | "react-vite", stackId: string): ProjectSpecification {
  return {
    version: 1,
    name: "Commerce",
    projectType: "frontend-app",
    targets: ["web"],
    requirements: {
      backend: false, database: false, auth: false, storage: false,
      payments: true, email: false, commerce: true,
    },
    pages: ["Home"],
    stackId,
    commerce: { provider: "zoebuild-native", storefrontRuntime: runtime },
    deployment: { preference: "static" },
  };
}

function stack(id: "commerce-static-v1" | "commerce-react-vite-v1"): BuildStackDefinition {
  const react = id === "commerce-react-vite-v1";
  return {
    id,
    projectTypes: ["frontend-app"],
    targets: ["web"],
    runtimeProfileId: react ? "build-node-v1" : "build-static-v1",
    templateId: id,
    commerceRuntime: react ? "react-vite" : "static",
    commands: { build: react ? ["pnpm", "build"] : [] },
    preview: react ? { type: "server", port: 5173 } : { type: "static" },
    artifact: { type: "static-directory", outputPath: react ? "dist" : "." },
    supportedCapabilities: ["payments", "commerce"],
    deploymentAdapterId: "static-assets-v1",
  };
}

describe("commerce runtime compatibility", () => {
  it("accepts matching commerce runtime stacks", () => {
    expect(evaluateProjectStack(specification("static", "commerce-static-v1"), stack("commerce-static-v1")).compatible).toBe(true);
    expect(evaluateProjectStack(specification("react-vite", "commerce-react-vite-v1"), stack("commerce-react-vite-v1")).compatible).toBe(true);
  });

  it("rejects runtime/stack mismatch", () => {
    const result = evaluateProjectStack(specification("react-vite", "commerce-static-v1"), stack("commerce-static-v1"));
    expect(result.compatible).toBe(false);
    expect(result.issues[0]?.code).toBe("commerce-runtime-mismatch");
  });
});
