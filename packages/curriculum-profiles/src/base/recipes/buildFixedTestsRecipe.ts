import { buildTerminalExpectedExample } from "../expectedExample.js";
import { buildFixedTestsExpected } from "../codeInputExpected.js";

export const buildFixedTestsRecipe = (def: any, args: any, resolved: any) => {
  const expected = buildFixedTestsExpected(def.recipe);
  const tests = expected.tests;

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
  starterCode: String(def.starterCode ?? resolved.starterCode ?? ""),
    help: resolved.help,
    hint: resolved.hint,
    expected,
    expectedExample
  };
};
