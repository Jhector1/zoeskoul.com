#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(rel) {
  const absolute = path.join(root, rel);
  if (!fs.existsSync(absolute)) throw new Error(`missing ${rel}`);
  return fs.readFileSync(absolute, "utf8");
}

function must(condition, message) {
  if (!condition) throw new Error(message);
}

function sha(rel) {
  return crypto.createHash("sha256").update(read(rel)).digest("hex").slice(0, 12);
}

const webPractice =
  "apps/web/src/components/practice/review/PracticeReviewWorkspace.tsx";
const studentPractice =
  "apps/student/src/legacy-web/components/practice/review/PracticeReviewWorkspace.tsx";
const webPracticeShell =
  "apps/web/src/components/practice/PracticeShell.tsx";
const studentPracticeShell =
  "apps/student/src/legacy-web/components/practice/PracticeShell.tsx";
const webEmbeddedPractice =
  "apps/web/src/components/practice/review/EmbeddedPracticeReviewWorkspace.tsx";
const studentEmbeddedPractice =
  "apps/student/src/legacy-web/components/practice/review/EmbeddedPracticeReviewWorkspace.tsx";
const webStandaloneFlow =
  "apps/web/src/components/practice/review/StandaloneReviewExerciseFlow.tsx";
const studentStandaloneFlow =
  "apps/student/src/legacy-web/components/practice/review/StandaloneReviewExerciseFlow.tsx";
const webStandaloneCard =
  "apps/web/src/components/practice/review/StandaloneReviewExerciseCard.tsx";
const studentStandaloneCard =
  "apps/student/src/legacy-web/components/practice/review/StandaloneReviewExerciseCard.tsx";
const webNavigator =
  "apps/web/src/components/practice/review/PracticeNavigator.tsx";
const studentNavigator =
  "apps/student/src/legacy-web/components/practice/review/PracticeNavigator.tsx";
const webCard =
  "apps/web/src/components/review/quiz/components/QuizPracticeCard.tsx";
const studentCard =
  "apps/student/src/legacy-web/components/review/quiz/components/QuizPracticeCard.tsx";
const webHeader =
  "apps/web/src/components/review/module/components/layout/ReviewModuleHeader.tsx";
const studentHeader =
  "apps/student/src/legacy-web/components/review/module/components/layout/ReviewModuleHeader.tsx";
const webPane =
  "apps/web/src/components/tools/panes/CodeToolPane.tsx";
const studentPane =
  "apps/student/src/legacy-web/components/tools/panes/CodeToolPane.tsx";
const webBottom =
  "apps/web/src/components/review/ReviewModuleNavBar.tsx";
const studentBottom =
  "apps/student/src/legacy-web/components/review/ReviewModuleNavBar.tsx";
const resolver =
  "packages/learning-runtime/src/review/module/runtime/resolveWorkspaceForTarget.ts";
const store =
  "packages/learning-runtime/src/review/module/runtime/reviewRuntimeStore.ts";
const packageFullIDE =
  "packages/learner-workspace/src/fullide/FullIDE.tsx";
const packageIdeHeader =
  "packages/learner-workspace/src/fullide/IdeHeader.tsx";
const packageLearnerWorkspace =
  "packages/learner-workspace/package.json";
const webFullIDE =
  "apps/web/src/components/ide/fullide/FullIDE.tsx";
const studentFullIDE =
  "apps/student/src/legacy-web/components/ide/fullide/FullIDE.tsx";
const webIdeHeader =
  "apps/web/src/components/ide/fullide/chrome/IdeHeader.tsx";
const studentIdeHeader =
  "apps/student/src/legacy-web/components/ide/fullide/chrome/IdeHeader.tsx";
const webFullIDEAdapter =
  "apps/web/src/components/ide/fullide/appAdapter.tsx";
const studentFullIDEAdapter =
  "apps/student/src/legacy-web/components/ide/fullide/appAdapter.tsx";

const practiceSources = [read(webPractice), read(studentPractice)];
const practiceShellSources = [read(webPracticeShell), read(studentPracticeShell)];
const standaloneFlowSources = [read(webStandaloneFlow), read(studentStandaloneFlow)];
const standaloneCardSources = [read(webStandaloneCard), read(studentStandaloneCard)];
const navigatorSources = [read(webNavigator), read(studentNavigator)];
const cardSources = [read(webCard), read(studentCard)];
const headerSources = [read(webHeader), read(studentHeader)];
const paneSources = [read(webPane), read(studentPane)];
const resolverSource = read(resolver);
const storeSource = read(store);
const packageFullIDESource = read(packageFullIDE);
const packageIdeHeaderSource = read(packageIdeHeader);
const packageLearnerWorkspaceSource = read(packageLearnerWorkspace);
const webFullIDEWrapperSource = read(webFullIDE);
const studentFullIDEWrapperSource = read(studentFullIDE);
const webIdeHeaderWrapperSource = read(webIdeHeader);
const studentIdeHeaderWrapperSource = read(studentIdeHeader);
const webFullIDEAdapterSource = read(webFullIDEAdapter);
const studentFullIDEAdapterSource = read(studentFullIDEAdapter);

