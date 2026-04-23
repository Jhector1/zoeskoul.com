import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import type { SemanticValidationIssue } from "../../shared/profileServices.js";
import { getSqlRunner } from "@zoeskoul/curriculum-runtime";

const DEFAULT_SQL_LIMITS = {
    statementTimeoutMs: 4000,
    maxRows: 200,
    maxBytes: 128_000,
} as const;

export async function validateSqlSolutionExecutes(args: {
    seed: TopicSeed;
    draft: TopicAuthoringDraft;
}): Promise<{
    issues: SemanticValidationIssue[];
    runsByExerciseId: Record<string, unknown>;
}> {
    const issues: SemanticValidationIssue[] = [];
    const runsByExerciseId: Record<string, unknown> = {};
    const runSql = getSqlRunner();

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
                message: "No shared SQL runner is configured for compiler-side semantic validation.",
            });
            continue;
        }

        const dataset = args.seed.moduleDataset as
            | { schemaSql?: string; seedSql?: string }
            | null
            | undefined;

        const datasetId =
            exercise.datasetId ??
            (args.seed.moduleRuntimeDefaults?.kind === "sql"
                ? args.seed.moduleRuntimeDefaults.datasetId
                : undefined);

        const dialect =
            args.seed.moduleRuntimeDefaults?.kind === "sql"
                ? args.seed.moduleRuntimeDefaults.fixedSqlDialect ?? "sqlite"
                : "sqlite";

        const run = await runSql({
            code: exercise.solutionCode,
            dialect,
            schemaSql: dataset?.schemaSql ?? "",
            seedSql: dataset?.seedSql ?? "",
            datasetId,
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