import { resolveManifestExercise } from "@/lib/curriculum/resolveManifestExercise";
import { resolveTopicBundleManifest } from "@/lib/curriculum/resolveTopicBundleManifest";
import { makeSqlExpected } from "@/lib/practice/generator/engines/sql/sqlExpected";
import type { LoadedValidateInstance } from "@/lib/practice/api/validate/repositories/instance.repo";

function nonEmpty(value: unknown): string | null {
    const normalized = String(value ?? "").trim();
    return normalized || null;
}

function unique(values: Array<string | null | undefined>): string[] {
    return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function stringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];

    return value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function objectArray(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) return [];

    return value.filter(
        (entry): entry is Record<string, unknown> =>
            Boolean(entry) &&
            typeof entry === "object" &&
            !Array.isArray(entry),
    );
}

export function buildCurrentAuthoredSqlExpectedFromExercise(exercise: any) {
    if (
        exercise?.kind !== "code_input" ||
        exercise?.recipe?.type !== "sql_query"
    ) {
        return null;
    }

    const solutionCode = nonEmpty(exercise.recipe.solutionCode);
    const datasetId = nonEmpty(exercise.recipe.datasetId);
    if (!solutionCode || !datasetId) return null;

    const expected = makeSqlExpected({
        recipe: {
            type: "sql_query",
            datasetId,
            solutionCode,
            checkSql: nonEmpty(exercise.recipe.checkSql) ?? undefined,
            resultShape: exercise.recipe.resultShape ?? "table",
            ignoreRowOrder: exercise.recipe.ignoreRowOrder,
            tests: exercise.recipe.tests,
        },
        fixedSqlDialect: exercise.fixedSqlDialect ?? "sqlite",
    });

    const sqlFileOrder = stringArray(
        exercise.recipe.sqlFileOrder ?? exercise.sqlFileOrder,
    );
    const sourceChecks = objectArray(
        exercise.recipe.sourceChecks ?? exercise.sourceChecks,
    );
    const solutionFiles = objectArray(
        exercise.recipe.solutionFiles ?? exercise.solutionFiles,
    );
    const workspaceExpectations =
        exercise.workspaceExpectations &&
        typeof exercise.workspaceExpectations === "object"
            ? exercise.workspaceExpectations
            : exercise.workspace?.workspaceExpectations &&
                typeof exercise.workspace.workspaceExpectations === "object"
              ? exercise.workspace.workspaceExpectations
              : undefined;

    return {
        ...expected,
        solutionCode,
        ...(sqlFileOrder.length ? { sqlFileOrder } : {}),
        ...(sourceChecks.length ? { sourceChecks } : {}),
        ...(solutionFiles.length ? { solutionFiles } : {}),
        ...(workspaceExpectations ? { workspaceExpectations } : {}),
    };
}

/**
 * Authored exercises are versioned by the current compiled topic bundle, while
 * PracticeQuestionInstance.secretPayload is only a persisted snapshot. Course
 * edits can keep the same exercise key but change its SQL solution contract.
 * In that case an unanswered, previously-created instance must not continue to
 * grade against the obsolete secret payload.
 */
export function resolveCurrentAuthoredSqlExpected(
    instance: LoadedValidateInstance,
) {
    const exerciseKey = nonEmpty(instance.exerciseKey);
    if (!exerciseKey || String(instance.kind) !== "code_input") return null;

    const publicPayload =
        instance.publicPayload && typeof instance.publicPayload === "object"
            ? (instance.publicPayload as Record<string, unknown>)
            : null;

    const publicLanguage = nonEmpty(publicPayload?.language)?.toLowerCase();
    const publicRuntime =
        publicPayload?.runtime && typeof publicPayload.runtime === "object"
            ? (publicPayload.runtime as Record<string, unknown>)
            : null;
    const runtimeKind = nonEmpty(publicRuntime?.kind)?.toLowerCase();

    if (publicLanguage && publicLanguage !== "sql" && runtimeKind !== "sql") {
        return null;
    }

    const subjectSlugs = unique([
        nonEmpty(instance.topic?.subject?.slug),
        nonEmpty(instance.topic?.module?.subject?.slug),
        nonEmpty(publicPayload?.subjectSlug),
    ]);
    const topicRefs = unique([
        nonEmpty(publicPayload?.topic),
        nonEmpty(publicPayload?.topicId),
        nonEmpty(instance.topic?.slug),
    ]);

    for (const subjectSlug of subjectSlugs) {
        for (const topicSlugOrId of topicRefs) {
            const topicBundle = resolveTopicBundleManifest({
                subjectSlug,
                topicSlugOrId,
            });
            if (!topicBundle) continue;

            let exercise: any;
            try {
                exercise = resolveManifestExercise({
                    topicBundle,
                    exerciseKey,
                });
            } catch {
                continue;
            }

            const expected =
                buildCurrentAuthoredSqlExpectedFromExercise(exercise);
            if (expected) return expected;
        }
    }

    return null;
}

export function selectExpectedCanonForValidation(args: {
    instance: LoadedValidateInstance;
    persistedExpected: unknown;
}) {
    return (
        resolveCurrentAuthoredSqlExpected(args.instance) ??
        args.persistedExpected
    );
}