must(
  resolverSource.includes("export function resolveWorkspaceForTarget"),
  "canonical resolveWorkspaceForTarget owner disappeared",
);
must(
  storeSource.includes("resolveWorkspaceForTarget") &&
    storeSource.includes("resetExerciseToStarter"),
  "learning-runtime must own workspace resolution and reset",
);

must(
  packageLearnerWorkspaceSource.includes('"name": "@zoeskoul/learner-workspace"'),
  "canonical learner workspace package is missing",
);

must(
  packageFullIDESource.includes("<FullIDEInner") &&
    packageFullIDESource.includes("useFullIDEAuthenticatedUserId") &&
    packageFullIDESource.includes("useFullIDERouter") &&
    packageFullIDESource.includes("typeof useFullIDERouter") &&
    !packageFullIDESource.includes("next-auth/react") &&
    !packageFullIDESource.includes('from "next/navigation"') &&
    !packageFullIDESource.includes("typeof useRouter") &&
    !packageFullIDESource.includes("useStudentSession"),
  "package FullIDE must own implementation without host auth/router",
);

must(
  packageIdeHeaderSource.includes("FullIDESettingsMenu") &&
    packageIdeHeaderSource.includes("FullIDELink") &&
    packageIdeHeaderSource.includes("useFullIDETranslations") &&
    !packageIdeHeaderSource.includes("@/components/HeaderSlick") &&
    !packageIdeHeaderSource.includes("@student/components/chrome/StudentHeaderSlick") &&
    !packageIdeHeaderSource.includes('from "next/link"') &&
    !packageIdeHeaderSource.includes('from "next-intl"'),
  "package IdeHeader must own structure with host concerns injected",
);

for (const source of [webFullIDEWrapperSource, studentFullIDEWrapperSource]) {
  must(
    source.includes("@zoeskoul/learner-workspace/fullide/FullIDE") &&
      !source.includes("<FullIDEInner") &&
      !source.includes("useSession") &&
      !source.includes("useStudentSession"),
    "app-local FullIDE must be package re-export only",
  );
}

for (const source of [webIdeHeaderWrapperSource, studentIdeHeaderWrapperSource]) {
  must(
    source.includes("@zoeskoul/learner-workspace/fullide/IdeHeader") &&
      !source.includes("FullIDESettingsMenu") &&
      !source.includes("<header"),
    "app-local IdeHeader must be package re-export only",
  );
}

must(
  webFullIDEAdapterSource.includes("next-auth/react") &&
    webFullIDEAdapterSource.includes('from "next/navigation"') &&
    webFullIDEAdapterSource.includes('from "next/link"') &&
    webFullIDEAdapterSource.includes('from "next-intl"') &&
    webFullIDEAdapterSource.includes("@/components/HeaderSlick"),
  "Web FullIDE adapter lost Web host concerns",
);

must(
  studentFullIDEAdapterSource.includes("useStudentSession") &&
    studentFullIDEAdapterSource.includes('from "next/navigation"') &&
    studentFullIDEAdapterSource.includes('from "next/link"') &&
    studentFullIDEAdapterSource.includes('from "next-intl"') &&
    studentFullIDEAdapterSource.includes("@student/components/chrome/StudentHeaderSlick"),
  "Student FullIDE adapter lost Student compatibility concerns",
);

for (const source of cardSources) {
  must(
    !source.includes("applyPracticeWorkspaceHydration"),
    "Practice-specific workspace hydration owner returned",
  );
  must(
    !source.includes("quiz-practice-hydrate"),
    "Practice-specific hydration mutation returned",
  );
}

must(
  !fs.existsSync(path.join(root, webEmbeddedPractice)) &&
    !fs.existsSync(path.join(root, studentEmbeddedPractice)),
  "EmbeddedPracticeReviewWorkspace parallel shell returned",
);

for (const source of practiceShellSources) {
  must(
    !source.includes("EmbeddedPracticeReviewWorkspace"),
    "PracticeShell routes to removed embedded workspace fork",
  );
  must(
    source.includes('embeddedPresentation || surface === "tools"') &&
      source.includes("<PracticeReviewWorkspace"),
    "Practice-family workspace experiences do not converge on PracticeReviewWorkspace",
  );
}

for (const source of standaloneFlowSources) {
  must(
    !source.includes('"embedded" | "tools"') &&
      !source.includes("surface={surface}"),
    "StandaloneReviewExerciseFlow still chooses embedded vs tools",
  );
}

