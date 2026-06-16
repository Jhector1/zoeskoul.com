import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type JsonObject = Record<string, any>;

const WEB_ROOT = fs.existsSync(path.resolve(process.cwd(), "src"))
  ? process.cwd()
  : path.resolve(process.cwd(), "apps/web");

const SUBJECT_ROOT = path.join(WEB_ROOT, "src/lib/subjects/python-v2");
const SUBJECT_MANIFEST_PATH = path.join(SUBJECT_ROOT, "subject.manifest.json");

function readJson(filePath: string): JsonObject {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as JsonObject;
}

function topicPath(moduleSlug: string, topicSlug: string) {
  const moduleNumber = moduleSlug.split("-").at(-1);
  return path.join(
    SUBJECT_ROOT,
    `modules/module${moduleNumber}/topics/${topicSlug}/topic.bundle.json`,
  );
}

function assertNonEmptyString(value: unknown, message: string) {
  expect(typeof value === "string" && value.trim().length > 0, message).toBe(true);
}

function assertSubset(
  values: string[],
  allowed: string[],
  message: string,
) {
  const allowedSet = new Set(allowed);
  const missing = values.filter((value) => !allowedSet.has(value));
  expect(missing, message).toEqual([]);
}

describe("python-v2 course content", () => {
  it("has unique active topic slugs and referenced topic bundle files", () => {
    const manifest = readJson(SUBJECT_MANIFEST_PATH);
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    const missingFiles: string[] = [];

    for (const module of manifest.modules ?? []) {
      for (const section of module.sections ?? []) {
        for (const topicSlug of section.topics ?? []) {
          const location = `${module.slug}/${section.slug}`;
          if (seen.has(topicSlug)) {
            duplicates.push(`${topicSlug} in ${seen.get(topicSlug)} and ${location}`);
          } else {
            seen.set(topicSlug, location);
          }

          const filePath = topicPath(module.slug, topicSlug);
          if (!fs.existsSync(filePath)) {
            missingFiles.push(path.relative(WEB_ROOT, filePath));
          }
        }
      }
    }

    expect(duplicates).toEqual([]);
    expect(missingFiles).toEqual([]);
  });

  it("uses explicit answer metadata and code tests for every exercise", () => {
    const manifest = readJson(SUBJECT_MANIFEST_PATH);
    const issues: string[] = [];

    for (const module of manifest.modules ?? []) {
      for (const section of module.sections ?? []) {
        for (const topicSlug of section.topics ?? []) {
          const filePath = topicPath(module.slug, topicSlug);
          const topic = readJson(filePath);
          const location = `${module.slug}/${topicSlug}`;

          for (const exercise of topic.exercises ?? []) {
            const exerciseRef = `${location}/${exercise.id}`;
            const expected = exercise.expected ?? {};

            try {
              if (exercise.kind === "single_choice") {
                assertNonEmptyString(
                  expected.optionId,
                  `${exerciseRef} missing expected.optionId`,
                );
                assertSubset(
                  [String(expected.optionId)],
                  exercise.optionIds ?? [],
                  `${exerciseRef} expected.optionId is not listed in optionIds`,
                );
                continue;
              }

              if (exercise.kind === "multi_choice") {
                expect(
                  Array.isArray(expected.optionIds) && expected.optionIds.length > 0,
                  `${exerciseRef} missing expected.optionIds`,
                ).toBe(true);
                assertSubset(
                  expected.optionIds.map(String),
                  exercise.optionIds ?? [],
                  `${exerciseRef} expected.optionIds contains unknown ids`,
                );
                continue;
              }

              if (exercise.kind === "fill_blank_choice") {
                assertNonEmptyString(
                  expected.value,
                  `${exerciseRef} missing expected.value`,
                );
                continue;
              }

              if (exercise.kind === "drag_reorder") {
                const order = Array.isArray(expected.tokenIds)
                  ? expected.tokenIds.map(String)
                  : Array.isArray(expected.order)
                    ? expected.order.map(String)
                    : [];

                expect(order.length > 0, `${exerciseRef} missing reorder answer`).toBe(
                  true,
                );
                expect(
                  new Set(order).size,
                  `${exerciseRef} reorder answer contains duplicate ids`,
                ).toBe(order.length);
                expect(
                  order.length,
                  `${exerciseRef} reorder answer length differs from tokenIds`,
                ).toBe((exercise.tokenIds ?? []).length);
                assertSubset(
                  order,
                  exercise.tokenIds ?? [],
                  `${exerciseRef} reorder answer contains unknown token ids`,
                );
                continue;
              }

              if (exercise.kind === "code_input") {
                const recipe = exercise.recipe ?? {};
                const isTerminalWorkspaceShellTask =
                  recipe.type === "shell_task" &&
                  recipe.mode === "terminal_workspace";
                const tests = Array.isArray(recipe.tests)
                  ? recipe.tests
                  : Array.isArray(expected.tests)
                    ? expected.tests
                    : [];
                const sourceChecks = Array.isArray(recipe.sourceChecks)
                  ? recipe.sourceChecks
                  : Array.isArray(expected.sourceChecks)
                    ? expected.sourceChecks
                    : [];

                if (isTerminalWorkspaceShellTask) {
                  const workspaceExpectations =
                    exercise.workspaceExpectations ??
                    exercise.workspace?.workspaceExpectations ??
                    expected.workspaceExpectations ??
                    {};
                  const hasWorkspaceExpectation =
                    Array.isArray(workspaceExpectations.requiredFiles) ||
                    Array.isArray(workspaceExpectations.requiredFolders) ||
                    Array.isArray(workspaceExpectations.forbiddenFiles);

                  expect(
                    hasWorkspaceExpectation,
                    `${exerciseRef} terminal_workspace shell_task must define workspaceExpectations`,
                  ).toBe(true);
                  continue;
                }

                expect(
                  tests.length >= 2 || (tests.length >= 1 && sourceChecks.length >= 1),
                  `${exerciseRef} code_input must include at least 2 tests or 1 runtime test plus source checks`,
                ).toBe(true);

                for (const [index, test] of tests.entries()) {
                  const stdout =
                    typeof test.stdout === "string"
                      ? test.stdout
                      : typeof test.stdoutTemplate === "string"
                        ? test.stdoutTemplate
                        : null;
                  assertNonEmptyString(
                    stdout,
                    `${exerciseRef} test ${index + 1} missing expected output`,
                  );
                }
              }
            } catch (error) {
              issues.push(error instanceof Error ? error.message : String(error));
            }
          }
        }
      }
    }

    expect(issues).toEqual([]);
  });
});
