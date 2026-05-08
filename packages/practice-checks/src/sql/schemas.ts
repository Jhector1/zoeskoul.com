import { z } from "zod";
import {
    makeSqlExpected,
    SQL_DIALECTS,
    type SqlExpected,
    type SqlExpectedInput,
    type SqlExpectedTest,
} from "./types";

export const SqlDialectSchema = z.enum(SQL_DIALECTS);

export const SqlCellSchema = z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
]);

export const SqlExpectedTableSchema = z.object({
    columns: z.array(z.string()),
    rows: z.array(z.array(SqlCellSchema)),
});

export const SqlRuntimeSchema = z.object({
    kind: z.literal("sql"),
    datasetId: z.string().min(1).optional(),
    resultShape: z.literal("table").optional(),
});

export const SqlExpectedTestSchema = z
    .object({
        kind: z.literal("sql").default("sql"),
        sqlDialect: SqlDialectSchema.optional(),
        schemaSql: z.string().optional(),
        seedSql: z.string().optional(),
        runtime: SqlRuntimeSchema.optional(),
        compareTo: z.enum(["solution", "expected_table"]).optional().default("solution"),
        expectedTable: SqlExpectedTableSchema.optional(),
        match: z.literal("table_exact").optional().default("table_exact"),
        ignoreRowOrder: z.boolean().optional().default(false),
        checkSql: z.string().optional(),
    })
    .superRefine((value: SqlExpectedTest, ctx) => {
        if ((value.compareTo ?? "solution") === "expected_table" && !value.expectedTable) {
            ctx.addIssue({
                code: "custom",
                path: ["expectedTable"],
                message: "expectedTable is required when compareTo is 'expected_table'.",
            });
        }
    });

export const SqlExpectedSchema = z
    .object({
        kind: z.literal("code_input"),
        language: z.literal("sql"),
        fixedSqlDialect: SqlDialectSchema.optional(),
        schemaSql: z.string().optional(),
        seedSql: z.string().optional(),
        runtime: SqlRuntimeSchema.optional(),
        tests: z.array(SqlExpectedTestSchema).min(1),
        solutionCode: z.string().optional(),
    })
    .transform((value): SqlExpected => makeSqlExpected(value as SqlExpectedInput))
    .superRefine((value: SqlExpected, ctx) => {
        const needsSolution = value.tests.some(
            (test) => (test.compareTo ?? "solution") === "solution",
        );

        if (needsSolution && !String(value.solutionCode ?? "").trim()) {
            ctx.addIssue({
                code: "custom",
                path: ["solutionCode"],
                message: "solutionCode is required when SQL tests compare to the solution.",
            });
        }
    });
