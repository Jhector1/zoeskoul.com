import { expect, test, type Page } from "@playwright/test";

const REVIEW_CLONE_PRACTICE_URL =
    "/en/dev/e2e/review-module-clone/python/e2e-review-clone/learn/e2e-section/e2e-review-topic/quiz/review-clone-practice-quiz";

function makePracticeResponse(key: string) {
    return {
        key,
        sessionId: "e2e-expired-key-session",
        exercise: {
            id: "e2e-expired-key-code-input",
            kind: "code_input",
            title: "Expired key practice fixture",
            prompt: "Run the starter code.",
            language: "python",
            starterCode: "print('hello from clone practice')\n",
            starterStdin: "",
            examples: [
                {
                    stdout: "hello from clone practice\n",
                },
            ],
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

async function mockClonePracticeQuiz(page: Page) {
    await page.route(
        (url) => url.pathname === "/api/review/quiz",
        async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    quizKey: "e2e-review-clone-practice-quiz-key",
                    questions: [
                        {
                            kind: "practice",
                            id: "e2e-expired-key-practice-question",
                            prompt: "Practice key refresh fixture",
                            fetch: {
                                subject: "python",
                                module: "e2e-review-clone",
                                section: "e2e-section",
                                topic: "e2e-review-topic",
                                difficulty: "easy",
                                allowReveal: true,
                                preferKind: "code_input",
                                exerciseKey: "e2e-expired-key-code-input",
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

test.describe("review clone practice signed-key refresh", () => {
    test("expired validate key is hidden and refreshes the clone practice item", async ({ page }) => {
        let practiceFetchCalls = 0;
        let validateCalls = 0;

        await mockClonePracticeQuiz(page);

        await page.route(
            (url) => url.pathname === "/api/practice",
            async (route) => {
                practiceFetchCalls += 1;

                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify(makePracticeResponse(`e2e-practice-key-${practiceFetchCalls}`)),
                });
            },
        );

        await page.route(
            (url) => url.pathname === "/api/practice/validate",
            async (route) => {
                validateCalls += 1;

                if (validateCalls === 1) {
                    await route.fulfill({
                        status: 401,
                        contentType: "application/json",
                        body: JSON.stringify({
                            message: "Invalid or expired key.",
                        }),
                    });
                    return;
                }

                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({
                        ok: true,
                        finalized: true,
                        attempts: {
                            used: 1,
                            max: 3,
                        },
                    }),
                });
            },
        );

        await page.goto(REVIEW_CLONE_PRACTICE_URL);
        await waitForClonePracticeCard(page);

        const beforeRefreshCount = practiceFetchCalls;

        await page.getByRole("button", { name: /Check this answer/i }).click();

        await expect
            .poll(
                () => practiceFetchCalls,
                {
                    timeout: 15_000,
                    message: "practice item should refresh after expired validate key",
                },
            )
            .toBeGreaterThan(beforeRefreshCount);

        await expect(page.getByText(/Invalid or expired key/i)).toHaveCount(0);
        await expect(page.getByRole("button", { name: /Check this answer/i })).toBeVisible();
    });

    test("expired help key is hidden and refreshes the clone practice item", async ({ page }) => {
        let practiceFetchCalls = 0;
        let helpCalls = 0;

        await mockClonePracticeQuiz(page);

        await page.route(
            (url) => url.pathname === "/api/practice",
            async (route) => {
                practiceFetchCalls += 1;

                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify(makePracticeResponse(`e2e-practice-key-${practiceFetchCalls}`)),
                });
            },
        );

        await page.route(
            (url) => url.pathname === "/api/practice/help",
            async (route) => {
                helpCalls += 1;

                if (helpCalls === 1) {
                    await route.fulfill({
                        status: 401,
                        contentType: "application/json",
                        body: JSON.stringify({
                            message: "Invalid or expired key.",
                        }),
                    });
                    return;
                }

                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({
                        stepKey: "hint",
                        step: {
                            key: "hint",
                            label: "Hint",
                            kind: "text",
                        },
                        source: "mock",
                        content: "This is a refreshed clone-practice hint.",
                    }),
                });
            },
        );

        await page.goto(REVIEW_CLONE_PRACTICE_URL);
        await waitForClonePracticeCard(page);

        const beforeRefreshCount = practiceFetchCalls;

        const hintButton = page
            .getByRole("button", { name: /Need a hint\?|Hint|Help/i })
            .first();

        await expect(hintButton).toBeVisible({
            timeout: 30_000,
        });

        await hintButton.click();

        await expect
            .poll(
                () => practiceFetchCalls,
                {
                    timeout: 15_000,
                    message: "practice item should refresh after expired help key",
                },
            )
            .toBeGreaterThan(beforeRefreshCount);

        await expect(page.getByText(/Invalid or expired key/i)).toHaveCount(0);
    });
});