for (const source of standaloneCardSources) {
  must(
    source.includes('codeSurfaceOverride="tools"') &&
      !source.includes('surface === "tools"') &&
      !source.includes('codeSurfaceOverride={surface}'),
    "Standalone code_input does not force Tools -> FullIDE",
  );
}

for (const source of navigatorSources) {
  must(
    !source.includes("onResetCurrentExercise"),
    "PracticeNavigator must stay queue/sidebar-only",
  );
  must(
    !source.includes("navigator.resetExerciseDescription"),
    "PracticeNavigator still owns Reset presentation",
  );
}

for (const source of practiceSources) {
  must(source.includes("<ReviewModuleHeader"), "Practice lost shared Review header");
  must(source.includes("<ReviewModuleNavBar"), "Practice lost shared bottom nav");
  must(
    source.includes('id: "reset-current-exercise"') &&
      source.includes("resetExerciseToStarter"),
    "Practice Reset is not wired through canonical runtime + shared header",
  );
  must(
    !source.includes("<FlowNavigator"),
    "Practice still owns a parallel Previous/Next slideshow control",
  );
  must(
    !source.includes("resolveCanonicalPracticeQueueRows"),
    "Practice workspace still owns duplicate-navigation queue projection",
  );
}

for (const source of headerSources) {
  must(
    source.includes("experienceActions?: React.ReactNode;") &&
      source.includes('data-testid="review-header-experience-actions"'),
    "ReviewModuleHeader is missing its reusable experience action slot",
  );
}

for (const source of paneSources) {
  must(source.includes("<FullIDE"), "CodeToolPane no longer renders FullIDE");
  must(
    !/<CodeRunner\b/.test(source),
    "CodeToolPane renders a second CodeRunner learner shell",
  );
  must(
    source.includes("buildLearnerFullIdeKey"),
    "stable FullIDE identity helper missing",
  );

  const keyAt = source.indexOf("const fullIdeKey = buildLearnerFullIdeKey");
  must(keyAt >= 0, "CodeToolPane does not use stable FullIDE identity");
  const identitySlice = source.slice(keyAt, keyAt + 500);
  must(
    !identitySlice.includes("reviewWorkspaceNeedsMultiFile") &&
      !identitySlice.includes('workspace" : "single') &&
      !identitySlice.includes('multi" : "mono') &&
      !identitySlice.includes("currentIdeConfigKey"),
    "single/multi presentation leaked back into FullIDE identity",
  );

  must(
    source.includes("canUseMultiFile:") &&
      source.includes("reviewWorkspaceNeedsMultiFile"),
    "multi-file support must remain a FullIDE capability",
  );
}

must(read(webPane) === read(studentPane), "Web/Student CodeToolPane drifted");
must(
  read(webPractice) === read(studentPractice),
  "Web/Student PracticeReviewWorkspace drifted",
);
must(
  read(webBottom) === read(studentBottom),
  "Web/Student ReviewModuleNavBar drifted",
);

const resolverTestCandidates = [
  "apps/web/src/components/review/module/runtime/resolveWorkspaceForTarget.test.ts",
  "apps/student/src/legacy-web/components/review/module/runtime/resolveWorkspaceForTarget.test.ts",
  "packages/learning-runtime/src/review/module/runtime/resolveWorkspaceForTarget.test.ts",
].filter((rel) => fs.existsSync(path.join(root, rel)));

must(
  resolverTestCandidates.length > 0,
  "no resolveWorkspaceForTarget regression suite found",
);

const resolverTests = resolverTestCandidates.map(read).join("\n");
must(
  /saved main\.py/i.test(resolverTests) &&
    /manifest fixture files/i.test(resolverTests),
  "canonical saved-workspace + manifest-file merge regression is missing",
);

console.log("=== ZOESKOUL LEARNING WORKSPACE ARCHITECTURE CHECK ===");
console.log("workspace_resolver_owner=packages/learning-runtime");
console.log("workspace_reset_owner=packages/learning-runtime");
console.log("practice_parallel_hydration=absent");
console.log("embedded_practice_workspace=absent");
console.log("practice_family_shell=PracticeReviewWorkspace");
console.log("standalone_code_surface=Tools_FullIDE_only");
console.log("practice_reset_ui=shared_review_header");
console.log("practice_prev_next_ui=shared_review_module_navbar");
console.log("practice_sidebar=experience_specific");
console.log("header_experience_actions=shared_slot");
console.log("learner_code_surface=FullIDE");
console.log("fullide_implementation_owner=packages/learner-workspace");
console.log("fullide_implementation_owners=1");
console.log("ide_header_implementation_owners=1");
console.log("fullide_host_auth_router=adapter_only");
console.log("fullide_host_link_intl_settings=adapter_only");
console.log("single_file_mode=FullIDE_presentation");
console.log("multi_file_mode=FullIDE_presentation");
console.log("file_count_in_fullide_identity=no");
console.log(`web_student_code_tool_pane_hash=${sha(webPane)}`);
console.log(`web_student_practice_workspace_hash=${sha(webPractice)}`);
console.log(`web_student_bottom_nav_hash=${sha(webBottom)}`);
console.log("RESULT=ONE_WORKSPACE_ARCHITECTURE_PASS");

