import { expect, test, type Locator, type Page } from "@playwright/test";

// Zoeskoul E2E suite pruning: this file is opt-in.
test.skip(process.env.RUN_E2E_LEGACY !== "1", "Legacy broad E2E suite is opt-in. Run with RUN_E2E_LEGACY=1 or pnpm test:e2e:legacy.");


const REAL_EXERCISE_URL =
    "/en/catalog/python/subjects/python-v2/modules/python-v2-3/learn/python-v2-3-while-loops/loop-debugging/exercise/loop-debug-code-3?e2eUnlockAll=1";

const STARTER_MARKER = "# TODO: print 3, 2, 1 using a while loop";

const SOLVED_CODE = [
    "n = 3",
    "while n >= 1:",
    "    print(n)",
    "    n = n - 1",
].join("\n");

const SOLVED_MARKER = "while n >= 1:";

const LOOP_DEBUG_FIXTURES = {
    "loop-debug-code-3": {
        title: "Print 3, 2, 1",
        starterCode: `${STARTER_MARKER}\nn = 3\n`,
        solutionCode: `${SOLVED_CODE}\n`,
        expectedOutput: "3\n2\n1\n",
        workspace: {
            language: "python",
            entryFilePath: "main.py",
            starterCode: `${STARTER_MARKER}\nn = 3\n`,
            starterFiles: [
                {
                    path: "main.py",
                    content: `${STARTER_MARKER}\nn = 3\n`,
                    language: "python",
                    isEntry: true,
                    entry: true,
                },
            ],
        },
    },
    "loop-debug-code-4": {
        title: "Print word three times",
        starterCode: "word = input()\n# TODO: print word exactly 3 times using a while loop\n",
        solutionCode: "word = input()\nn = 0\nwhile n < 3:\n    print(word)\n    n = n + 1\n",
        expectedOutput: "hi\nhi\nhi\n",
        workspace: {
            language: "python",
            entryFilePath: "main.py",
            starterCode: "word = input()\n# TODO: print word exactly 3 times using a while loop\n",
            starterFiles: [
                {
                    path: "main.py",
                    content: "word = input()\n# TODO: print word exactly 3 times using a while loop\n",
                    language: "python",
                    isEntry: true,
                    entry: true,
                },
            ],
        },
    },
} as const;

function getEditorInputs(page: Page): Locator {
    return page.locator('[data-testid="code-editor-e2e-input"]:visible');
}

function getToolsEditorInput(page: Page): Locator {
    return getEditorInputs(page).first();
}

async function readToolsEditor(page: Page): Promise<string> {
    const editor = getToolsEditorInput(page);
    await expect(editor).toBeAttached({ timeout: 30_000 });
    return editor.inputValue();
}

async function expectToolsEditorToContain(
    page: Page,
    expected: string,
    timeout = 30_000,
) {
    await expect
        .poll(() => readToolsEditor(page), { timeout })
        .toContain(expected);
}

async function expectToolsEditorNotToContain(
    page: Page,
    unexpected: string,
    timeout = 30_000,
) {
    await expect
        .poll(() => readToolsEditor(page), { timeout })
        .not.toContain(unexpected);
}

async function expectToolsEditorNotBlank(page: Page, timeout = 30_000) {
    await expect
        .poll(async () => (await readToolsEditor(page)).trim(), { timeout })
        .not.toBe("");
}

function collectSubmittedSource(value: unknown): string {
    const seen = new Set<unknown>();
    const parts: string[] = [];

    function visit(node: unknown) {
        if (!node || typeof node !== "object") return;
        if (seen.has(node)) return;
        seen.add(node);

        if (Array.isArray(node)) {
            for (const item of node) visit(item);
            return;
        }

        const record = node as Record<string, unknown>;

        for (const key of ["code", "source", "content"]) {
            if (typeof record[key] === "string") {
                parts.push(record[key] as string);
            }
        }

        if (Array.isArray(record.files)) {
            for (const file of record.files) {
                if (
                    file &&
                    typeof file === "object" &&
                    typeof (file as Record<string, unknown>).content === "string"
                ) {
                    parts.push(String((file as Record<string, unknown>).content));
                }
            }
        }

        for (const item of Object.values(record)) {
            visit(item);
        }
    }

    visit(value);
    return parts.join("\n");
}

async function installStableChromeMocks(page: Page) {
    await page.route("**/api/gamification/me**", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                summary: {
                    totalXp: 0,
                    level: 1,
                    currentStreak: 0,
                    levelProgressPct: 0,
                },
            }),
        });
    });

    await page.route("**/api/review/module-nav**", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                prevModuleId: null,
                nextModuleId: null,
                nextLocked: false,
                nextBillingHref: null,
                index: 1,
                total: 1,
            }),
        });
    });

    await page.route("**/api/review/subject-finish**", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                status: "in_progress",
                certificateReady: false,
                certificateIssued: false,
            }),
        });
    });

    await page.route("**/api/tools/doc**", async (route) => {
        const request = route.request();

        if (request.method() === "GET") {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ doc: null }),
            });
            return;
        }

        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true }),
        });
    });
}

