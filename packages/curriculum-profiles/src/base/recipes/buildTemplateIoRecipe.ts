import { buildTerminalExpectedExample } from "../expectedExample.js";

function fillTemplate(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => String(vars[key] ?? ""));
}

export const buildTemplateIoRecipe = (def: any, args: any, resolved: any) => {
  const vars: Record<string, string | number> = args.vars ?? {};
  const tests = def.recipe.tests.map((t: any) => ({
    stdin: t.stdinTemplate ? fillTemplate(t.stdinTemplate, vars) : undefined,
    stdout: fillTemplate(t.stdoutTemplate, vars),
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
      ...(def.recipe.solutionTemplate
        ? { solutionCode: fillTemplate(def.recipe.solutionTemplate, vars) }
        : {})
    },
    expectedExample
  };
};
