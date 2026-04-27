import { extractFirstSqlTable } from "./extractFirstSqlTable.js";
import { getSqlRunner, type RunSqlFn } from "./runner.js";
import { sqlTablesEqual } from "./sqlTablesEqual.js";
import type { SqlRunResult, SqlTable } from "./types.js";

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
    const runSql = args.runSql ?? getSqlRunner();

    if (!runSql) {
        return {
            ok: false,
            errorStage: "runner_missing",
            message: "No SQL runner is configured.",
        };
    }

    const dialect = args.dialect ?? "sqlite";

    const learnerRun = await runSql({
        code: args.learnerSql,
        checkSql: args.checkSql,
        dialect,
        schemaSql: args.schemaSql,
        seedSql: args.seedSql,
        datasetId: args.datasetId,
        limits: args.limits,
    });

    if (!(learnerRun as SqlRunResult)?.ok) {
        return {
            ok: false,
            errorStage: "learner_run_failed",
            message: "Learner SQL failed to execute.",
            learnerRun,
        };
    }

    const learnerTable = extractFirstSqlTable(learnerRun as SqlRunResult);
    if (!learnerTable) {
        return {
            ok: false,
            errorStage: "learner_table_missing",
            message: "Learner SQL produced no readable result table.",
            learnerRun,
            learnerTable,
        };
    }

    const solutionRun = await runSql({
        code: args.solutionSql,
        checkSql: args.checkSql,
        dialect,
        schemaSql: args.schemaSql,
        seedSql: args.seedSql,
        datasetId: args.datasetId,
        limits: args.limits,
    });

    if (!(solutionRun as SqlRunResult)?.ok) {
        return {
            ok: false,
            errorStage: "solution_run_failed",
            message: "Solution SQL failed to execute.",
            learnerRun,
            solutionRun,
            learnerTable,
        };
    }

    const solutionTable = extractFirstSqlTable(solutionRun as SqlRunResult);
    if (!solutionTable) {
        return {
            ok: false,
            errorStage: "solution_table_missing",
            message: "Solution SQL produced no readable result table.",
            learnerRun,
            solutionRun,
            learnerTable,
            solutionTable,
        };
    }

    const pass = sqlTablesEqual(
        learnerTable,
        solutionTable,
        args.ignoreRowOrder ?? false,
    );

    if (!pass) {
        return {
            ok: false,
            errorStage: "table_mismatch",
            message: "Learner SQL result does not match solution result.",
            learnerRun,
            solutionRun,
            learnerTable,
            solutionTable,
        };
    }

    return {
        ok: true,
        learnerRun,
        solutionRun,
        learnerTable,
        solutionTable,
    };
}