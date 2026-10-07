import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const items = [
  {
    name: "VoiceInputExerciseUI",
    exportKey: "./components/practice/kinds/VoiceInputExerciseUI",
    exportTarget: "./src/components/practice/kinds/VoiceInputExerciseUI.tsx",
    packageSpec: "@zoeskoul/learner-workspace/components/practice/kinds/VoiceInputExerciseUI",
    shared: "packages/learner-workspace/src/components/practice/kinds/VoiceInputExerciseUI.tsx",
    student: "apps/student/src/legacy-web/components/practice/kinds/VoiceInputExerciseUI.tsx",
    web: "apps/web/src/components/practice/kinds/VoiceInputExerciseUI.tsx",
  },
  {
    name: "ListenBuildExerciseUI",
    exportKey: "./components/practice/kinds/ListenBuildExerciseUI",
    exportTarget: "./src/components/practice/kinds/ListenBuildExerciseUI.tsx",
    packageSpec: "@zoeskoul/learner-workspace/components/practice/kinds/ListenBuildExerciseUI",
    shared: "packages/learner-workspace/src/components/practice/kinds/ListenBuildExerciseUI.tsx",
    student: "apps/student/src/legacy-web/components/practice/kinds/ListenBuildExerciseUI.tsx",
    web: "apps/web/src/components/practice/kinds/ListenBuildExerciseUI.tsx",
  },
  {
    name: "DragReorderExerciseUI",
    exportKey: "./components/practice/kinds/DragReorderExerciseUI",
    exportTarget: "./src/components/practice/kinds/DragReorderExerciseUI.tsx",
    packageSpec: "@zoeskoul/learner-workspace/components/practice/kinds/DragReorderExerciseUI",
    shared: "packages/learner-workspace/src/components/practice/kinds/DragReorderExerciseUI.tsx",
    student: "apps/student/src/legacy-web/components/practice/kinds/DragReorderExerciseUI.tsx",
    web: "apps/web/src/components/practice/kinds/DragReorderExerciseUI.tsx",
  },
  {
    name: "VectorDragDotExerciseUI",
    exportKey: "./components/practice/kinds/VectorDragDotExerciseUI",
    exportTarget: "./src/components/practice/kinds/VectorDragDotExerciseUI.tsx",
    packageSpec: "@zoeskoul/learner-workspace/components/practice/kinds/VectorDragDotExerciseUI",
    shared: "packages/learner-workspace/src/components/practice/kinds/VectorDragDotExerciseUI.tsx",
    student: "apps/student/src/legacy-web/components/practice/kinds/VectorDragDotExerciseUI.tsx",
    web: "apps/web/src/components/practice/kinds/VectorDragDotExerciseUI.tsx",
  },
  {
    name: "MultiChoiceExerciseUI",
    exportKey: "./components/practice/kinds/MultiChoiceExerciseUI",
    exportTarget: "./src/components/practice/kinds/MultiChoiceExerciseUI.tsx",
    packageSpec: "@zoeskoul/learner-workspace/components/practice/kinds/MultiChoiceExerciseUI",
    shared: "packages/learner-workspace/src/components/practice/kinds/MultiChoiceExerciseUI.tsx",
    student: "apps/student/src/legacy-web/components/practice/kinds/MultiChoiceExerciseUI.tsx",
    web: "apps/web/src/components/practice/kinds/MultiChoiceExerciseUI.tsx",
  },
  {
    name: "VectorDragTargetExerciseUI",
    exportKey: "./components/practice/kinds/VectorDragTargetExerciseUI",
    exportTarget: "./src/components/practice/kinds/VectorDragTargetExerciseUI.tsx",
    packageSpec: "@zoeskoul/learner-workspace/components/practice/kinds/VectorDragTargetExerciseUI",
    shared: "packages/learner-workspace/src/components/practice/kinds/VectorDragTargetExerciseUI.tsx",
    student: "apps/student/src/legacy-web/components/practice/kinds/VectorDragTargetExerciseUI.tsx",
    web: "apps/web/src/components/practice/kinds/VectorDragTargetExerciseUI.tsx",
  },
  {
    name: "FillBlankChoiceExerciseUI",
    exportKey: "./components/practice/kinds/FillBlankChoiceExerciseUI",
    exportTarget: "./src/components/practice/kinds/FillBlankChoiceExerciseUI.tsx",
    packageSpec: "@zoeskoul/learner-workspace/components/practice/kinds/FillBlankChoiceExerciseUI",
    shared: "packages/learner-workspace/src/components/practice/kinds/FillBlankChoiceExerciseUI.tsx",
    student: "apps/student/src/legacy-web/components/practice/kinds/FillBlankChoiceExerciseUI.tsx",
    web: "apps/web/src/components/practice/kinds/FillBlankChoiceExerciseUI.tsx",
  },
  {
    name: "TextInputExerciseUI",
    exportKey: "./components/practice/kinds/TextInputExerciseUI",
    exportTarget: "./src/components/practice/kinds/TextInputExerciseUI.tsx",
    packageSpec: "@zoeskoul/learner-workspace/components/practice/kinds/TextInputExerciseUI",
    shared: "packages/learner-workspace/src/components/practice/kinds/TextInputExerciseUI.tsx",
    student: "apps/student/src/legacy-web/components/practice/kinds/TextInputExerciseUI.tsx",
    web: "apps/web/src/components/practice/kinds/TextInputExerciseUI.tsx",
  },
  {
    name: "NumericExerciseUI",
    exportKey: "./components/practice/kinds/NumericExerciseUI",
    exportTarget: "./src/components/practice/kinds/NumericExerciseUI.tsx",
    packageSpec: "@zoeskoul/learner-workspace/components/practice/kinds/NumericExerciseUI",
    shared: "packages/learner-workspace/src/components/practice/kinds/NumericExerciseUI.tsx",
    student: "apps/student/src/legacy-web/components/practice/kinds/NumericExerciseUI.tsx",
    web: "apps/web/src/components/practice/kinds/NumericExerciseUI.tsx",
  },
] as const;

