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
});