async function installIsolatedReviewProgress(page: Page) {
    let savedProgress: unknown = { progress: null };

    await page.route("**/api/review/progress**", async (route) => {
        const request = route.request();

        if (request.method() === "GET") {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(savedProgress),
            });
            return;
        }

        if (request.method() === "PUT") {
            const body = request.postDataJSON();
            savedProgress = {
                progress: body.state,
            };

            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    ok: true,
                    state: body.state,
                }),
            });
            return;
        }

        await route.fallback();
    });
}

async function installPracticeMocks(page: Page) {
    await page.route(
        (url) => url.pathname === "/api/review/quiz",
        async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    quizKey: "loop-debugging-project-e2e",
                    questions: [
                        {
                            kind: "practice",
                            id: "proj:loop-debug-code-3:e2e",
                            title: LOOP_DEBUG_FIXTURES["loop-debug-code-3"].title,
                            fetch: {
                                subject: "python",
                                module: "python-v2-3",
                                section: "python-v2-3-while-loops",
                                topic: "loop-debugging",
                                difficulty: "easy",
                                allowReveal: true,
                                preferPurpose: "project",
                                preferKind: "code_input",
                                exerciseKey: "loop-debug-code-3",
                                seedPolicy: "global",
                            },
                            maxAttempts: 10,
                        },
                        {
                            kind: "practice",
                            id: "proj:loop-debug-code-4:e2e",
                            title: LOOP_DEBUG_FIXTURES["loop-debug-code-4"].title,
                            fetch: {
                                subject: "python",
                                module: "python-v2-3",
                                section: "python-v2-3-while-loops",
                                topic: "loop-debugging",
                                difficulty: "easy",
                                allowReveal: true,
                                preferPurpose: "project",
                                preferKind: "code_input",
                                exerciseKey: "loop-debug-code-4",
                                seedPolicy: "global",
                            },
                            maxAttempts: 10,
                        },
                    ],
                }),
            });
        },
    );

    await page.route(
        (url) => url.pathname === "/api/practice",
        async (route) => {
            const request = route.request();
            const url = new URL(request.url());
            const exerciseKey =
                url.searchParams.get("exerciseKey") ??
                url.searchParams.get("key") ??
                "loop-debug-code-3";

            const fixture =
                LOOP_DEBUG_FIXTURES[
                    exerciseKey as keyof typeof LOOP_DEBUG_FIXTURES
                    ] ?? LOOP_DEBUG_FIXTURES["loop-debug-code-3"];

            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    key: `practice-${exerciseKey}`,
                    sessionId: `practice-session-${exerciseKey}`,
                    exercise: {
                        id: exerciseKey,
                        exerciseKey,
                        kind: "code_input",
                        title: fixture.title,
                        prompt: fixture.title,
                        language: "python",
                        runtime: {
                            kind: "code",
                            language: "python",
                        },
                        workspace: fixture.workspace,
                        starterCode: fixture.starterCode,
                        solutionCode: fixture.solutionCode,
                    },
                    run: {
                        maxAttempts: 10,
                        allowReveal: true,
                        help: {
                            stepKeys: ["concept", "hint_1", "hint_2", "reveal"],
                        },
                    },
                }),
            });
        },
    );

    await page.route("**/api/practice/validate", async (route) => {
        const request = route.request();

        if (request.method() !== "POST") {
            await route.fallback();
            return;
        }

        const body = request.postDataJSON();
        const submittedSource = collectSubmittedSource(body);
        const ok =
            submittedSource.includes("while n >= 1") &&
            submittedSource.includes("n = n - 1");

            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    ok,
                    expected: null,
                    finalized: ok,
                    explanation: ok ? "Correct." : "Expected a countdown loop.",
                    attempts: {
                    used: 1,
                    max: 10,
                    left: ok ? 9 : 9,
                },
            }),
        });
    });
}

async function gotoRealExercise(page: Page) {
    await page.goto(REAL_EXERCISE_URL, {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
    });

    await expect(page).toHaveURL(/\/exercise\/(?:loop-debug-code-3|loop-debug-code-4)(?:\?.*)?$/, {
        timeout: 30_000,
    });

    await expect
        .poll(async () => getEditorInputs(page).count(), {
            timeout: 30_000,
        })
        .toBeGreaterThan(0);

    await expectToolsEditorNotBlank(page);
    await expectToolsEditorToContain(page, STARTER_MARKER);

    const submitButton = page.getByTestId("review-practice-submit-button");
    await expect(submitButton).toBeVisible({ timeout: 30_000 });
    await expect(submitButton).toBeEnabled({ timeout: 30_000 });

    const autoAdvanceToggle = page.getByLabel(/auto-advance/i).first();
    if (await autoAdvanceToggle.count()) {
        try {
            if (await autoAdvanceToggle.isChecked()) {
                await autoAdvanceToggle.uncheck();
            }
        } catch {}
    }
}

