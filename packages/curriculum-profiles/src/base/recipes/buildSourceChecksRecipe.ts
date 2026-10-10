import { buildSourceChecksExpected } from "../codeInputExpected.js";

export const buildSourceChecksRecipe = (def: any, args: any, resolved: any) => {
  const expected = buildSourceChecksExpected({
    recipe: def.recipe,
    workspaceExpectations:
      def.workspaceExpectations ?? def.workspace?.workspaceExpectations,
    sourceChecks: def.sourceChecks,
  });

  return {
    archetype: def.id,
    id: args.id,
    topic: args.topic,
    diff: args.diff,
    kind: "code_input",
    title: resolved.title,
    prompt: resolved.prompt,
    language: def.language ?? "web",
    starterCode: String(def.starterCode ?? resolved.starterCode ?? ""),
    workspace: def.workspace,
    help: resolved.help,
    hint: resolved.hint,
    expected,
    expectedExample: null,
  };
};
