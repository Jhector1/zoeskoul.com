import { extractFirstSqlTable } from "./extractFirstSqlTable.js";
import { getSqlRunner, type RunSqlFn } from "./runner.js";
import { sqlTablesEqual } from "./sqlTablesEqual.js";
import type { SqlRunResult, SqlTable } from "./types.js";

export type SqlValidationTarget =
    | {
          compareTo: "solution";
          solutionSql: string;
      }
    | {
          compareTo: "expected_table";
          expectedTable: SqlTable;
      };

export type ValidateSqlSubmissionResult = {
    ok: boolean;
    errorStage?:
        | "runner_missing"
        | "learner_run_failed"
        | "reference_run_failed"
        | "learner_table_missing"
        | "reference_table_missing"
        | "table_mismatch";
    message?: string;
    learnerRun?: SqlRunResult | unknown;
    referenceRun?: SqlRunResult | unknown;
    learnerTable?: SqlTable | null;
    referenceTable?: SqlTable | null;
};

export async function validateSqlSubmission(
    args: {
        learnerSql: string;
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
    } & SqlValidationTarget,
): Promise<ValidateSqlSubmissionResult> {
    const runSql = args.runSql ?? getSqlRunner();

    if (!runSql) {
        return {
            ok: false,
            errorStage: "runner_missing",
            message: "No SQL runner is configured.",
        };
    }

    const dialect = args.dialect ?? "sqlite";
    const run = (code: string) =>
        runSql({
            code,
            checkSql: args.checkSql,
            dialect,
            schemaSql: args.schemaSql,
            seedSql: args.seedSql,
            datasetId: args.datasetId,
            limits: args.limits,
        });

    const learnerRun = await run(args.learnerSql);

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

    let referenceRun: SqlRunResult | unknown = undefined;
    let referenceTable: SqlTable | null;

    if (args.compareTo === "solution") {
        referenceRun = await run(args.solutionSql);

        if (!(referenceRun as SqlRunResult)?.ok) {
            return {
                ok: false,
                errorStage: "reference_run_failed",
                message: "Solution SQL failed to execute.",
                learnerRun,
                referenceRun,
                learnerTable,
            };
        }

        referenceTable = extractFirstSqlTable(referenceRun as SqlRunResult);
        if (!referenceTable) {
            return {
                ok: false,
                errorStage: "reference_table_missing",
                message: "Solution SQL produced no readable result table.",
                learnerRun,
                referenceRun,
                learnerTable,
                referenceTable,
            };
        }
    } else {
        referenceTable = args.expectedTable;
    }

    const pass = sqlTablesEqual(
        learnerTable,
        referenceTable,
        args.ignoreRowOrder ?? false,
    );

    if (!pass) {
        return {
            ok: false,
            errorStage: "table_mismatch",
            message: "Learner SQL result does not match the expected result.",
            learnerRun,
            referenceRun,
            learnerTable,
            referenceTable,
        };
    }

    return {
        ok: true,
        learnerRun,
        referenceRun,
        learnerTable,
        referenceTable,
    };
}
