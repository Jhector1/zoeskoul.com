import { describe, expect, it } from "vitest";
import type { ProjectSpecification } from "@zoeskoul/build-contracts";
import { TANSTACK_START_STACK_V1 } from "@zoeskoul/build-registry";
import { TANSTACK_START_TEMPLATE_V1 } from "@zoeskoul/build-template-registry";
import { materializeBuildProject } from "@zoeskoul/build-materializer";
import { prepareBuildArtifactPlan, prepareRegisteredBuildArtifactPlan, createRegisteredProductionBuildJob, BuildPreparationError } from "./index";

const specification: ProjectSpecification = {
  version: 1,
  name: "TanStack trial",
  projectType: "fullstack-app",
  targets: ["web"],
  requirements: { backend: true, database: false, auth: false, storage: false, payments: false, email: false, commerce: false },
  pages: ["home", "about"],
  stackId: "tanstack-start-v1",
  deployment: { preference: "managed-runtime" },
};

function fresh() {
  return materializeBuildProject({ specification, stack: TANSTACK_START_STACK_V1,
    template: TANSTACK_START_TEMPLATE_V1, createdAt: 1000 });
}

describe("TanStack Start staged full-stack preparation", () => {
  it("materializes a deterministic, server-capable app with a shared layout", () => {
    const first = fresh();
    expect(fresh()).toEqual(first);
    expect(first.entryPath).toBe("src/router.tsx");
    const source = new Map(first.workspace.nodes.filter(node => node.kind === "file").map(node => [node.id, node.content]));
    expect(source.has("index.html")).toBe(false);
    expect(source.get("src/routes/__root.tsx")).toContain("HeadContent");
    expect(source.get("src/routes/api.health.ts")).toContain("handlers:");
    expect(source.get("src/functions/siteInfo.functions.ts")).toContain("createServerFn");
    expect(source.get("src/layouts/SiteLayout.tsx")).toContain("<SiteHeader />");
  });

  it("prepares a Worker bundle, never a static artifact", () => {
    const result = prepareBuildArtifactPlan({ specification, stack: TANSTACK_START_STACK_V1,
      template: TANSTACK_START_TEMPLATE_V1, workspace: fresh().workspace,
      buildProjectId: "trial_1", sourceVersion: 1 });
    expect(result.artifact).toEqual({ type: "worker-bundle", outputPath: "dist/server",
      assetsPath: "dist/client", entrypoint: "index.js" });
    expect(result.deploymentAdapterId).toBe("cloudflare-workers-v1");
    expect(result.dependencyLock.state).toBe("bootstrap-required");
    expect(result.buildReady).toBe(false);
  });

  it("rejects forged artifact metadata even with the trusted template", () => {
    const stack = { ...TANSTACK_START_STACK_V1, artifact: {
      ...TANSTACK_START_STACK_V1.artifact, assetsPath: "../../platform-secrets",
    }} as never;
    expect(() => prepareBuildArtifactPlan({ specification, stack,
      template: TANSTACK_START_TEMPLATE_V1, workspace: fresh().workspace,
      sourceVersion: 1 })).toThrow(BuildPreparationError);
  });

  it("keeps project creation and the legacy static build executor closed before cutover", () => {
    const workspace = fresh().workspace;
    expect(() => prepareRegisteredBuildArtifactPlan({ specification,
      workspace, sourceVersion: 1 })).toThrow(BuildPreparationError);
    expect(() => createRegisteredProductionBuildJob({ buildProjectId: "trial_1",
      specification, workspace, sourceVersion: 1 })).toThrow(BuildPreparationError);
  });
});
