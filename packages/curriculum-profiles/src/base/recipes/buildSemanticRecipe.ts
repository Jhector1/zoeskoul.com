import { buildSemanticExpected } from "../codeInputExpected.js";

export const buildSemanticRecipe = (def: any, args: any, resolved: any) => {
  const expected = buildSemanticExpected(
    def.recipe,
    def.workspaceExpectations ?? def.workspace?.workspaceExpectations,
  );

  return {
    archetype: def.id,
    id: args.id,
    topic: args.topic,
    diff: args.diff,
    kind: "code_input",
    title: resolved.title,
    prompt: resolved.prompt,
    language: def.language ?? def.recipe.language ?? "python",
  starterCode: String(def.starterCode ?? resolved.starterCode ?? ""),
    help: resolved.help,
    hint: resolved.hint,
    expected,
    expectedExample: null,
  };
};
