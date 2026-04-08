import { makeCodeInputOut } from "@/lib/practice/generator/engines/utils";
import type { RecipeHandler } from "./types";
import type { ManifestCodeInput } from "@/lib/subjects/_core/manifestTypes";

export const buildFixedTestsRecipe: RecipeHandler<any> = (
    def: ManifestCodeInput & { recipe: { type: "fixed_tests"; tests: any[]; solutionCode?: string } },
    args,
    resolved,
) => {
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
            tests: def.recipe.tests,
            ...(def.recipe.solutionCode ? { solutionCode: def.recipe.solutionCode } : {}),
        } as any,
    });
};