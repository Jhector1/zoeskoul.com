import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function findRepoRoot(start: string) {
  let current = path.resolve(start);

  while (true) {
    if (
      fs.existsSync(path.join(current, "pnpm-workspace.yaml")) &&
      fs.existsSync(path.join(current, "apps", "web"))
    ) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(
        `Unable to locate repository root from ${start}`,
      );
    }

    current = parent;
  }
}

const repoRoot = findRepoRoot(process.cwd());

function source(relativePath: string) {
  return fs.readFileSync(path.resolve(repoRoot, relativePath), "utf8");
}

describe("canonical Draft Editor / Draft QA architecture", () => {
  it("keeps diagnostics limited to the derived bundle and messages", () => {
    const route = source("apps/web/src/app/api/admin/curriculum-drafts/topic/route.ts");
    const callStart = route.indexOf("const diagnostics = analyzeDraftTopic");
    const call = route.slice(
      callStart,
      route.indexOf("return NextResponse.json", callStart),
    );
    expect(call).toContain("bundleJson: topic.bundleJson");
    expect(call).toContain("messagesJson: topic.messagesJson");
    expect(call).not.toContain("sourceJson");
    expect(route).toContain("sourceJson: topic.sourceJson");
  });

  it("routes preview and grading through the canonical-source loader", () => {
    const preview = source("apps/web/src/lib/dev/curriculumDrafts/preview.ts");
    const practice = source("apps/web/src/lib/dev/curriculumDrafts/practiceQa.ts");
    expect(preview).toContain("loadSourceModuleTopics(ref)");
    expect(practice).toContain("loadSourceTopic(args.ref)");
    expect(preview).not.toContain("loadDraftModuleTopics(ref)");
    expect(practice).not.toContain("loadDraftTopic(args.ref)");
  });

  it("does not offer save behavior for derived Admin panes", () => {
    const editor = source("apps/admin/src/features/curriculum/drafts/CurriculumDraftEditor.tsx");
    const jsonEditor = source("apps/admin/src/features/curriculum/drafts/JsonEditor.tsx");
    expect(editor).not.toContain('/topic/bundle"');
    expect(editor).not.toContain('/topic/messages"');
    expect(editor).not.toContain('/topic/message-key"');
    expect(editor).toContain("Source JSON · canonical and editable");
    expect(jsonEditor).toContain("props.disabled ?");
    expect(jsonEditor).toContain("readOnly={props.disabled}");
  });

  it("keeps every derived mutation route fail-closed with HTTP 405", () => {
    for (const routeName of ["bundle", "messages", "message-key"]) {
      const route = source(`apps/web/src/app/api/admin/curriculum-drafts/topic/${routeName}/route.ts`);
      expect(route).toContain("readOnlyDerivedArtifactResponse");
      expect(route).toContain("async () => readOnlyDerivedArtifactResponse()");
    }
    const response = source("apps/web/src/lib/dev/curriculumDrafts/readOnlyDerived.ts");
    expect(response).toContain("READ_ONLY_DERIVED_ARTIFACT");
    expect(response).toContain("{ status: 405 }");
  });

  it("keeps Draft QA on canonical learner-workspace tool ownership", () => {
    const webToolHook = source("apps/web/src/components/tools/hooks/useActiveTool.ts");
    const studentToolHook = source("apps/student/src/legacy-web/components/tools/hooks/useActiveTool.ts");
    const controller = source(
      "apps/web/src/components/review/module/hooks/useReviewModuleController.ts",
    );

    for (const hook of [webToolHook, studentToolHook]) {
      expect(hook).toContain(
        '@zoeskoul/learner-workspace/tools/resolveActiveTool',
      );
      expect(hook).not.toContain('?? "notes"');
    }

    expect(controller).toContain("shouldDefaultCollapseToolsRail({");
    expect(controller).toContain(
      "learnerUiFlags.showDebugLearningUi && !draftQaMode",
    );
    expect(controller).not.toContain('draftQaMode ? "notes"');
  });
});
