import {
    cleanRuntimeCode,
    makeCodeInputOut,
    starterCodeForGeneratedExercise
} from "@/lib/practice/generator/engines/utils";
import type { RecipeHandler } from "./types";
import {
    buildFixedTestsExpected,
    buildSemanticExpected,
} from "@zoeskoul-code-input-expected";
import {
    assertSemanticCheckPaths,
    restoreSemanticCheckPaths,
    stripSemanticCheckPaths,
} from "@/lib/practice/semanticCheckPaths";

export const buildSemanticRecipe: RecipeHandler<any> = (def, args, resolved) => {
    const rawSemanticChecks = (def.recipe as any)?.semanticChecks;
    const recipe = def.recipe as any;
    const expectedInput = {
        ...recipe,
        ...(Array.isArray(rawSemanticChecks)
            ? {
                semanticChecks: stripSemanticCheckPaths(rawSemanticChecks),
            }
            : {}),
    };
    const hasRuntimeTests =
        Array.isArray(recipe?.tests) && recipe.tests.length > 0;
    const expected = hasRuntimeTests
        ? buildFixedTestsExpected(
            expectedInput,
            def.workspaceExpectations ?? def.workspace?.workspaceExpectations,
        )
        : buildSemanticExpected(
            expectedInput,
            def.workspaceExpectations ?? def.workspace?.workspaceExpectations,
        );
    const semanticChecks = restoreSemanticCheckPaths({
        parsedChecks: (expected as any).semanticChecks,
        rawChecks: rawSemanticChecks,
    });
    const sourceChecks = Array.isArray((def.recipe as any)?.sourceChecks)
        ? (def.recipe as any).sourceChecks
        : Array.isArray((def as any).sourceChecks)
            ? (def as any).sourceChecks
            : undefined;

    // Keep full reveal answers in the server-only expected payload.
    // The public exercise object intentionally omits solutionCode/solutionFiles,
    // but the reveal endpoint needs them after the learner opens "Reveal answer".
    // fixed_tests already preserved these fields; semantic exercises need the same
    // behavior so project/capstone multifile reveals can show and fill every file.
    const solutionCode =
        typeof (expected as any).solutionCode === "string"
            ? (expected as any).solutionCode
            : typeof (def.recipe as any)?.solutionCode === "string"
                ? (def.recipe as any).solutionCode
                : typeof (def as any)?.solutionCode === "string"
                    ? (def as any).solutionCode
                    : undefined;
    const solutionFiles =
        (def as any).solutionFiles ??
        (def.recipe as any)?.solutionFiles ??
        (def.workspace as any)?.solutionFiles;

    assertSemanticCheckPaths({
        checks: semanticChecks,
        availableFiles:
            solutionFiles ??
            (def as any).starterFiles ??
            (def.workspace as any)?.starterFiles,
        exerciseId: String(def.id ?? args.id),
    });

    const expectedWithReveal = {
        ...(expected as any),
        ...(solutionCode !== undefined ? { solutionCode } : {}),
        ...(solutionFiles !== undefined ? { solutionFiles } : {}),
        ...(semanticChecks.length ? { semanticChecks } : {}),
        ...(sourceChecks?.length ? { sourceChecks } : {}),
        ...(hasRuntimeTests && recipe?.semanticFirst === true
            ? { semanticFirst: true }
            : {}),
    };

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
        files: (def as any).files ?? def.workspace?.files,
        initialFiles: (def as any).initialFiles ?? def.workspace?.initialFiles,
        workspaceFiles: (def as any).workspaceFiles ?? def.workspace?.workspaceFiles,
        fixtureFiles: (def as any).fixtureFiles ?? (def.workspace as any)?.fixtureFiles,
        fixtures: (def as any).fixtures ?? (def.workspace as any)?.fixtures,
        fileFixtures: (def as any).fileFixtures ?? (def.workspace as any)?.fileFixtures,
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
        expected: expectedWithReveal as any,
        expectedExample: null,
        ideConfig: def.serviceOverrides ?? null,
    });
};
