import {
    cleanRuntimeCode,
    makeCodeInputOut,
    starterCodeForGeneratedExercise
} from "@/lib/practice/generator/engines/utils";
import type { RecipeHandler } from "./types";
import { buildSemanticExpected } from "@zoeskoul-code-input-expected";

export const buildSemanticRecipe: RecipeHandler<any> = (def, args, resolved) => {
    const expected = buildSemanticExpected(def.recipe);

    return makeCodeInputOut({
        archetype: def.id,
        id: args.id,
        topic: args.topic,
        diff: args.diff,
        title: resolved.title,
        prompt: resolved.prompt,
        language: def.language ?? def.recipe.language ?? "python",
      starterCode: starterCodeForGeneratedExercise(
    def.starterCode,
    resolved.starterCode,
),
        workspace: def.workspace,
        starterFiles: def.starterFiles,
        initialStdin: def.initialStdin,
        entryFile:
            def.entryFile ??
            def.workspace?.entryFile ??
            def.workspace?.entryFilePath ??
            def.workspace?.mainFile ??
            def.workspace?.mainFilePath,
        help: resolved.help,
        hint: resolved.hint,
        fixedSqlDialect: def.fixedSqlDialect,
        expected: expected as any,
        expectedExample: null,
        ideConfig: def.serviceOverrides ?? null,
    });
};
