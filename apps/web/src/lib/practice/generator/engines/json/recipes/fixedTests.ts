import { makeCodeInputOut } from "@/lib/practice/generator/engines/utils";
import type { RecipeHandler } from "./types";
import type { ManifestCodeInput } from "@/lib/subjects/_core/manifestTypes";
import { buildTerminalExpectedExample } from "./expectedExample";

export const buildFixedTestsRecipe: RecipeHandler<any> = (
    def: ManifestCodeInput & { recipe: { type: "fixed_tests"; tests: any[]; solutionCode?: string } },
    args,
    resolved,
) => {
    const tests = def.recipe.tests.map((t: any) => ({
        stdin: t.stdin,
        stdout: t.stdout,
        match: t.match ?? "exact",
    }));

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
        expected: {
            kind: "code_input",
            tests,
            ...(def.recipe.solutionCode ? { solutionCode: def.recipe.solutionCode } : {}),
        } as any,
        expectedExample,
    });
};