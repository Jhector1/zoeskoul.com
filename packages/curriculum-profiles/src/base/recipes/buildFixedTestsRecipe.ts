import { buildTerminalExpectedExample } from "../expectedExample.js";

export const buildFixedTestsRecipe = (def: any, args: any, resolved: any) => {
  const tests = def.recipe.tests.map((t: any) => ({
    stdin: t.stdin,
    stdout: t.stdout,
    match: t.match ?? "exact"
  }));

  const expectedExample = buildTerminalExpectedExample({ def, resolved, tests });

  return {
    archetype: def.id,
    id: args.id,
    topic: args.topic,
    diff: args.diff,
    kind: "code_input",
    title: resolved.title,
    prompt: resolved.prompt,
    language: def.language ?? "python",
    starterCode: resolved.starterCode,
    help: resolved.help,
    hint: resolved.hint,
    expected: {
      kind: "code_input",
      tests,
      ...(def.recipe.solutionCode ? { solutionCode: def.recipe.solutionCode } : {})
    },
    expectedExample
  };
};
