import type {
    TopicAuthoringDraft,
    TopicSeed,
    SqlDatasetArtifact,
} from "@zoeskoul/curriculum-contracts";
import type { SemanticValidationIssue } from "../../shared/profileServices.js";
import { resolveSqlRunner } from "@zoeskoul/curriculum-runtime";
import { getSqlDatasetById } from "../datasets/index.js";

const DEFAULT_SQL_LIMITS = {
    statementTimeoutMs: 4000,
    maxRows: 200,
    maxBytes: 128_000,
} as const;

function resolveExerciseDataset(args: {
    seed: TopicSeed;
    datasetId?: string;
}): { datasetId?: string; dataset: SqlDatasetArtifact | null } {
    const moduleDatasetId =
        args.seed.moduleRuntimeDefaults?.kind === "sql"
            ? args.seed.moduleRuntimeDefaults.datasetId
            : undefined;

    const datasetId = args.datasetId ?? moduleDatasetId;

    const dataset =
        datasetId && datasetId === moduleDatasetId
            ? args.seed.moduleDataset ?? getSqlDatasetById(datasetId)
            : datasetId
                ? getSqlDatasetById(datasetId)
                : args.seed.moduleDataset ?? null;

    return { datasetId, dataset };
}

export async function validateSqlSolutionExecutes(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): Promise<{
    issues: SemanticValidationIssue[];
    runsByExerciseId: Record<string, unknown>;
}> {
    const issues: SemanticValidationIssue[] = [];
    const runsByExerciseId: Record<string, unknown> = {};
    const runSql = resolveSqlRunner();

    for (const exercise of args.draft.quizDraft) {
        if (exercise.kind !== "code_input") continue;
        if ((exercise.recipeType ?? "sql_query") !== "sql_query") continue;

        if (!exercise.solutionCode.trim()) {
            issues.push({
                code: "SQL_SOLUTION_CODE_EMPTY",
                category: "execution",
                severity: "error",
                exerciseId: exercise.id,
                message: "SQL solutionCode is empty.",
            });
            continue;
        }

        if (!runSql) {
            issues.push({
                code: "SQL_RUNNER_NOT_CONFIGURED",
                category: "execution",
                severity: "warn",
                exerciseId: exercise.id,
                message: `No SQL runner is available for compiler-side semantic validation in ${args.seed.subjectSlug}/${args.seed.courseSlug ?? "unknown-course"} topic "${args.seed.topicId}".`,
            });
            continue;
        }

        const resolved = resolveExerciseDataset({
            seed: args.seed,
            datasetId: exercise.datasetId,
        });

        const dialect =
            args.seed.moduleRuntimeDefaults?.kind === "sql"
                ? args.seed.moduleRuntimeDefaults.fixedSqlDialect ?? "sqlite"
                : "sqlite";

        const run = await runSql({
            code: exercise.solutionCode,
            checkSql: exercise.checkSql,
            dialect,
            schemaSql: resolved.dataset?.schemaSql ?? "",
            seedSql: resolved.dataset?.seedSql ?? "",
            datasetId: resolved.datasetId,
            limits: DEFAULT_SQL_LIMITS,
        });

        runsByExerciseId[exercise.id] = run;

        if (!(run as { ok?: boolean })?.ok) {
            issues.push({
                code: "SQL_SOLUTION_EXECUTION_FAILED",
                category: "execution",
                severity: "error",
                exerciseId: exercise.id,
                message: "Generated SQL solution failed to execute.",
            });
        }
    }

    return { issues, runsByExerciseId };
}
