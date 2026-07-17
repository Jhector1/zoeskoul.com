#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const courseDir = path.join(
  root,
  "authoring/subjects/linux/courses/linux-terminal-fundamentals",
);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function uniquePush(target, values) {
  for (const value of values) {
    if (!target.includes(value)) target.push(value);
  }
}

function findModule(course, moduleNumber) {
  return (course.modules ?? []).find(
    (module) => Number(module.moduleNumber) === moduleNumber,
  );
}

function findTopic(module, topicId) {
  for (const section of module?.sections ?? []) {
    const topic = (section.topics ?? []).find((item) => item.topicId === topicId);
    if (topic) return { section, topic };
  }
  return null;
}

function buildCapstoneBrief() {
  return {
    scenario:
      "A neighborhood media team inherited a small photo-project archive with an inbox containing a photo index, release forms, shoot notes, and one temporary import file. The next volunteer needs a verified structure that explains where every record belongs.",
    role:
      "Terminal workspace coordinator preparing a community media archive for the next volunteer",
    workspace:
      "One cumulative terminal-only workspace rooted at media-archive/ with inbox/, organized/, backup/, and review/ folders",
    deliverable:
      "One five-step Community Media Archive capstone that inspects the workspace, creates the structure, writes the guide, moves and renames records, backs up the photo index, removes only the temporary import, verifies the result, and creates organized/READY.txt.",
    stepCountTarget: 5,
    flow: "progressive",
    requirements: [
      "Keep the capstone in exactly one capstone section and one capstone topic.",
      "Carry the full working workspace from one step into the next.",
      "Use only commands taught in this course: pwd, ls, cd, mkdir, touch, echo, redirection, cat, head, tail, wc -l, cp, mv, and safe single-file rm.",
      "Require inspection before changes and a targeted verification pass after changes.",
      "Forbid sudo, recursive rm, chmod, chown, package installation, external networking, and commands not taught in the course.",
      "Keep every workspace path and expected result explicit and deterministic.",
    ],
    stepLadder: [
      {
        step: 1,
        title: "Inspect and Build the Archive Structure",
        requirement:
          "Inspect media-archive, enter it, create organized/photos, organized/documents, backup, and review, then create review/needs-review.txt.",
      },
      {
        step: 2,
        title: "Write the Archive Guide and Review Note",
        requirement:
          "Use echo with > and >> to write organized/README.txt and add the review instruction to review/needs-review.txt, then verify both with cat.",
      },
      {
        step: 3,
        title: "Move and Rename the Incoming Records",
        requirement:
          "Move the photo index, release forms, and shoot notes into their final folders, renaming photo-index.txt to organized/photos/index.txt.",
      },
      {
        step: 4,
        title: "Back Up the Index and Remove the Temporary Import",
        requirement:
          "Copy organized/photos/index.txt to backup/photo-index-backup.txt, remove only inbox/tmp-import.txt, and verify both results.",
      },
      {
        step: 5,
        title: "Verify the Archive and Mark It Ready",
        requirement:
          "Use pwd, targeted ls, cat, and wc -l to verify the complete archive, then write and display organized/READY.txt.",
      },
    ],
  };
}