async function fillToolsEditor(page: Page, code: string) {
    const editor = getToolsEditorInput(page);
    await expect(editor).toBeAttached({ timeout: 30_000 });

    await editor.fill(code);

    await expect
        .poll(() => readToolsEditor(page), { timeout: 10_000 })
        .toBe(code);
}

async function clickCheckThisAnswer(page: Page) {
    const button = page.getByTestId("review-practice-submit-button");
    await expect(button).toBeVisible({ timeout: 30_000 });
    await expect(button).toBeEnabled({ timeout: 30_000 });
    await button.click();
}

async function waitForCorrect(page: Page) {
    await expect(page.getByTestId("review-practice-result-correct")).toBeVisible({
        timeout: 45_000,
    });
}

async function visibleEnabledButtonTexts(page: Page): Promise<string[]> {
    return page.getByRole("button").evaluateAll((buttons) =>
        buttons
            .filter((button) => {
                const element = button as HTMLElement;
                const style = window.getComputedStyle(element);

                return (
                    style.display !== "none" &&
                    style.visibility !== "hidden" &&
                    !element.hasAttribute("disabled") &&
                    element.getAttribute("aria-disabled") !== "true"
                );
            })
            .map((button) => (button.textContent ?? "").trim())
            .filter(Boolean),
    );
}
const NEXT_EXERCISE_URL =
    "/en/catalog/python/subjects/python-v2/modules/python-v2-3/learn/python-v2-3-while-loops/loop-debugging/exercise/loop-debug-code-4?e2eUnlockAll=1";
async function clickEnabledButton(page: Page, name: RegExp) {
    const buttons = page.getByRole("button", { name });
    const count = await buttons.count();

    for (let index = count - 1; index >= 0; index -= 1) {
        const button = buttons.nth(index);

        if ((await button.isVisible()) && (await button.isEnabled())) {
            await button.click();
            return;
        }
    }

    const visibleButtons = await visibleEnabledButtonTexts(page);

    throw new Error(
        `No enabled button found for ${String(name)}. Visible enabled buttons: ${visibleButtons.join(
            " | ",
        )}`,
    );
}

async function clickQuestionNext(page: Page) {
    await clickEnabledButton(page, /^next(?:\s*→)?$/i);
}

async function clickQuestionPrevious(page: Page) {
    await clickEnabledButton(page, /^previous$/i);
}

async function waitUntilToolsBoundToExercise(page: Page, exerciseKeyPart: string) {
    await expect(page).toHaveURL(
        new RegExp(`/exercise/${exerciseKeyPart}(?:\\?.*)?$`),
        { timeout: 30_000 },
    );

    await expect(getToolsEditorInput(page)).toBeAttached({ timeout: 30_000 });
    await expectToolsEditorNotBlank(page);
}

