import { expect, test, type Page } from "@playwright/test";

const REVIEW_CLONE_PRACTICE_URL =
    "/en/dev/e2e/review-module-clone/python/e2e-review-clone/learn/e2e-section/e2e-review-topic/quiz/review-clone-practice-quiz";

function makePracticeResponse(key: string) {
    return {
        key,
        sessionId: "e2e-validate-401-diagnostic-session",
        exercise: {
            id: "e2e-validate-401-diagnostic-code-input",
            kind: "code_input",
            title: "Validate 401 diagnostic fixture",
            prompt: "Run the starter code.",
            language: "python",
            starterCode: "print('hello from validate diagnostic')\n",
            starterStdin: "",
            examples: [
                {
                    stdout: "hello from validate diagnostic\n",
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
                    quizKey: "e2e-review-clone-validate-diagnostic-quiz-key",
                    questions: [
                        {
                            kind: "practice",
                            id: "e2e-validate-401-diagnostic-practice-question",
                            prompt: "Practice validate key diagnostic fixture",
                            fetch: {
                                subject: "python",
                                module: "e2e-review-clone",
                                section: "e2e-section",
                                topic: "e2e-review-topic",
                                difficulty: "easy",
                                allowReveal: true,
                                preferKind: "code_input",
                                exerciseKey: "e2e-validate-401-diagnostic-code-input",
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

async function fillVisiblePracticeAnswer(page: Page) {
    await page.mouse.click(500, 500);
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await page.keyboard.type("print('hello from validate diagnostic')");
}

test.describe("practice validate 401 diagnostic", () => {
    test("expired validate key refreshes and next validate uses the new key, not the stale key", async ({ page }) => {
        let practiceFetchCalls = 0;
        let validateCalls = 0;

        const validateKeys: string[] = [];
        const validateStatuses: number[] = [];
        const validateBodies: any[] = [];

        await mockClonePracticeQuiz(page);

        /**
         * Important:
         * Match ONLY /api/practice, not /api/practice/validate or /api/practice/help.
         */
        await page.route(
            (url) => url.pathname === "/api/practice",
            async (route) => {
                practiceFetchCalls += 1;

                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify(
                        makePracticeResponse(`e2e-practice-key-${practiceFetchCalls}`),
                    ),
                });
            },
        );

        await page.route(
            (url) => url.pathname === "/api/practice/validate",
            async (route) => {
                validateCalls += 1;

                const postData = route.request().postDataJSON() as {
                    key?: string;
                    answer?: unknown;
                    reveal?: boolean;
                };

                const key = String(postData?.key ?? "");
                validateKeys.push(key);

                /**
                 * Simulate the real bug report:
                 * the first submit hits a stale/expired key.
                 */
                if (validateCalls === 1) {
                    validateStatuses.push(401);
                    validateBodies.push({ message: "Invalid or expired key." });

                    await route.fulfill({
                        status: 401,
                        contentType: "application/json",
                        body: JSON.stringify({
                            message: "Invalid or expired key.",
                        }),
                    });
                    return;
                }

                /**
                 * The second submit must use the refreshed practice key.
                 * If it still uses key-1, this test fails with a root-cause message.
                 */
                const staleKey = "e2e-practice-key-1";

                if (key === staleKey) {
                    validateStatuses.push(401);
                    validateBodies.push({
                        message: "Stale key reused after refresh.",
                        staleKey,
                        actualKey: key,
                        validateKeys,
                        practiceFetchCalls,
                    });

                    await route.fulfill({
                        status: 401,
                        contentType: "application/json",
                        body: JSON.stringify({
                            message: "Stale key reused after refresh.",
                            staleKey,
                            actualKey: key,
                            validateKeys,
                            practiceFetchCalls,
                        }),
                    });
                    return;
                }

                validateStatuses.push(200);
                validateBodies.push({ ok: true });

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
                        feedback: {
                            message: "Correct.",
                        },
                    }),
                });
            },
        );

        await page.goto(REVIEW_CLONE_PRACTICE_URL);
        await waitForClonePracticeCard(page);

        await expect
            .poll(
                () => practiceFetchCalls,
                {
                    timeout: 15_000,
                    message: "practice card should load an initial practice item",
                },
            )
            .toBeGreaterThanOrEqual(1);

        /**
         * First submit: should get 401, hide the scary learner-facing message,
         * and force-refresh the practice item.
         */
        await fillVisiblePracticeAnswer(page);
        await page.getByRole("button", { name: /Check this answer/i }).click();

        await expect
            .poll(
                () => validateCalls,
                {
                    timeout: 15_000,
                    message: "first validate request should be sent",
                },
            )
            .toBeGreaterThanOrEqual(1);

        await expect
            .poll(
                () => practiceFetchCalls,
                {
                    timeout: 15_000,
                    message: "expired validate key should force-refresh the practice item",
                },
            )
            .toBeGreaterThanOrEqual(2);

        await expect(page.getByText(/Invalid or expired key/i)).toHaveCount(0);

        /**
         * Second submit: must use the newly refreshed key.
         */
        await expect(page.getByRole("button", { name: /Check this answer/i })).toBeVisible({
            timeout: 15_000,
        });

        await fillVisiblePracticeAnswer(page);
        await page.getByRole("button", { name: /Check this answer/i }).click();

        await expect
            .poll(
                () => validateCalls,
                {
                    timeout: 15_000,
                    message: "second validate request should be sent after refresh",
                },
            )
            .toBeGreaterThanOrEqual(2);

        const observed = {
            validateKeys,
            validateStatuses,
            validateBodies,
            practiceFetchCalls,
        };

        expect(
            observed,
            "After an expired key refresh, the next submit must use the new practice key, not the stale one.",
        ).toEqual(expect.any(Object));

        expect(observed.validateKeys[0]).toBe("e2e-practice-key-1");
        expect(observed.validateStatuses[0]).toBe(401);
        expect(observed.validateKeys.at(-1)).toBeTruthy();
        expect(observed.validateKeys.at(-1)).not.toBe("e2e-practice-key-1");
        expect(observed.validateStatuses.at(-1)).toBe(200);

        await expect(page.getByText(/Invalid or expired key/i)).toHaveCount(0);
        await expect(page.getByText(/Stale key reused after refresh/i)).toHaveCount(0);
    });
});