function updateCourseFile(file, { fullSpec }) {
  if (!fs.existsSync(file)) return false;
  const course = readJson(file);
  if (fullSpec) {
    course.authoringGuidance ??= [];
    uniquePush(course.authoringGuidance, [
      "Begin the course with one standalone reading-only sketch titled Welcome to Linux Terminal Fundamentals before the existing technical sketch The terminal is a command conversation.",
      "The course introduction must explain audience, prerequisites, the safe ZoeSkoul terminal workspace, the three-module journey, the projects, and the inspect first, change second, verify last habit.",
      "Do not replace or rename the first technical sketch when adding the course introduction.",
      "Every technical sketch should read like a short book section: definition, command shape, worked example, workspace effect, common mistake or safety warning, and transition to practice.",
      "Exercise help must be command-specific and path-specific; do not use one generic Linux help template across unrelated commands.",
      "Every terminal-workspace exercise prompt must explicitly remind the learner to press Enter after typing each command so the terminal actually runs it.",
      "Final capstones use exactly one capstone section and one capstone topic with multiple cumulative steps.",
      "The final Linux capstone must transfer the taught command set into a domain that is clearly different from the Module 2 notes organizer.",
    ]);

    course.topicPolicies ??= {};
    course.topicPolicies["what-the-terminal-is"] ??= {};
    delete course.topicPolicies["what-the-terminal-is"].teachingMode;
    course.topicPolicies["what-the-terminal-is"].notes = [
      "Prepend one reading-only course-introduction sketch with no Try It.",
      "Preserve the existing terminal-command, prompt-and-output, and safe-inspection sketches after the introduction.",
      "Technical sketches keep their own aligned terminal-workspace Try It exercises.",
    ];
  }

  const module1 = findModule(course, 1);
  if (module1) {
    const opening = findTopic(module1, "what-the-terminal-is");
    if (opening) {
      opening.topic.title = "What the Terminal Is";
      opening.topic.summary =
        "Open with a standalone course welcome, then understand the terminal as a command conversation with a prompt, commands, output, and safe inspection habits.";
      opening.topic.technical = true;
      opening.topic.learningGoals = [
        "Understand who this course is for, what the safe terminal workspace contains, and how the three modules build on one another.",
        "Explain the prompt, command, and output parts of a terminal exchange.",
        "Use inspect first, change second, verify last as the course safety habit.",
      ];
      opening.topic.practice ??= {};
      opening.topic.practice.tryIt = true;
      opening.topic.practice.requiresTryIt = true;
      opening.topic.practice.runtimeMode = "terminal_workspace";
      opening.topic.practice.terminalSessionScope = "exercise";
    }
  }

  const module2 = findModule(course, 2);
  if (module2) {
  }

  const module3 = findModule(course, 3);
  if (module3) {
    module3.title = "Final Capstone: Community Media Archive";
    if ("description" in module3) {
      module3.description =
        "Transfer the full beginner terminal workflow into a community media archive and finish with an explicit verification pass.";
    }
    module3.purpose =
      "Prove that inspection, navigation, creation, writing, reading, copying, moving, renaming, safe deletion, and verification can be combined without step-by-step command coaching.";
    module3.moduleProject =
      "Prepare and verify a Community Media Archive through five cumulative terminal-workspace milestones.";

    const capstoneSections = (module3.sections ?? []).filter(
      (section) => section.role === "capstone",
    );
    const sourceSection = capstoneSections[0] ?? module3.sections?.[0];
    if (sourceSection) {
      const sourceTopic =
        (sourceSection.topics ?? []).find(
          (topic) => topic.topicId === "final-capstone-file-room-handoff",
        ) ?? sourceSection.topics?.[0];
      sourceSection.role = "capstone";
      sourceSection.title = "Final Capstone";
      sourceSection.summary =
        "Organize and verify a community media archive in one cumulative project topic.";
      if ("description" in sourceSection) sourceSection.description = sourceSection.summary;
      if (sourceTopic) {
        sourceTopic.topicId = "final-capstone-file-room-handoff";
        sourceTopic.title = "Community Media Archive";
        sourceTopic.summary =
          "Build, organize, protect, clean, and verify a media archive with the complete beginner terminal toolkit.";
        sourceTopic.minutes = Math.max(Number(sourceTopic.minutes ?? 0), 95);
        sourceTopic.technical = true;
        sourceTopic.learningGoals = [
          "Inspect and navigate before making workspace changes.",
          "Create nested folders and placeholder files with mkdir, mkdir -p, and touch.",
          "Write and append guide text with echo, >, and >>, then inspect it with cat.",
          "Move, rename, and copy important records with mv and cp.",
          "Remove only the named temporary file with safe rm.",
          "Verify the final structure with pwd, targeted ls, cat, and wc -l before marking it ready.",
        ];
        sourceTopic.practice ??= {};
        sourceTopic.practice.tryIt = true;
        sourceTopic.practice.requiresTryIt = true;
        sourceTopic.practice.tryItPlacement = "all_sketches";
        sourceTopic.practice.runtimeMode = "terminal_workspace";
        sourceTopic.practice.terminalSessionScope = "project";
        sourceTopic.practice.projectFlow = "progressive";
        sourceTopic.practice.expectedPracticeKinds = ["code_input"];
        sourceTopic.projectBrief = buildCapstoneBrief();
        sourceSection.topics = [sourceTopic];
      }
      module3.sections = [sourceSection];
    }
  }

  if (fullSpec) {
    course.courseGenerationPolicy ??= {};
    course.courseGenerationPolicy.notes ??= [];
    uniquePush(course.courseGenerationPolicy.notes, [
      "Generate one standalone reading-only course-introduction sketch before the first technical sketch.",
      "Generate concept-specific help grounded in the exact command, path, and expected workspace result.",
      "Generate an explicit press-Enter reminder in every terminal-workspace exercise prompt.",
      "Keep the final capstone to one section, one topic, and five progressive steps using the Community Media Archive scenario.",
    ]);
  }

  writeJson(file, course);
  return true;
}

