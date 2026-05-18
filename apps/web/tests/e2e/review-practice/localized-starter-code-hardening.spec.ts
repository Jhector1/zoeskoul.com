import { expect, test, type Page } from "@playwright/test";

const REVIEW_CLONE_PRACTICE_URL =
    "/en/dev/e2e/review-module-clone/python/e2e-review-clone/learn/e2e-section/e2e-review-topic/quiz/review-clone-practice-quiz";

type PracticeFixtureArgs = {
    id: string;
    language: "sql" | "python";
    starterCode: string;
    prompt?: string;
    title?: string;
};

function makePracticeResponse(args: PracticeFixtureArgs) {
    return {
        key: `e2e-localized-starter-key-${args.id}`,
        sessionId: `e2e-localized-starter-session-${args.id}`,
        exercise: {
            id: args.id,
            kind: "code_input",
            title: args.title ?? "Localized starter code fixture",
            prompt: args.prompt ?? "Use the starter code in the editor.",
            language: args.language,
            starterCode: args.starterCode,
            starterStdin: "",
            examples:
                args.language === "sql"
                    ? []
                    : [
                        {
                            stdout: "hello\n",
                        },
                    ],
            runtime:
                args.language === "sql"
                    ? {
                        kind: "sql",
                        datasetId: "products_catalog",
                        resultShape: "table",
                    }
                    : {
                        kind: "code",
                        language: "python",
                    },
            fixedSqlDialect: args.language === "sql" ? "sqlite" : undefined,
        },
        run: {
            maxAttempts: 3,
            allowReveal: true,
            help: {
                stepKeys: ["hint"],
            },
        },
    };
}






async function mockClonePracticeQuiz(page: Page, exerciseKey: string) {
    await page.route(
        (url) => url.pathname === "/api/review/quiz",
        async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    quizKey: `e2e-localized-starter-quiz-${exerciseKey}`,
                    questions: [
                        {
                            kind: "practice",
                            id: `question-${exerciseKey}`,
                            prompt: "Localized starter browser fixture",
                            fetch: {
                                subject: "python",
                                module: "e2e-review-clone",
                                section: "e2e-section",
                                topic: "e2e-review-topic",
                                difficulty: "easy",
                                allowReveal: true,
                                preferKind: "code_input",
                                exerciseKey,
                            },
                            maxAttempts: 3,
                        },
                    ],
                }),
            });
        },
    );
}

async function waitForClonePracticeCard(page: Page) {
    await expect(page.getByText(/Review Clone Practice Key Refresh/i)).toBeVisible({
        timeout: 30_000,
    });

    await expect(page.getByRole("button", { name: /Check this answer/i })).toBeVisible({
        timeout: 30_000,
    });
}
async function mockPracticeResponse(page: Page, args: PracticeFixtureArgs) {
    await page.route(
        (url) => url.pathname === "/api/practice",
        async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(makePracticeResponse(args)),
            });
        },
    );
}

async function waitForToolsEditor(page: Page) {
    await expect(page.locator("body")).toContainText(/Tools/i, {
        timeout: 30_000,
    });

    await expect(page.locator("body")).toContainText(/Run/i, {
        timeout: 30_000,
    });
}

