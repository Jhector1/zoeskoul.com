import {
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";

const repo = resolve(__dirname, "../../../../..");

function source(path: string) {
  return readFileSync(
    resolve(repo, path),
    "utf8",
  );
}

describe("ZoeBuild multimodal AI planning boundary", () => {
  it("supports text image video and voice/audio in the shared composer", () => {
    const composer = source(
      "apps/zoebuild/src/components/builder/ZoeBuildPromptComposer.tsx",
    );

    expect(composer).toContain(
      'accept="image/*,video/*,audio/*"',
    );
    expect(composer).toContain("MediaRecorder");
    expect(composer).toContain("navigator.mediaDevices");
    expect(composer).toContain("files.length > 0");
  });

  it("uses one shared multipart plan client in both composer owners", () => {
    const landing = source(
      "apps/zoebuild/src/components/builder/ZoeBuildLanding.tsx",
    );
    const shell = source(
      "apps/zoebuild/src/app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx",
    );

    expect(landing).toContain("requestZoeBuildPlan");
    expect(shell).toContain("requestZoeBuildPlan");
    expect(shell).toContain(
      "has not been applied to project source yet",
    );
  });

  it("authorizes and rate limits before provider planning with no persistence", () => {
    const route = source(
      "apps/zoebuild/src/app/api/build/plan/route.ts",
    );

    expect(route).toContain("enforceSameOriginPost(req)");
    expect(route).toContain("exceedsContentLength(");
    expect(route).toContain("loadCurrentBuildAccessSnapshot()");
    expect(route).toContain("assertCanGenerateBuildWithAi(");
    expect(route).toContain('"zoebuild-ai-plan"');
    expect(route).toContain("await req.formData()");
    expect(route).toContain("planCostAwareZoeBuildProject({");

    const costAwarePlanner = source(
      "apps/zoebuild/src/lib/build/costAwareZoeBuildPlanning.ts",
    );

    expect(costAwarePlanner).toContain("planBuildProjectFromPrompt({");

    for (const forbidden of [
      "createBuildProjectCommand",
      "createPrismaBuildProjectPersistence",
      "prisma.",
      "saveCodeProject",
    ]) {
      expect(route).not.toContain(forbidden);
    }
  });

  it("keeps Build provider selection independent from curriculum provider env", () => {
    const planner = source(
      "apps/zoebuild/src/lib/build/createZoeBuildAiPlanner.ts",
    );

    expect(planner).toContain("ZOEBUILD_AI_PROVIDER");
    expect(planner).toContain("ZOEBUILD_AI_MODEL");
    expect(planner).not.toContain("process.env.AI_PROVIDER");
    expect(planner).not.toContain("process.env.AI_MODEL");
  });
});
