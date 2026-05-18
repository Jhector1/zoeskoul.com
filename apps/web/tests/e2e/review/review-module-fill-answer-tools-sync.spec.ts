import { expect, test, type Locator, type Page } from "@playwright/test";

test.use({
    viewport: {
        width: 1440,
        height: 1000,
    },
});

const ROUTE =
    "/en/dev/e2e/review-module-clone/python-v2/e2e-review-clone/learn/e2e-section/e2e-review-topic/quiz/review-clone-practice-quiz";

const REAL_CLONE_FILL_ROUTE =
    "/en/dev/e2e/review-module-clone/python-v2/python-1/learn/section-a/e2e-review-topic/practice/e2e-fill-answer-tools-sync";

const STARTER_CODE = "name = 'ZoeSkoul learner'\nprint('Hello, ' + name)\n";
const SOLUTION_CODE =
    "from helper import shout\nname = 'ZoeSkoul learner'\nprint(shout('Hello, ' + name))\n";

const SOLUTION_WORKSPACE = {
    version: 2,
    language: "python",
    entryFileId: "main.py",
    activeFileId: "main.py",
    nodes: [
        {
            kind: "file",
            id: "main.py",
            name: "main.py",
            content: SOLUTION_CODE,
        },
        {
            kind: "file",
            id: "helper.py",
            name: "helper.py",
            content: "def shout(value):\n    return value.upper()\n",
        },
    ],
};

function looksLikeFilledAnswer(value: string) {
    return (
        value.trim().length > 0 &&
        /from helper import shout|print\(shout\('Hello, '\s*\+\s*name\)\)|ZoeSkoul learner|hello|print\(/i.test(
            value,
        )
    );
}

async function clickStartAssignmentOrNext(page: Page) {
    const startAssignment = page
        .getByRole("button", { name: /start module assignment/i })
        .first();

    if (await startAssignment.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await startAssignment.click();
        return;
    }

    await page.getByRole("button", { name: /^Next$/i }).click();
}


async function visibleCodeEditorValues(page: Page): Promise<string[]> {
    const editors = page.getByTestId("code-editor-e2e-input");

    return editors.evaluateAll((nodes) =>
        nodes
            .filter((node) => {
                const el = node as HTMLTextAreaElement;
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);

                return (
                    rect.width > 0 &&
                    rect.height > 0 &&
                    style.display !== "none" &&
                    style.visibility !== "hidden"
                );
            })
            .map((node) => (node as HTMLTextAreaElement).value),
    );
}

function isFillAnswerSolution(value: string): boolean {
    return (
        value.trim().length > 0 &&
        !value.includes("# wrong code") &&
        /from helper import shout|print\(shout\('Hello, '\s*\+\s*name\)\)|ZoeSkoul learner|hello/i.test(
            value,
        )
    );
}

async function openFillAnswerExerciseFromCloneStart(page: Page) {
    await page.goto(REAL_CLONE_FILL_ROUTE);

    const main = page.getByRole("main");

    await expect(main.getByText(/read before coding/i)).toBeVisible({
        timeout: 15_000,
    });

    await clickStartAssignmentOrNext(page);

    await expect(page.getByTestId("code-editor-e2e-input").first()).toBeAttached({
        timeout: 15_000,
    });

    const toolsButton = page.getByRole("button", { name: /tools/i }).first();

    if (await toolsButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await toolsButton.click();
    }

    const editor = await pickBoundToolsEditor(page);

    await expect(editor).toBeVisible({ timeout: 15_000 });

    return editor;
}

function makePracticeResponse(key: string) {
    return {
        key,
        sessionId: "e2e-review-module-fill-answer-session",
        exercise: {
            id: "e2e-print-name",
            kind: "code_input",
            title: "Review Clone Practice Key Refresh",
            prompt: "Edit and run starter code.",
            language: "python",
            runtime: {
                kind: "code",
                language: "python",
            },
            workspace: {
                language: "python",
                entryFile: "main.py",
                starterFiles: {
                    "main.py": STARTER_CODE,
                    "helper.py": "def shout(value):\n    return value.upper()\n",
                },
                solutionFiles: {
                    "main.py": SOLUTION_CODE,
                    "helper.py": "def shout(value):\n    return value.upper()\n",
                },
            },
            starterCode: STARTER_CODE,
            solutionCode: SOLUTION_CODE,
        },
        run: {
            maxAttempts: 3,
            allowReveal: true,
            help: {
                stepKeys: ["concept", "hint_1", "hint_2", "reveal"],
            },
        },
    };
}