test.describe("review practice localized starter code hardening", () => {
    test("SQL tagged starterCode from locale resolves into query.sql before editor render", async ({ page }) => {
        const exerciseKey = "e2e-sql-localized-starter";

        await mockClonePracticeQuiz(page, exerciseKey);

        await page.route(
            (url) => url.pathname === "/api/practice",
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify(
                        makePracticeResponse({
                            id: exerciseKey,
                            language: "sql",
                            /**
                             * This key exists in the SQL locale messages and should resolve to:
                             * "-- Return only product names\n"
                             */
                            starterCode:
                                "@:quiz.m1_s04_query_one_column_name.starterCode",
                            title: "@:quiz.m1_s04_query_one_column_name.title",
                            prompt: "@:quiz.m1_s04_query_one_column_name.prompt",
                        }),
                    ),
                });
            },
        );

        await page.goto(REVIEW_CLONE_PRACTICE_URL);
        await waitForClonePracticeCard(page);
        await waitForToolsEditor(page);

        await expect(page.locator("body")).toContainText("-- Return only product names", {
            timeout: 30_000,
        });

        await expect(page.locator("body")).not.toContainText(
            "@:quiz.m1_s04_query_one_column_name.starterCode",
        );

        await expect(page.locator("body")).not.toContainText("@:");
    });

    test("localized SQL starter comment survives sidebar navigation and return", async ({ page }) => {
        const exerciseKey = "e2e-sql-localized-starter-navigation";

        await mockClonePracticeQuiz(page, exerciseKey);

        await page.route(
            (url) => url.pathname === "/api/practice",
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify(
                        makePracticeResponse({
                            id: exerciseKey,
                            language: "sql",
                            starterCode:
                                "@:quiz.m1_s04_query_one_column_name.starterCode",
                        }),
                    ),
                });
            },
        );

        await page.goto(REVIEW_CLONE_PRACTICE_URL);
        await waitForClonePracticeCard(page);

        await expect(page.locator("body")).toContainText("-- Return only product names", {
            timeout: 30_000,
        });

        /**
         * Navigate to a nearby clone topic/card and return. The editor should not
         * become blank and should not show the raw @: key after remount/hydration.
         */
        await page.getByRole("button", { name: /Topics/i }).click().catch(() => {});
        await page.getByText(/Read before coding/i).click().catch(() => {});
        await page.goto(REVIEW_CLONE_PRACTICE_URL);
        await waitForClonePracticeCard(page);

        await expect(page.locator("body")).toContainText("-- Return only product names", {
            timeout: 30_000,
        });

        await expect(page.locator("body")).not.toContainText(
            "@:quiz.m1_s04_query_one_column_name.starterCode",
        );
    });
    test("SQL starter does not inherit stale Python practice workspace", async ({ page }) => {
        const pythonExerciseKey = "e2e-explicit-python-before-sql";
        const sqlExerciseKey = "e2e-sql-after-python-workspace-isolation";

        await mockClonePracticeQuiz(page, pythonExerciseKey);
        await mockPracticeResponse(page, {
            id: pythonExerciseKey,
            language: "python",
            starterCode: '# Python starter before SQL\nprint("Hello Python!")\n',
        });

        await page.goto(REVIEW_CLONE_PRACTICE_URL);
        await waitForClonePracticeCard(page);

        await expect(page.locator("body")).toContainText("# Python starter before SQL", {
            timeout: 30_000,
        });

        await expect(page.locator("body")).toContainText('print("Hello Python!")', {
            timeout: 30_000,
        });

        await page.unrouteAll({ behavior: "ignoreErrors" });

        await mockClonePracticeQuiz(page, sqlExerciseKey);
        await mockPracticeResponse(page, {
            id: sqlExerciseKey,
            language: "sql",
            starterCode: "@:quiz.m1_s04_query_one_column_name.starterCode",
        });

        await page.goto(REVIEW_CLONE_PRACTICE_URL);
        await waitForClonePracticeCard(page);

        await expect(page.locator("body")).toContainText("Language: sql", {
            timeout: 30_000,
        });

        await expect(page.locator("body")).toContainText("query.sql", {
            timeout: 30_000,
        });

        await expect(page.locator("body")).toContainText("-- Return only product names", {
            timeout: 30_000,
        });

        await expect(page.locator("body")).not.toContainText("# Python starter before SQL");
        await expect(page.locator("body")).not.toContainText("main.py");
    });
    // test("non-user saved SQL workspace does not override starterCode", async ({ page }) => {
    //     await seedReviewProgress(page, {
    //         practiceItemPatch: {
    //             "e2e-sql-localized-starter": {
    //                 code: "1",
    //                 source: "1",
    //                 language: "sql",
    //                 userEdited: false,
    //                 workspaceOrigin: "runtime",
    //                 workspace: {
    //                     language: "sql",
    //                     files: {
    //                         "query.sql": {
    //                             path: "query.sql",
    //                             content: "1",
    //                         },
    //                     },
    //                     activeFile: "query.sql",
    //                 },
    //             },
    //         },
    //     });
    //
    //     await page.goto(SQL_LOCALIZED_STARTER_URL);
    //     await waitForClonePracticeCard(page);
    //
    //     await expect(page.locator("body")).toContainText("-- Return only product names");
    //     await expect(page.locator("body")).not.toContainText("SQL · query.sqlDarkSQLSQLiteResetRun1");
    // });
    // test("user-edited SQL workspace still restores over starterCode", async ({ page }) => {
    //     await seedReviewProgress(page, {
    //         practiceItemPatch: {
    //             "e2e-sql-localized-starter": {
    //                 code: "-- my saved query\nSELECT name FROM products;",
    //                 source: "-- my saved query\nSELECT name FROM products;",
    //                 language: "sql",
    //                 userEdited: true,
    //                 workspaceOrigin: "saved",
    //                 workspace: {
    //                     language: "sql",
    //                     files: {
    //                         "query.sql": {
    //                             path: "query.sql",
    //                             content: "-- my saved query\nSELECT name FROM products;",
    //                         },
    //                     },
    //                     activeFile: "query.sql",
    //                 },
    //             },
    //         },
    //     });
    //
    //     await page.goto(SQL_LOCALIZED_STARTER_URL);
    //     await waitForClonePracticeCard(page);
    //
    //     await expect(page.locator("body")).toContainText("-- my saved query");
    //     await expect(page.locator("body")).toContainText("SELECT name FROM products");
    // });
    test("desktop Topics button does not hide sidebar when already open", async ({ page }) => {
        const exerciseKey = "e2e-topics-button-sidebar-idempotent";

        await mockClonePracticeQuiz(page, exerciseKey);
        await mockPracticeResponse(page, {
            id: exerciseKey,
            language: "sql",
            starterCode: "@:quiz.m1_s04_query_one_column_name.starterCode",
        });

        await page.goto(REVIEW_CLONE_PRACTICE_URL);
        await waitForClonePracticeCard(page);

        await page.getByRole("button", { name: /Topics/i }).click();

        await expect(page.getByText(/Read before coding/i)).toBeVisible({
            timeout: 10_000,
        });

        await expect(page.locator("body")).toContainText("-- Return only product names", {
            timeout: 30_000,
        });
    });
    test("unknown unresolved starterCode tag does not render as executable editor text", async ({ page }) => {
        const exerciseKey = "e2e-unknown-tag-starter";

        await mockClonePracticeQuiz(page, exerciseKey);

        await page.route(
            (url) => url.pathname === "/api/practice",
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify(
                        makePracticeResponse({
                            id: exerciseKey,
                            language: "sql",
                            starterCode:
                                "@:quiz.this_key_should_not_exist_for_runtime.starterCode",
                        }),
                    ),
                });
            },
        );

        await page.goto(REVIEW_CLONE_PRACTICE_URL);
        await waitForClonePracticeCard(page);
        await waitForToolsEditor(page);

        await expect(page.locator("body")).not.toContainText(
            "@:quiz.this_key_should_not_exist_for_runtime.starterCode",
        );

        await expect(page.locator("body")).not.toContainText("@:");
    });

    test("explicit real SQL starterCode still renders without needing i18n", async ({ page }) => {
        const exerciseKey = "e2e-explicit-sql-starter";

        await mockClonePracticeQuiz(page, exerciseKey);

        await page.route(
            (url) => url.pathname === "/api/practice",
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify(
                        makePracticeResponse({
                            id: exerciseKey,
                            language: "sql",
                            starterCode:
                                "-- Explicit SQL starter\nSELECT name FROM products;\n",
                        }),
                    ),
                });
            },
        );

        await page.goto(REVIEW_CLONE_PRACTICE_URL);
        await waitForClonePracticeCard(page);

        await expect(page.locator("body")).toContainText("-- Explicit SQL starter", {
            timeout: 30_000,
        });

        await expect(page.locator("body")).toContainText("SELECT name FROM products", {
            timeout: 30_000,
        });

        await expect(page.locator("body")).not.toContainText("@:");
    });

    test("explicit real Python starterCode still follows the same contract", async ({ page }) => {
        const exerciseKey = "e2e-explicit-python-starter";

        await mockClonePracticeQuiz(page, exerciseKey);

        await page.route(
            (url) => url.pathname === "/api/practice",
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify(
                        makePracticeResponse({
                            id: exerciseKey,
                            language: "python",
                            starterCode:
                                "# Explicit Python starter\nprint('hello')\n",
                        }),
                    ),
                });
            },
        );

        await page.goto(REVIEW_CLONE_PRACTICE_URL);
        await waitForClonePracticeCard(page);

        await expect(page.locator("body")).toContainText("# Explicit Python starter", {
            timeout: 30_000,
        });

        await expect(page.locator("body")).toContainText("print('hello')", {
            timeout: 30_000,
        });

        await expect(page.locator("body")).not.toContainText("@:");
    });
});
