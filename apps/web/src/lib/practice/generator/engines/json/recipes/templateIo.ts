import { makeCodeInputOut } from "@/lib/practice/generator/engines/utils";
import type { RecipeHandler } from "./types";
import { buildTerminalExpectedExample } from "./expectedExample";
import {
    buildTemplateIoExpected,
    resolveTemplateIoVars,
} from "@zoeskoul-code-input-expected";

export const buildTemplateIoRecipe: RecipeHandler<any> = (def, args, resolved) => {
    const vars = resolveTemplateIoVars({
        recipe: def.recipe,
        rng: args.rng,
    });
    const expected = buildTemplateIoExpected({
        recipe: def.recipe,
        vars,
    });
    const tests = expected.tests;

    const expectedExample = buildTerminalExpectedExample({
        def,
        resolved,
        tests,
    });

    return makeCodeInputOut({
        archetype: def.id,
        id: args.id,
        topic: args.topic,
        diff: args.diff,
        title: resolved.title,
        prompt: resolved.prompt,
        language: def.language ?? "python",
        starterCode: resolved.starterCode,
        help: resolved.help,
        hint: resolved.hint,
        fixedSqlDialect: def.fixedSqlDialect,
        expected: expected as any,
        expectedExample,
    });
};