async function mockReviewModuleFillAnswerFlow(page: Page) {
    await page.route("**/api/review/progress**", async (route) => {
        const request = route.request();

        if (request.method() === "GET") {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ progress: null }),
            });
            return;
        }

        if (request.method() === "PUT") {
            const body = request.postDataJSON();

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

    await page.route(
        (url) => url.pathname === "/api/review/quiz",
        async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    quizKey: "e2e-review-module-fill-answer-quiz-key",
                    questions: [
                        {
                            kind: "practice",
                            id: "e2e-review-module-fill-answer-question",
                            prompt: "Practice key refresh fixture",
                            fetch: {
                                subject: "python-v2",
                                module: "e2e-review-clone",
                                section: "e2e-section",
                                topic: "e2e-review-topic",
                                difficulty: "easy",
                                allowReveal: true,
                                preferKind: "code_input",
                                exerciseKey: "e2e-print-name",
                            },
                            maxAttempts: 3,
                        },
                    ],
                }),
            });
        },
    );

    let practiceFetchCalls = 0;

    await page.route(
        (url) => url.pathname === "/api/practice",
        async (route) => {
            practiceFetchCalls += 1;

            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(
                    makePracticeResponse(
                        `e2e-review-module-fill-answer-key-${practiceFetchCalls}`,
                    ),
                ),
            });
        },
    );

    await page.route(
        (url) => url.pathname === "/api/practice/validate",
        async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    ok: false,
                    finalized: false,
                    explanation: "Not quite yet.",
                    attempts: {
                        used: 1,
                        max: 3,
                        left: 2,
                    },
                }),
            });
        },
    );

    let helpCallCount = 0;

    await page.route(
        (url) => url.pathname === "/api/practice/help",
        async (route) => {
            helpCallCount += 1;

            const steps = [
                {
                    stepKey: "concept",
                    step: {
                        key: "concept",
                        label: "Need a hint?",
                        kind: "concept",
                    },
                    source: "mock",
                    content: "Start by importing and using the helper function.",
                },
                {
                    stepKey: "hint_1",
                    step: {
                        key: "hint_1",
                        label: "Still stuck?",
                        kind: "hint",
                    },
                    source: "mock",
                    content:
                        "The helper is defined in helper.py and should wrap the greeting.",
                },
                {
                    stepKey: "hint_2",
                    step: {
                        key: "hint_2",
                        label: "Almost there?",
                        kind: "hint",
                    },
                    source: "mock",
                    content:
                        "Import shout from helper, then print shout('Hello, ' + name).",
                },
                {
                    stepKey: "reveal",
                    step: {
                        key: "reveal",
                        label: "Reveal answer",
                        kind: "reveal",
                    },
                    source: "mock",
                    content: "Here is the solution.",
                    reveal: {
                        kind: "code_input",
                        solutionCode: SOLUTION_CODE,
                        language: "python",
                        workspace: SOLUTION_WORKSPACE,
                    },
                },
            ];

            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(
                    steps[Math.min(helpCallCount - 1, steps.length - 1)],
                ),
            });
        },
    );
}

async function getVisibleButtons(page: Page) {
    return page.locator("button").evaluateAll((buttons) =>
        buttons
            .map((button) => button.textContent?.replace(/\s+/g, " ").trim())
            .filter(Boolean),
    );
}

async function getCodeEditors(page: Page) {
    const editors = page.getByTestId("code-editor-e2e-input");

    await expect(editors.first()).toBeAttached({
        timeout: 15_000,
    });

    return editors;
}

async function pickBoundToolsEditor(page: Page): Promise<Locator> {
    const editors = await getCodeEditors(page);
    const count = await editors.count();

    for (let i = count - 1; i >= 0; i -= 1) {
        const editor = editors.nth(i);
        const value = await editor.inputValue().catch(() => "");

        if (
            value.includes("print(") ||
            value.includes("ZoeSkoul") ||
            value.includes("Hello") ||
            value.trim().length > 0
        ) {
            return editor;
        }
    }

    return editors.nth(Math.max(0, count - 1));
}