function listJsonFiles(directory) {
  if (!fs.existsSync(directory)) return [];

  const files = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(target);
      } else if (entry.name.endsWith(".json")) {
        files.push(target);
      }
    }
  };

  visit(directory);
  return files;
}

function resolveMessagePath(document, dottedPath) {
  let current = document;
  for (const segment of String(dottedPath ?? "").split(".")) {
    if (!segment || !current || typeof current !== "object") return null;
    current = current[segment];
  }
  return current ?? null;
}

function appendEnterReminder(prompt, reminder) {
  if (typeof prompt !== "string") return prompt;
  if (/press\s+(?:\*\*)?enter/i.test(prompt)) return prompt;
  return `${prompt.trimEnd()} ${reminder}`;
}

function terminalReminderForExercise(exercise) {
  const entryFile = (exercise.solutionFiles ?? []).find(
    (file) => file?.isEntry || file?.entry || file?.path === "main.sh",
  );
  const solution = String(entryFile?.content ?? exercise.solutionCode ?? "");
  const commandCount = solution
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#")).length;

  return commandCount > 1
    ? "Press **Enter** after each command and wait for its result before typing the next one."
    : "After typing the command, press **Enter** so the terminal runs it.";
}

function ensureTerminalExerciseEnterReminders() {
  const draftRoot = path.join(root, ".curriculum-drafts/linux");
  const subjectRoot = path.join(
    draftRoot,
    "subjects/linux--linux-terminal-fundamentals--draft",
  );
  const messageRoot = path.join(
    draftRoot,
    "messages/en/subjects/linux--linux-terminal-fundamentals--draft",
  );

  if (!fs.existsSync(subjectRoot) || !fs.existsSync(messageRoot)) return;

  const messageDocuments = listJsonFiles(messageRoot).map((file) => ({
    file,
    value: readJson(file),
    dirty: false,
  }));

  const resolveAcrossMessages = (dottedPath) => {
    for (const document of messageDocuments) {
      const value = resolveMessagePath(document.value, dottedPath);
      if (value !== null) return { document, value };
    }
    return null;
  };

  for (const bundleFile of listJsonFiles(subjectRoot).filter((file) =>
    file.endsWith("topic.bundle.json"),
  )) {
    const bundle = readJson(bundleFile);

    for (const exercise of bundle.exercises ?? []) {
      const terminalWorkspace =
        exercise?.kind === "code_input" &&
        (exercise?.recipe?.mode === "terminal_workspace" ||
          exercise?.ideConfig?.layoutMode === "terminal_workspace");
      if (!terminalWorkspace || !exercise.messageBase) continue;

      const resolvedExercise = resolveAcrossMessages(exercise.messageBase);
      if (!resolvedExercise || typeof resolvedExercise.value?.prompt !== "string") {
        throw new Error(
          `Cannot find terminal prompt for ${exercise.id ?? exercise.messageBase}`,
        );
      }

      const nextPrompt = appendEnterReminder(
        resolvedExercise.value.prompt,
        terminalReminderForExercise(exercise),
      );
      if (nextPrompt !== resolvedExercise.value.prompt) {
        resolvedExercise.value.prompt = nextPrompt;
        resolvedExercise.document.dirty = true;
      }

      for (const card of bundle.cards ?? []) {
        const tryIt = card?.tryIt;
        if (tryIt?.exerciseKey !== exercise.id || !tryIt?.promptKey) continue;

        const promptPath = String(tryIt.promptKey);
        const lastDot = promptPath.lastIndexOf(".");
        if (lastDot < 0) continue;

        const parent = resolveAcrossMessages(promptPath.slice(0, lastDot));
        const key = promptPath.slice(lastDot + 1);
        if (!parent || typeof parent.value?.[key] !== "string") {
          throw new Error(`Cannot find Try It prompt ${promptPath}`);
        }

        const isMultiCommand = terminalReminderForExercise(exercise).startsWith(
          "Press **Enter** after each command",
        );
        const nextTryItPrompt = appendEnterReminder(
          parent.value[key],
          isMultiCommand
            ? "Press **Enter** after each command."
            : "Press **Enter** to run the command.",
        );
        if (nextTryItPrompt !== parent.value[key]) {
          parent.value[key] = nextTryItPrompt;
          parent.document.dirty = true;
        }
      }
    }
  }

  for (const document of messageDocuments) {
    if (!document.dirty) continue;
    writeJson(document.file, document.value);
    changed.push(path.relative(root, document.file));
  }
}

