import { afterEach, describe, expect, it } from "vitest";
import { clearCodeRunner } from "@zoeskoul/curriculum-runtime";
import { clearSqlRunner, setSqlRunner } from "@zoeskoul/curriculum-runtime/sql";
import { validateGoldenTopicBundle } from "./validateGoldenTopicBundle.js";

describe("validateGoldenTopicBundle", () => {
    afterEach(() => {
        clearCodeRunner();
        clearSqlRunner();
    });

    it("validates SQL official solutions against the shared SQL contract", async () => {
        setSqlRunner(async () => ({
            ok: true,
            columns: ["id", "status"],
            rows: [[2, "inactive"]],
        }));

        const report = await validateGoldenTopicBundle({
            seed: { topicId: "sql-topic" } as any,
            draft: {} as any,
            topicBundle: {
                topicId: "sql-topic",
                subjectSlug: "sql",
                moduleSlug: "sql-1",
                sectionSlug: "sql-1-1",
                prefix: "topics.sql.sql-1.sql-topic",
                minutes: 10,
                topic: {
                    labelKey: "label",
                    summaryKey: "summary",
                },
                cards: [],
                sketches: [],
                exercises: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        messageBase: "quiz.code-1",
                        language: "sql",
                        fixedSqlDialect: "sqlite",
                        recipe: {
                            type: "sql_query",
                            datasetId: "inventory_ops",
                            solutionCode: "UPDATE inventory_items SET status = 'inactive' WHERE id = 2;",
                            checkSql: "SELECT id, status FROM inventory_items WHERE id = 2;",
                        },
                    },
                ],
            } as any,
        });

        expect(report.ok).toBe(true);
    });

    it("routes sql_query exercises through the local SQL checker when no shared runner is configured", async () => {
        const report = await validateGoldenTopicBundle({
            seed: {
                topicId: "sql-topic",
                subjectSlug: "sql-v2",
                courseSlug: "sql-foundations",
            } as any,
            draft: {} as any,
            topicBundle: {
                topicId: "sql-topic",
                subjectSlug: "sql-v2",
                moduleSlug: "sql-v2-0",
                sectionSlug: "sql-v2-0-1",
                prefix: "topics.sql.sql-v2-0.sql-topic",
                minutes: 10,
                topic: {
                    labelKey: "label",
                    summaryKey: "summary",
                },
                cards: [],
                sketches: [],
                exercises: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        messageBase: "quiz.code-1",
                        language: "sql",
                        fixedSqlDialect: "sqlite",
                        recipe: {
                            type: "sql_query",
                            datasetId: "students_intro",
                            solutionCode: "SELECT id, name FROM students;",
                        },
                    },
                ],
            } as any,
        });

        expect(report.ok).toBe(true);
    });

    it("inherits SQL datasetId from module runtime defaults during golden validation", async () => {
        const report = await validateGoldenTopicBundle({
            seed: {
                topicId: "sql-topic",
                subjectSlug: "sql-v2",
                courseSlug: "sql-foundations",
                moduleRuntimeDefaults: {
                    kind: "sql",
                    datasetId: "students_intro",
                    fixedSqlDialect: "sqlite",
                },
            } as any,
            draft: {} as any,
            topicBundle: {
                topicId: "sql-topic",
                subjectSlug: "sql-v2",
                moduleSlug: "sql-v2-0",
                sectionSlug: "sql-v2-0-1",
                prefix: "topics.sql.sql-v2-0.sql-topic",
                minutes: 10,
                topic: {
                    labelKey: "label",
                    summaryKey: "summary",
                },
                cards: [],
                sketches: [],
                exercises: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        messageBase: "quiz.code-1",
                        language: "sql",
                        fixedSqlDialect: "sqlite",
                        recipe: {
                            type: "sql_query",
                            solutionCode: "SELECT id, name FROM students;",
                        },
                    },
                ],
            } as any,
        });

        expect(report.ok).toBe(true);
    });

    it("accepts bash shell_task terminal workspace recipes through the shared expected builder", async () => {
        const report = await validateGoldenTopicBundle({
            seed: {
                topicId: "linux-topic",
                subjectSlug: "linux--linux-terminal-fundamentals--draft",
                courseSlug: "linux-terminal-fundamentals",
            } as any,
            draft: {} as any,
            topicBundle: {
                topicId: "linux-topic",
                subjectSlug: "linux--linux-terminal-fundamentals--draft",
                moduleSlug: "module1",
                sectionSlug: "terminal-basics",
                prefix: "topics.linux.module1.linux-topic",
                minutes: 10,
                topic: {
                    labelKey: "label",
                    summaryKey: "summary",
                },
                cards: [],
                sketches: [],
                exercises: [
                    {
                        id: "ci-create-navigation-lab",
                        kind: "code_input",
                        messageBase: "quiz.ci-create-navigation-lab",
                        language: "bash",
                        recipe: {
                            type: "shell_task",
                            mode: "terminal_workspace",
                        },
                        workspaceExpectations: {
                            requiredFolders: ["linux-lab"],
                            requiredFiles: ["linux-lab/notes/today.txt"],
                        },
                        terminalExpectations: {
                            requiredCommands: [{ pattern: "^pwd$" }],
                            outputContains: ["/workspace"],
                        },
                    },
                ],
            } as any,
        });

        expect(report.ok).toBe(true);
    });


    it("validates reporting-course SQL against the dedicated sales_reporting dataset", async () => {
        const report = await validateGoldenTopicBundle({
            seed: {
                topicId: "reporting-topic",
                subjectSlug: "sql--sql-analysis-reporting--draft",
                courseSlug: "sql-analysis-reporting",
                moduleRuntimeDefaults: {
                    kind: "sql",
                    datasetId: "sales_reporting",
                    fixedSqlDialect: "sqlite",
                },
            } as any,
            draft: {} as any,
            topicBundle: {
                topicId: "reporting-topic",
                subjectSlug: "sql--sql-analysis-reporting--draft",
                moduleSlug: "sql-analysis-reporting-module-0-report-foundations",
                sectionSlug: "sql-analysis-reporting-section-0-readable-output",
                prefix: "topics.sql.reporting-topic",
                minutes: 10,
                runtimeDefaults: {
                    kind: "sql",
                    datasetId: "sales_reporting",
                    fixedSqlDialect: "sqlite",
                },
                topic: {
                    labelKey: "label",
                    summaryKey: "summary",
                },
                cards: [],
                sketches: [],
                exercises: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        messageBase: "quiz.code-1",
                        language: "sql",
                        fixedSqlDialect: "sqlite",
                        runtime: {
                            kind: "sql",
                            datasetId: "sales_reporting",
                            fixedSqlDialect: "sqlite",
                        },
                        recipe: {
                            type: "sql_query",
                            datasetId: "sales_reporting",
                            solutionCode:
                                "SELECT order_id, product_name FROM sales_reporting ORDER BY order_id LIMIT 1;",
                        },
                    },
                ],
            } as any,
        });

        expect(report.ok).toBe(true);
    });

    it("rejects a reporting-table solution when it is bound to legacy sales_kpi", async () => {
        const report = await validateGoldenTopicBundle({
            seed: {
                topicId: "reporting-topic",
                subjectSlug: "sql--sql-analysis-reporting--draft",
                courseSlug: "sql-analysis-reporting",
                moduleRuntimeDefaults: {
                    kind: "sql",
                    datasetId: "sales_kpi",
                    fixedSqlDialect: "sqlite",
                },
            } as any,
            draft: {} as any,
            topicBundle: {
                topicId: "reporting-topic",
                subjectSlug: "sql--sql-analysis-reporting--draft",
                moduleSlug: "sql-analysis-reporting-module-0-report-foundations",
                sectionSlug: "sql-analysis-reporting-section-0-readable-output",
                prefix: "topics.sql.reporting-topic",
                minutes: 10,
                runtimeDefaults: {
                    kind: "sql",
                    datasetId: "sales_kpi",
                    fixedSqlDialect: "sqlite",
                },
                topic: {
                    labelKey: "label",
                    summaryKey: "summary",
                },
                cards: [],
                sketches: [],
                exercises: [
                    {
                        id: "code-1",
                        kind: "code_input",
                        messageBase: "quiz.code-1",
                        language: "sql",
                        fixedSqlDialect: "sqlite",
                        recipe: {
                            type: "sql_query",
                            datasetId: "sales_kpi",
                            solutionCode:
                                "SELECT order_id FROM sales_reporting LIMIT 1;",
                        },
                    },
                ],
            } as any,
        });

        expect(report.ok).toBe(false);
        expect(report.issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: "GOLDEN_SQL_SOLUTION_MISMATCH",
                    exerciseId: "code-1",
                }),
            ]),
        );
    });

});