async function setEditorValue(editor: Locator, value: string) {
    await editor.evaluate((node, nextValue) => {
        const textarea = node as HTMLTextAreaElement;
        const setter = Object.getOwnPropertyDescriptor(
            HTMLTextAreaElement.prototype,
            "value",
        )?.set;

        setter?.call(textarea, nextValue);

        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
}

async function openRevealStepsUntilFillAnswer(page: Page) {
    const fillAnswer = page.getByRole("button", { name: /fill answer/i }).first();

    if (await fillAnswer.isVisible({ timeout: 1_000 }).catch(() => false)) {
        return fillAnswer;
    }

    const checkOrSubmit = page
        .getByRole("button", { name: /check this answer|submit|check/i })
        .first();

    if (await checkOrSubmit.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await checkOrSubmit.click();
    }

    if (await fillAnswer.isVisible({ timeout: 2_000 }).catch(() => false)) {
        return fillAnswer;
    }

    const revealNames = [
        /need a hint/i,
        /hint/i,
        /still stuck/i,
        /almost there/i,
        /reveal answer/i,
        /show answer/i,
        /solution/i,
    ];

    for (let pass = 0; pass < 6; pass += 1) {
        if (await fillAnswer.isVisible({ timeout: 500 }).catch(() => false)) {
            return fillAnswer;
        }

        let clicked = false;

        for (const name of revealNames) {
            const button = page.getByRole("button", { name }).first();

            if (await button.isVisible({ timeout: 500 }).catch(() => false)) {
                await button.click();
                await page.waitForTimeout(250);
                clicked = true;
                break;
            }
        }

        if (!clicked) {
            const openingButton = page
                .getByRole("button", { name: /opening/i })
                .first();

            if (
                await openingButton
                    .isVisible({ timeout: 500 })
                    .catch(() => false)
            ) {
                await page.waitForTimeout(500);
                continue;
            }

            break;
        }
    }

    if (await fillAnswer.isVisible({ timeout: 5_000 }).catch(() => false)) {
        return fillAnswer;
    }

    const buttons = await getVisibleButtons(page);

    throw new Error(
        `Could not reveal Fill answer. Visible buttons: ${buttons.join(" | ")}`,
    );
}
test("ReviewModule Fill answer patches the bound right-side Tools editor", async ({
                                                                                      page,
                                                                                  }) => {
    await mockReviewModuleFillAnswerFlow(page);

    await page.goto(ROUTE);

    await expect(page.getByText(/Review Clone Practice Key Refresh/i)).toBeVisible({
        timeout: 15_000,
    });

    await expect(page.getByTestId("code-editor-e2e-input").first()).toBeAttached({
        timeout: 15_000,
    });

    const editor = await pickBoundToolsEditor(page);

    await setEditorValue(editor, "# wrong code");

    await expect
        .poll(async () => editor.inputValue(), {
            timeout: 15_000,
            message: "Expected test to control the bound Tools editor",
        })
        .toContain("# wrong code");

    const fillAnswer = await openRevealStepsUntilFillAnswer(page);

    await expect(fillAnswer).toBeVisible({
        timeout: 15_000,
    });

    await expect
        .poll(
            async () => {
                return page
                    .getByRole("button", { name: /fill answer/i })
                    .evaluateAll((buttons) =>
                        buttons.filter((button) => {
                            const style = window.getComputedStyle(button);
                            const rect = button.getBoundingClientRect();

                            return (
                                style.visibility !== "hidden" &&
                                style.display !== "none" &&
                                rect.width > 0 &&
                                rect.height > 0
                            );
                        }).length,
                    );
            },
            {
                timeout: 15_000,
                message:
                    "There should be only one visible Fill answer button in the reveal flow",
            },
        )
        .toBe(1);

    await fillAnswer.click();

    await expect
        .poll(
            async () => {
                const values = await visibleCodeEditorValues(page);

                return values.some(isFillAnswerSolution);
            },
            {
                timeout: 15_000,
                message:
                    "Fill answer should replace stale code in the visible bound Tools editor",
            },
        )
        .toBe(true);

    await expect
        .poll(
            async () => {
                const values = await visibleCodeEditorValues(page);

                return values.every((value: string) => !value.includes("# wrong code"));            },
            {
                timeout: 15_000,
                message:
                    "No visible Tools editor should still show stale code after Fill answer",
            },
        )
        .toBe(true);
});

// test("Fill answer patches the multi-file solution workspace, not only the visible code string", async ({
//                                                                                                            page,
//                                                                                                        }) => {
//     await mockReviewModuleFillAnswerFlow(page);
//
//     await page.goto(ROUTE);
//
//     await expect(page.getByText(/Review Clone Practice Key Refresh/i)).toBeVisible({
//         timeout: 15_000,
//     });
//
//     await expect(page.getByTestId("code-editor-e2e-input").first()).toBeAttached({
//         timeout: 15_000,
//     });
//
//     const editor = await pickBoundToolsEditor(page);
//
//     await setEditorValue(editor, "# stale single-file code");
//
//     await expect
//         .poll(async () => editor.inputValue(), {
//             timeout: 15_000,
//             message: "Expected stale code to be visible before Fill answer",
//         })
//         .toContain("# stale single-file code");
//
//     const fillAnswer = await openRevealStepsUntilFillAnswer(page);
//
//     await fillAnswer.click();
//
//     await expect
//         .poll(
//             async () => {
//                 const value = await editor.inputValue();
//
//                 return (
//                     !value.includes("# stale single-file code") &&
//                     value.includes("from helper import shout") &&
//                     value.includes("print(shout('Hello, ' + name))")
//                 );
//             },
//             {
//                 timeout: 15_000,
//                 message:
//                     "Fill answer should replace the visible main.py content with the solution",
//             },
//         )
//         .toBe(true);
//
//     const helperTab = page.getByRole("button", { name: /^helper\.py$/i }).first();
//
//     await expect(helperTab).toBeVisible({
//         timeout: 15_000,
//     });
//
//     await helperTab.click();
//
//     await expect
//         .poll(
//             async () => {
//                 const currentEditor = await pickBoundToolsEditor(page);
//                 const value = await currentEditor.inputValue();
//
//                 return value.includes("def shout(value):") && value.includes("return value.upper()");
//             },
//             {
//                 timeout: 15_000,
//                 message:
//                     "Fill answer should also hydrate helper.py from the revealed solution workspace",
//             },
//         )
//         .toBe(true);
//
//     const mainTab = page.getByRole("button", { name: /^main\.py$/i }).first();
//
//     await expect(mainTab).toBeVisible({
//         timeout: 15_000,
//     });
//
//     await mainTab.click();
//
//     await expect
//         .poll(
//             async () => {
//                 const currentEditor = await pickBoundToolsEditor(page);
//                 const value = await currentEditor.inputValue();
//
//                 return (
//                     value.includes("from helper import shout") &&
//                     value.includes("print(shout('Hello, ' + name))")
//                 );
//             },
//             {
//                 timeout: 15_000,
//                 message:
//                     "Switching tabs after Fill answer should preserve the solution main.py content",
//             },
//         )
//         .toBe(true);
// });
//
// test("Fill answer stays stable after switching between solution files", async ({
//                                                                                    page,
//                                                                                }) => {
//     await mockReviewModuleFillAnswerFlow(page);
//
//     await page.goto(ROUTE);
//
//     await expect(page.getByText(/Review Clone Practice Key Refresh/i)).toBeVisible({
//         timeout: 15_000,
//     });
//
//     await expect(page.getByTestId("code-editor-e2e-input").first()).toBeAttached({
//         timeout: 15_000,
//     });
//
//     const editor = await pickBoundToolsEditor(page);
//
//     await setEditorValue(editor, "print('old visible stale code')");
//
//     await expect
//         .poll(async () => editor.inputValue(), {
//             timeout: 15_000,
//             message: "Expected stale code before Fill answer",
//         })
//         .toContain("old visible stale code");
//
//     const fillAnswer = await openRevealStepsUntilFillAnswer(page);
//
//     await fillAnswer.click();
//
//     await expect
//         .poll(
//             async () => {
//                 const value = await editor.inputValue();
//
//                 return (
//                     !value.includes("old visible stale code") &&
//                     value.includes("from helper import shout")
//                 );
//             },
//             {
//                 timeout: 15_000,
//                 message:
//                     "Fill answer should replace stale visible code before tab switching",
//             },
//         )
//         .toBe(true);
//
//     const helperTab = page.getByRole("button", { name: /^helper\.py$/i }).first();
//     const mainTab = page.getByRole("button", { name: /^main\.py$/i }).first();
//
//     await expect(helperTab).toBeVisible({ timeout: 15_000 });
//     await expect(mainTab).toBeVisible({ timeout: 15_000 });
//
//     await helperTab.click();
//
//     await expect
//         .poll(
//             async () => {
//                 const currentEditor = await pickBoundToolsEditor(page);
//                 return currentEditor.inputValue();
//             },
//             {
//                 timeout: 15_000,
//                 message: "helper.py should be visible after clicking its tab",
//             },
//         )
//         .toContain("def shout(value):");
//
//     await mainTab.click();
//
//     await expect
//         .poll(
//             async () => {
//                 const currentEditor = await pickBoundToolsEditor(page);
//                 return currentEditor.inputValue();
//             },
//             {
//                 timeout: 15_000,
//                 message:
//                     "main.py should still contain the Fill answer solution after returning from helper.py",
//             },
//         )
//         .toContain("from helper import shout");
//
//     await expect
//         .poll(async () => {
//             const currentEditor = await pickBoundToolsEditor(page);
//             return currentEditor.inputValue();
//         })
//         .not.toContain("old visible stale code");
// });