describe("V207 exercise prompt bridge cluster", () => {
  it.each(items)("$name is exported from learner-workspace", (item) => {
    const pkg = JSON.parse(
      source("packages/learner-workspace/package.json"),
    ) as { exports?: Record<string, string> };

    expect(pkg.exports?.[item.exportKey]).toBe(
      item.exportTarget,
    );
  });

  it.each(items)("$name leaves identical thin app adapters", (item) => {
    const student = source(item.student);
    const web = source(item.web);

    expect(student).toBe(web);
    expect(student).toContain(item.packageSpec);
    expect(student).toContain("@zoeskoul/learner-workspace/components/practice/kinds/ExercisePromptBridge");
    expect(student).toContain(
      '@/components/practice/kinds/KindHelper',
    );
    expect(student.split("\n").filter(Boolean).length)
      .toBeLessThanOrEqual(14);
  });

  it.each(items)("$name is app/framework free in shared ownership", (item) => {
    const shared = source(item.shared);

    expect(shared).toContain(
      'from "./ExercisePromptBridge"',
    );
    expect(shared).not.toContain("@/components");
    expect(shared).not.toContain("@/lib");
    expect(shared).not.toContain("@student/");
    expect(shared).not.toContain("next-intl");
    expect(shared).not.toContain("next/navigation");
    expect(shared).not.toContain(
      "@zoeskoul/learner-workspace/",
    );
  });

  it("exports an app-neutral ExercisePrompt bridge", () => {
    const pkg = JSON.parse(
      source("packages/learner-workspace/package.json"),
    ) as { exports?: Record<string, string> };

    expect(pkg.exports?.["./components/practice/kinds/ExercisePromptBridge"]).toBe(
      "./src/components/practice/kinds/ExercisePromptBridge.tsx",
    );

    const bridge = source(
      "packages/learner-workspace/src/components/practice/kinds/ExercisePromptBridge.tsx",
    );

    expect(bridge).toContain("ExercisePromptProvider");
    expect(bridge).toContain("ExercisePromptRendererContext");
    expect(bridge).not.toContain("useTaggedT");
    expect(bridge).not.toContain("next-intl");
    expect(bridge).not.toContain("@/");
    expect(bridge).not.toContain("@student/");
  });

  it("does not double-count the already migrated WordBank adapter", () => {
    const student = source(
      "apps/student/src/legacy-web/components/practice/kinds/WordBankArrangeExerciseUI.tsx",
    );
    const web = source(
      "apps/web/src/components/practice/kinds/WordBankArrangeExerciseUI.tsx",
    );

    expect(student).toBe(web);
    expect(student).toContain(
      "@zoeskoul/learner-workspace/practice/kinds/WordBankArrangeExerciseUI",
    );
  });
});
