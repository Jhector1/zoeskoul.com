import { buildSourceChecksExpected } from "../codeInputExpected.js";
import { buildSourceChecksExpectedExample } from "@zoeskoul/curriculum-runtime/expected-example";

export const buildSourceChecksRecipe = (def: any, args: any, resolved: any) => {
  const expected = buildSourceChecksExpected({
    recipe: def.recipe,
    workspaceExpectations:
      def.workspaceExpectations ?? def.workspace?.workspaceExpectations,
    sourceChecks: def.sourceChecks,
  });
  const language =
    def.language ??
    def.workspace?.language ??
    def.topicRuntimeDefaults?.language ??
    "web";
  const entryFile =
    def.entryFile ??
    def.workspace?.entryFile ??
    def.workspace?.entryFilePath ??
    def.workspace?.mainFile ??
    def.workspace?.mainFilePath ??
    (language === "web" ? "index.html" : undefined);
  const solutionFiles = def.solutionFiles ?? def.recipe?.solutionFiles;
  const expectedExample = buildSourceChecksExpectedExample({
    def,
    resolved,
    language,
    runtimeKind: def.runtime?.kind ?? def.topicRuntimeDefaults?.kind,
    entryPath: entryFile,
    solutionFiles: Array.isArray(solutionFiles) ? solutionFiles : undefined,
    tests: Array.isArray(def.recipe?.tests)
      ? def.recipe.tests
      : Array.isArray(def.tests)
        ? def.tests
        : [],
  });

  return {
    archetype: def.id,
    id: args.id,
    topic: args.topic,
    diff: args.diff,
    kind: "code_input",
    title: resolved.title,
    prompt: resolved.prompt,
    language,
    starterCode: String(def.starterCode ?? resolved.starterCode ?? ""),
    workspace: def.workspace,
    help: resolved.help,
    hint: resolved.hint,
    expected,
    expectedExample,
  };
};