// V84A7_DIRECT_CODERUNNER_BOUNDARY
// Curriculum/practice code must never instantiate CodeRunner directly. The only
// executable learner code editor is FullIDE; CodeRunner is its internal engine.
{
  const { readFileSync: readV84A7File } = await import("node:fs");
  const v84a7Read = (file) => readV84A7File(file, "utf8");
  const v84a7Must = (condition, message) => {
    if (!condition) {
      console.error(`ARCHITECTURE ERROR: ${message}`);
      process.exit(1);
    }
  };

  const webCodeUi = v84a7Read(
    "apps/web/src/components/practice/kinds/CodeInputExerciseUI.tsx",
  );
  const studentCodeUi = v84a7Read(
    "apps/student/src/legacy-web/components/practice/kinds/CodeInputExerciseUI.tsx",
  );
  const webPracticeShell = v84a7Read(
    "apps/web/src/components/practice/PracticeShell.tsx",
  );
  const studentPracticeShell = v84a7Read(
    "apps/student/src/legacy-web/components/practice/PracticeShell.tsx",
  );
  const webQuizCard = v84a7Read(
    "apps/web/src/components/review/quiz/components/QuizPracticeCard.tsx",
  );
  const studentQuizCard = v84a7Read(
    "apps/student/src/legacy-web/components/review/quiz/components/QuizPracticeCard.tsx",
  );
  const webRenderer = v84a7Read(
    "apps/web/src/components/practice/ExerciseRenderer.tsx",
  );
  const studentRenderer = v84a7Read(
    "apps/student/src/legacy-web/components/practice/ExerciseRenderer.tsx",
  );
  const webIdePane = v84a7Read(
    "apps/web/src/components/ide/fullide/panes/IdeEditorPane.tsx",
  );
  const studentIdePane = v84a7Read(
    "apps/student/src/legacy-web/components/ide/fullide/panes/IdeEditorPane.tsx",
  );

  for (const [name, source] of [
    ["web CodeInputExerciseUI", webCodeUi],
    ["student CodeInputExerciseUI", studentCodeUi],
  ]) {
    v84a7Must(
      source.includes('if (variant === "tools")') &&
        source.includes("StaticCodeReviewSurface") &&
        source.includes('data-testid="code-input-static-review"') &&
        !source.includes("<CodeRunner") &&
        !source.includes("import CodeRunner,"),
      `${name} must not own an executable CodeRunner surface`,
    );
  }

  for (const [name, source] of [
    ["web PracticeShell", webPracticeShell],
    ["student PracticeShell", studentPracticeShell],
  ]) {
    v84a7Must(
      source.includes('exercise?.kind === "code_input"') &&
        source.includes("<PracticeReviewWorkspace"),
      `${name} must force code_input through PracticeReviewWorkspace`,
    );
  }

  for (const [name, source] of [
    ["web QuizPracticeCard", webQuizCard],
    ["student QuizPracticeCard", studentQuizCard],
  ]) {
    v84a7Must(
      source.includes("const useToolsCodeSurface = toolsEnabled && isCodeInput;") &&
        source.includes('const codeRunnerMode: "embedded" | "tools" = "tools";'),
      `${name} must keep code_input on the Tools/FullIDE surface`,
    );
  }

  for (const [name, source] of [
    ["web ExerciseRenderer", webRenderer],
    ["student ExerciseRenderer", studentRenderer],
  ]) {
    v84a7Must(
      source.includes('codeRunnerMode = "tools"') &&
        source.includes("const useTools = !!codeTools && !!codeInputId;"),
      `${name} must default code_input to the Tools bridge`,
    );
  }

  for (const [name, source] of [
    ["web IdeEditorPane", webIdePane],
    ["student IdeEditorPane", studentIdePane],
  ]) {
    v84a7Must(
      source.includes('import CodeRunner from "@/components/code/CodeRunner";') &&
        source.includes("<CodeRunner"),
      `${name} must retain CodeRunner as the FullIDE internal engine`,
    );
  }

  console.log("learner_direct_coderunner=FullIDE_internal_only");
  console.log("practice_direct_coderunner=absent");
  console.log("legacy_embedded_code_surface=static_review_only");
}
