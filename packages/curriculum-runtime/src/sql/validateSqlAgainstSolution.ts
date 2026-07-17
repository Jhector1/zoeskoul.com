import type { RunSqlFn } from "./runner.js";
import type { SqlRunResult, SqlTable } from "./types.js";
import { validateSqlSubmission } from "./validateSqlSubmission.js";

export type ValidateSqlAgainstSolutionResult = {
    ok: boolean;
    errorStage?:
        | "runner_missing"
        | "learner_run_failed"
        | "solution_run_failed"
        | "learner_table_missing"
        | "solution_table_missing"
        | "table_mismatch";
    message?: string;
    learnerRun?: SqlRunResult | unknown;
    solutionRun?: SqlRunResult | unknown;
    learnerTable?: SqlTable | null;
    solutionTable?: SqlTable | null;
};

export async function validateSqlAgainstSolution(args: {
    learnerSql: string;
    solutionSql: string;
    checkSql?: string;
    dialect?: string;
    schemaSql?: string;
    seedSql?: string;
    datasetId?: string;
    ignoreRowOrder?: boolean;
    limits?: {
        statementTimeoutMs?: number;
        maxRows?: number;
        maxBytes?: number;
    };
    runSql?: RunSqlFn | null;
}): Promise<ValidateSqlAgainstSolutionResult> {
    const result = await validateSqlSubmission({
        ...args,
        compareTo: "solution",
    });

    const { referenceRun, referenceTable, errorStage, ...rest } = result;

    return {
        ...rest,
        errorStage:
            errorStage === "reference_run_failed"
                ? "solution_run_failed"
                : errorStage === "reference_table_missing"
                  ? "solution_table_missing"
                  : errorStage,
        solutionRun: referenceRun,
        solutionTable: referenceTable,
    };
}