function removeOptionalDraftArtifacts() {
  const draftRoot = path.join(root, ".curriculum-drafts/linux");
  if (!fs.existsSync(draftRoot)) return;

  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.name === "__MACOSX" || entry.name === ".DS_Store") {
        fs.rmSync(target, { recursive: true, force: true });
        changed.push(path.relative(root, target));
        continue;
      }
      if (entry.isDirectory()) {
        visit(target);
        continue;
      }
      if (entry.name.includes(".before-")) {
        fs.rmSync(target, { force: true });
        changed.push(path.relative(root, target));
      }
    }
  };

  visit(draftRoot);
}

const changed = [];
removeOptionalDraftArtifacts();
ensureTerminalExerciseEnterReminders();
for (const name of ["course.spec.json", "course.plan.json"]) {
  const file = path.join(courseDir, name);
  if (updateCourseFile(file, { fullSpec: name === "course.spec.json" })) {
    changed.push(path.relative(root, file));
  }
}

const blueprintFile = path.join(courseDir, "course.blueprint.json");
if (fs.existsSync(blueprintFile)) {
  const blueprint = readJson(blueprintFile);
  blueprint.courseGenerationPolicy ??= {};
  blueprint.courseGenerationPolicy.notes ??= [];
  uniquePush(blueprint.courseGenerationPolicy.notes, [
    "Prepend a standalone reading-only course welcome without replacing the first technical sketch.",
    "Use book-like technical prose and concept-specific help.",
    "Remind learners to press Enter after each terminal command in every terminal-workspace exercise prompt.",
    "Keep the final capstone in one section and one topic with five cumulative Community Media Archive steps.",
  ]);
  writeJson(blueprintFile, blueprint);
  changed.push(path.relative(root, blueprintFile));
}

const validationFile = path.join(courseDir, "validation.policy.json");
if (fs.existsSync(validationFile)) {
  const policy = readJson(validationFile);
  policy.rules ??= {};
  policy.rules.pedagogy ??= [];
  uniquePush(policy.rules.pedagogy, [
    "Require one standalone course-introduction sketch before the first technical sketch.",
    "Reject generic help repeated across unrelated commands.",
    "Reject terminal-workspace prompts that do not tell the learner to press Enter after typing the command.",
    "Require final capstones to use exactly one section, one topic, and multiple progressive steps.",
    "Require the capstone to use inspection, navigation, creation, writing, viewing, copying, moving, renaming, safe deletion, and final verification.",
  ]);
  writeJson(validationFile, policy);
  changed.push(path.relative(root, validationFile));
}

// Shared sketch-heading deduplication. This is intentionally idempotent so it
// coexists with the same fix already introduced by the Python curriculum patch.
const sketchDir = path.join(
  root,
  "apps/web/src/components/sketches/subjects",
);
const helperFile = path.join(sketchDir, "getDistinctSketchShellTitle.ts");
const helperTestFile = path.join(
  sketchDir,
  "getDistinctSketchShellTitle.test.ts",
);
const sketchBlockFile = path.join(sketchDir, "SketchBlock.tsx");