test.describe("real review route Tools editor back/forward persistence", () => {
    test.beforeEach(async ({ context, page }) => {
        await context.clearCookies();

        await page.addInitScript(() => {
            window.localStorage.setItem("learnoir.quiz.autoAdvance", "0");
        });

        await installStableChromeMocks(page);
        await installIsolatedReviewProgress(page);
        await installPracticeMocks(page);
    });

    test("correct code_input keeps learner code after next, previous, and repeated back/forward navigation", async ({
                                                                                                                        page,
                                                                                                                    }) => {
        await gotoRealExercise(page);

        await fillToolsEditor(page, SOLVED_CODE);

        await clickCheckThisAnswer(page);
        await waitForCorrect(page);

        await expect(page).toHaveURL(/\/exercise\/(?:loop-debug-code-3|loop-debug-code-4)(?:\?.*)?$/, {
            timeout: 10_000,
        });
        await expectToolsEditorToContain(page, SOLVED_MARKER);
        await expectToolsEditorNotToContain(page, STARTER_MARKER);

        const codeAfterCorrect = await readToolsEditor(page);
        expect(codeAfterCorrect).toContain(SOLVED_MARKER);
        expect(codeAfterCorrect).toContain("n = n - 1");
        expect(codeAfterCorrect).not.toContain(STARTER_MARKER);

        /**
         * Do not depend on the rendered Next button here.
         * In full-suite state, the visible Next CTA can be disabled while the route
         * target itself is still valid. This test is about workspace persistence
         * across navigation, not CTA enablement.
         */
        await page.goto(NEXT_EXERCISE_URL, {
            waitUntil: "domcontentloaded",
            timeout: 45_000,
        });

        await expect(page).toHaveURL(/\/exercise\/loop-debug-code-4(?:\?.*)?$/, {
            timeout: 30_000,
        });
        await expectToolsEditorNotBlank(page);

        await page.goto(REAL_EXERCISE_URL, {
            waitUntil: "domcontentloaded",
            timeout: 45_000,
        });

        await waitUntilToolsBoundToExercise(page, "loop-debug-code-3");

        await expectToolsEditorToContain(page, SOLVED_MARKER);
        await expectToolsEditorNotToContain(page, STARTER_MARKER);

        const codeAfterReturn = await readToolsEditor(page);
        expect(codeAfterReturn).toContain(SOLVED_MARKER);
        expect(codeAfterReturn).toContain("n = n - 1");
        expect(codeAfterReturn).not.toContain(STARTER_MARKER);

        await page.goto(NEXT_EXERCISE_URL, {
            waitUntil: "domcontentloaded",
            timeout: 45_000,
        });

        await expect(page).toHaveURL(/\/exercise\/loop-debug-code-4(?:\?.*)?$/, {
            timeout: 30_000,
        });
        await expectToolsEditorNotBlank(page);

        await page.goto(REAL_EXERCISE_URL, {
            waitUntil: "domcontentloaded",
            timeout: 45_000,
        });

        await waitUntilToolsBoundToExercise(page, "loop-debug-code-3");

        await expectToolsEditorToContain(page, SOLVED_MARKER);
        await expectToolsEditorNotToContain(page, STARTER_MARKER);

        const codeAfterSecondReturn = await readToolsEditor(page);
        expect(codeAfterSecondReturn).toContain(SOLVED_MARKER);
        expect(codeAfterSecondReturn).toContain("n = n - 1");
        expect(codeAfterSecondReturn).not.toContain(STARTER_MARKER);
    });
    test("browser history back and forward do not restore starter over solved learner code", async ({
                                                                                                        page,
                                                                                                    }) => {
        await gotoRealExercise(page);

        await fillToolsEditor(page, SOLVED_CODE);

        await clickCheckThisAnswer(page);
        await waitForCorrect(page);

        await expect(page).toHaveURL(/\/exercise\/(?:loop-debug-code-3|loop-debug-code-4)(?:\?.*)?$/, {
            timeout: 10_000,
        });
        await expectToolsEditorToContain(page, SOLVED_MARKER);
        await expectToolsEditorNotToContain(page, STARTER_MARKER);

        const solvedExerciseUrl = page.url();
        const probeUrl = `${solvedExerciseUrl}&historyProbe=1`;

        /**
         * Create a deterministic same-target browser history entry.
         * This isolates browser popstate restoration from course progression and
         * disabled CTA behavior.
         */
        await page.evaluate((url) => {
            window.history.pushState({ e2eHistoryProbe: true }, "", url);
            window.dispatchEvent(
                new PopStateEvent("popstate", {
                    state: { e2eHistoryProbe: true },
                }),
            );
        }, probeUrl);

        await expect(page).toHaveURL(/historyProbe=1/, {
            timeout: 10_000,
        });

        await expectToolsEditorToContain(page, SOLVED_MARKER);
        await expectToolsEditorNotToContain(page, STARTER_MARKER);

        await page.goBack();
        await page.waitForLoadState("domcontentloaded");

        await expect(page).toHaveURL(/\/exercise\/(?:loop-debug-code-3|loop-debug-code-4)(?:\?.*)?$/, {
            timeout: 30_000,
        });

        await expectToolsEditorToContain(page, SOLVED_MARKER);
        await expectToolsEditorNotToContain(page, STARTER_MARKER);

        await page.goForward();
        await page.waitForLoadState("domcontentloaded");

        await expect(page).toHaveURL(/historyProbe=1/, {
            timeout: 30_000,
        });

        await expectToolsEditorToContain(page, SOLVED_MARKER);
        await expectToolsEditorNotToContain(page, STARTER_MARKER);

        await page.goBack();
        await page.waitForLoadState("domcontentloaded");

        await expect(page).toHaveURL(/\/exercise\/(?:loop-debug-code-3|loop-debug-code-4)(?:\?.*)?$/, {
            timeout: 30_000,
        });

        await expectToolsEditorToContain(page, SOLVED_MARKER);
        await expectToolsEditorNotToContain(page, STARTER_MARKER);

        const codeAfterHistoryBack = await readToolsEditor(page);
        expect(codeAfterHistoryBack).toContain(SOLVED_MARKER);
        expect(codeAfterHistoryBack).toContain("n = n - 1");
        expect(codeAfterHistoryBack).not.toContain(STARTER_MARKER);
    });
});
