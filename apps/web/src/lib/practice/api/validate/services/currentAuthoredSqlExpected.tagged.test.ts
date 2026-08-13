import {
    describe,
    expect,
    it,
} from "vitest";

import {
    buildCurrentAuthoredSqlExpectedFromExercise,
    resolveCurrentAuthoredSqlExpected,
} from "./currentAuthoredSqlExpected.service";

describe(
    "current authored SQL canonical message resolution",
    () => {
        it(
            "refuses to build runnable SQL from an unresolved message reference",
            () => {
                const expected =
                    buildCurrentAuthoredSqlExpectedFromExercise({
                        kind: "code_input",
                        fixedSqlDialect: "sqlite",
                        recipe: {
                            type: "sql_query",
                            datasetId:
                                "products_catalog",
                            resultShape:
                                "table",
                            solutionCode:
                                "@:topics.sql-v2.sql-v2-1.what_select_does.quiz.try-what_select_does-sketch0.solutionCode",
                        },
                    });

                expect(expected).toBeNull();
            },
        );

        it(
            "materializes canonical message-backed SQL without Next Intl request context",
            async () => {
                const expected =
                    await resolveCurrentAuthoredSqlExpected({
                        kind: "code_input",
                        exerciseKey:
                            "try-what_select_does-sketch0",
                        publicPayload: {
                            language: "sql",
                            topic:
                                "what_select_does",
                            runtime: {
                                kind: "sql",
                            },
                        },
                        topic: {
                            slug:
                                "what_select_does",
                            subject: {
                                slug: "sql-v2",
                            },
                            module: {
                                subject: {
                                    slug:
                                        "sql-v2",
                                },
                            },
                        },
                    } as any);

                expect(expected).not.toBeNull();

                const solution = String(
                    (expected as any)
                        ?.solutionCode ?? "",
                );

                expect(solution).toContain(
                    "SELECT",
                );

                expect(solution).toContain(
                    "category",
                );

                expect(solution).toContain(
                    "stock",
                );

                expect(solution).toContain(
                    "created_at",
                );

                expect(solution).toContain(
                    "FROM products",
                );

                expect(solution).not.toMatch(
                    /^@:/,
                );
            },
        );
    },
);