if (fs.existsSync(sketchDir) && !fs.existsSync(helperFile)) {
  const helperSource = [
    'export function normalizeSketchHeading(value: string): string {',
    '    return value',
    '        .normalize("NFKC")',
    '        .replace(/[\\x60*_~]/g, "")',
    '        .replace(/\\s+/g, " ")',
    '        .trim()',
    '        .toLocaleLowerCase();',
    '}',
    '',
    'export function getDistinctSketchShellTitle(',
    '    cardTitle: string | null | undefined,',
    '    contentTitle: string | null | undefined,',
    '): string | undefined {',
    '    const resolvedCardTitle = cardTitle?.trim();',
    '    if (!resolvedCardTitle) return undefined;',
    '',
    '    const resolvedContentTitle = contentTitle?.trim();',
    '    if (',
    '        resolvedContentTitle &&',
    '        normalizeSketchHeading(resolvedCardTitle) ===',
    '            normalizeSketchHeading(resolvedContentTitle)',
    '    ) {',
    '        return undefined;',
    '    }',
    '',
    '    return resolvedCardTitle;',
    '}',
    '',
  ].join("\n");
  fs.writeFileSync(helperFile, helperSource);
  changed.push(path.relative(root, helperFile));
}

if (fs.existsSync(sketchDir) && !fs.existsSync(helperTestFile)) {
  const testSource = [
    'import { describe, expect, it } from "vitest";',
    '',
    'import { getDistinctSketchShellTitle } from "./getDistinctSketchShellTitle";',
    '',
    'describe("getDistinctSketchShellTitle", () => {',
    '    it("hides an outer title that repeats the sketch heading", () => {',
    '        expect(getDistinctSketchShellTitle("Use cp for a backup", "Use cp for a backup")).toBeUndefined();',
    '    });',
    '',
    '    it("normalizes markdown, whitespace, and case", () => {',
    '        expect(getDistinctSketchShellTitle(" USE  **CP** FOR A BACKUP ", "Use cp for a backup")).toBeUndefined();',
    '    });',
    '',
    '    it("keeps a different course-introduction shell title", () => {',
    '        expect(getDistinctSketchShellTitle("Course introduction", "Welcome to Linux Terminal Fundamentals")).toBe("Course introduction");',
    '    });',
    '});',
    '',
  ].join("\n");
  fs.writeFileSync(helperTestFile, testSource);
  changed.push(path.relative(root, helperTestFile));
}

if (fs.existsSync(sketchBlockFile)) {
  let source = fs.readFileSync(sketchBlockFile, "utf8");
  if (!source.includes("getDistinctSketchShellTitle")) {
    const importAnchor =
      'import { learnerUiFlags } from "@/lib/config/learnerUiFlags";';
    if (!source.includes(importAnchor)) {
      throw new Error(
        `Cannot safely add sketch title helper import: missing anchor in ${sketchBlockFile}`,
      );
    }
    source = source.replace(
      importAnchor,
      `${importAnchor}\nimport { getDistinctSketchShellTitle } from "./getDistinctSketchShellTitle";`,
    );

    const titleAnchor = "const shellTitle = tt.resolve(title ?? spec.title);";
    if (!source.includes(titleAnchor)) {
      throw new Error(
        `Cannot safely replace duplicate sketch title logic: missing anchor in ${sketchBlockFile}`,
      );
    }
    source = source.replace(
      titleAnchor,
      `const resolvedCardTitle = tt.resolve(title ?? null);\n    const resolvedContentTitle = tt.resolve(spec.title ?? null);\n    const shellTitle = getDistinctSketchShellTitle(\n        resolvedCardTitle,\n        resolvedContentTitle,\n    );`,
    );
    fs.writeFileSync(sketchBlockFile, source);
    changed.push(path.relative(root, sketchBlockFile));
  }
}

console.log("Linux authoring and shared UI synchronization complete.");
for (const file of changed) console.log(`- ${file}`);
if (changed.length === 0) console.log("- no changes were needed");
