import { describe, expect, it } from "vitest";

import type { BuildStackDefinition, ProjectSpecification } from "@zoeskoul/build-contracts";
import { evaluateProjectStack } from "./index";

// Build-core exercises domain rules with an independent, typed fixture. The
// actual registered TanStack stack is verified by build-registry's own tests.
const TANSTACK_START_STACK_V1: BuildStackDefinition = {
  id: "tanstack-start-v1",
  projectTypes: ["fullstack-app"],
  targets: ["web"],
  runtimeProfileId: "build-worker-v1",
  templateId: "tanstack-start-v1",
  commerceRuntime: "tanstack-start",
  commands: { build: ["pnpm", "build"] },
  preview: { type: "server", port: 5173 },
  supportedCapabilities: ["backend", "payments", "commerce"],
  deploymentAdapterId: "cloudflare-workers-v1",
};

function specification(stackId = "tanstack-start-v1"): ProjectSpecification {
  return {
    version: 1,
    name: "Commerce",
    projectType: "fullstack-app",
    targets: ["web"],
    requirements: {
      backend: true, database: false, auth: false, storage: false,
      payments: true, email: false, commerce: true,
    },
    pages: ["Home"],
    stackId,
    commerce: { storefrontRuntime: "tanstack-start" },
    deployment: { preference: "managed-runtime" },
  };
}

describe("TanStack commerce runtime compatibility", () => {
  it("accepts the TanStack Start commerce runtime fixture", () => {
    expect(evaluateProjectStack(specification(), TANSTACK_START_STACK_V1).compatible).toBe(true);
  });

  it("rejects a missing commerce runtime rather than silently accepting one", () => {
    const incompatible: BuildStackDefinition = { ...TANSTACK_START_STACK_V1, commerceRuntime: null };
    const result = evaluateProjectStack(specification(), incompatible);
    expect(result.compatible).toBe(false);
    expect(result.issues[0]?.code).toBe("commerce-runtime-mismatch");
  });

  it("rejects any mismatched stack ID", () => {
    const result = evaluateProjectStack(specification("retired-stack"), TANSTACK_START_STACK_V1);
    expect(result.compatible).toBe(false);
    expect(result.issues[0]?.code).toBe("stack-id-mismatch");
  });
});
