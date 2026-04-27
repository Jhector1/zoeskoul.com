import { buildTerminalExpectedExample } from "../expectedExample.js";
import {
  buildTemplateIoExpected,
  fillTemplate,
  resolveTemplateIoVars,
} from "../codeInputExpected.js";

export const buildTemplateIoRecipe = (def: any, args: any, resolved: any) => {
  const vars = resolveTemplateIoVars({
    recipe: def.recipe,
    vars: args.vars,
  });
  const expected = buildTemplateIoExpected({
    recipe: def.recipe,
    vars,
  });
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
    starterCode: resolved.starterCode,
    help: resolved.help,
    hint: resolved.hint,
    expected,
    expectedExample
  };
};
