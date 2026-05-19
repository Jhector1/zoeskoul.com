import { expect, test, type Locator, type Page } from "@playwright/test";
import {replaceMonacoText} from "../../utils";

test.use({
    viewport: {
        width: 1440,
        height: 1000,
    },
});
test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) => {
        console.error("[pageerror]", error.message);
        console.error(error.stack);
    });

    page.on("console", (message) => {
        if (message.type() === "error") {
            console.error("[browser console error]", message.text());
        }
    });
});
const PROJECT_STEP_2_ROUTE =
    "/en/dev/e2e/review-module-clone/python/e2e-review-clone/learn/e2e-section/e2e-review-topic/exercise/e2e-project-step-2";

const PROJECT_STEP_2_SLUG = "/exercise/e2e-project-step-2";
const PROJECT_STEP_3_SLUG = "/exercise/e2e-project-step-3";
const PROJECT_STEP_3_KEY =
    "python:e2e-review-clone:e2e-section:e2e-review-topic:review-clone-project:e2e-project-step-3";

const Q2_MARKER = "# E2E_Q2_SHIPPING_WORKSPACE_MARKER";
const Q3_MARKER = "# E2E_Q3_SUM_LIST_WORKSPACE_MARKER";

const Q2_STARTER = "total = int(input())";
const Q2_STARTER_TODO = "# TODO: print shipping cost";
const Q3_STARTER = "def sum_list(xs):";
const Q3_STARTER_VALUES = "values = [1, 2, 3]";
const FIRST_READING_CARD_ROUTE =
    "/en/dev/e2e/review-module-clone/python/e2e-review-clone/learn/e2e-section/e2e-review-topic/text/e2e-reading";

const FIRST_READING_CARD_SLUG = "/text/e2e-reading";
const PRACTICE_FIXTURES = {
    "e2e-print-name": {
        title: "Edit and run starter code",
        starterCode: "name = 'ZoeSkoul learner'\nprint('Hello, ' + name)\n",
        solutionCode:
            "from helper import shout\nname = 'ZoeSkoul learner'\nprint(shout('Hello, ' + name))\n",
        starterFiles: {
            "main.py": "name = 'ZoeSkoul learner'\nprint('Hello, ' + name)\n",
            "helper.py": "def shout(value):\n    return value.upper()\n",
        },
        solutionFiles: {
            "main.py":
                "from helper import shout\nname = 'ZoeSkoul learner'\nprint(shout('Hello, ' + name))\n",
            "helper.py": "def shout(value):\n    return value.upper()\n",
        },
    },
    "e2e-project-step-2": {
        title: "Build a shipping helper",
        starterCode: "total = int(input())\n# TODO: print shipping cost\n",
        solutionCode:
            "def shipping_cost(total):\n    return 0 if total >= 50 else 7\n\n" +
            "total = int(input())\nprint(f'Shipping = {shipping_cost(total)}')\n",
        starterFiles: {
            "main.py": "total = int(input())\n# TODO: print shipping cost\n",
        },
        solutionFiles: {
            "main.py":
                "def shipping_cost(total):\n    return 0 if total >= 50 else 7\n\n" +
                "total = int(input())\nprint(f'Shipping = {shipping_cost(total)}')\n",
        },
    },
    "e2e-project-step-3": {
        title: "Build a sum helper",
        starterCode:
            "def sum_list(xs):\n    # TODO\n    pass\n\nvalues = [1, 2, 3]\n# TODO\n",
        solutionCode:
            "def sum_list(xs):\n    total = 0\n    for value in xs:\n        total += value\n    return total\n\n" +
            "values = [1, 2, 3]\nprint(sum_list(values))\n",
        starterFiles: {
            "main.py":
                "def sum_list(xs):\n    # TODO\n    pass\n\nvalues = [1, 2, 3]\n# TODO\n",
        },
        solutionFiles: {
            "main.py":
                "def sum_list(xs):\n    total = 0\n    for value in xs:\n        total += value\n    return total\n\n" +
                "values = [1, 2, 3]\nprint(sum_list(values))\n",
        },
    },
} as const;
const Q2_SOLUTION = PRACTICE_FIXTURES["e2e-project-step-2"].solutionCode;
function makeInitialProjectProgress(
    practiceMeta: Record<string, { attempts: number; ok: boolean }> = {
        "e2e-print-name": {
            attempts: 1,
            ok: true,
        },
        "e2e-project-step-2": {
            attempts: 1,
            ok: true,
        },
        "e2e-project-step-3": {
            attempts: 1,
            ok: true,
        },
    },
) {
    return {
        topics: {
            "e2e-review-topic": {
                readingDone: {
                    "e2e-reading": true,
                },
                cardsDone: {},
                quizzesDone: {
                    "review-clone-project": true,
                },
                quizState: {
                    "review-clone-project": {
                        answers: {},
                        checkedById: {},
                        excusedById: {},
                        practiceMeta,
                    },
                },
            },
        },
    };
}

async function installDeterministicReviewCloneMocks(
    page: Page,
    options: {
        savedBodies?: any[];
        initialProgress?: any;
    } = {},
) {
    await page.route("**/api/review/progress**", async (route) => {
        const request = route.request();

        if (request.method() === "GET") {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    progress: options.initialProgress ?? makeInitialProjectProgress(),
                }),
            });
            return;
        }

        if (request.method() === "PUT") {
            const body = request.postDataJSON();
            options.savedBodies?.push(body);

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
                    quizKey: "e2e-project-workspace-isolation-quiz-key",
                    questions: [
                        {
                            kind: "practice",
                            id: "proj:e2e-print-name:test",
                            title: "Edit and run starter code",
                            fetch: {
                                subject: "python",
                                module: "e2e-review-clone",
                                section: "e2e-section",
                                topic: "e2e-review-topic",
                                difficulty: "easy",
                                allowReveal: true,
                                preferPurpose: "project",
                                preferKind: "code_input",
                                exerciseKey: "e2e-print-name",
                                seedPolicy: "global",
                            },
                            maxAttempts: 3,
                        },
                        {
                            kind: "practice",
                            id: "proj:e2e-project-step-2:test",
                            title: "Build a shipping helper",
                            fetch: {
                                subject: "python",
                                module: "e2e-review-clone",
                                section: "e2e-section",
                                topic: "e2e-review-topic",
                                difficulty: "easy",
                                allowReveal: true,
                                preferPurpose: "project",
                                preferKind: "code_input",
                                exerciseKey: "e2e-project-step-2",
                                seedPolicy: "global",
                            },
                            maxAttempts: 3,
                        },
                        {
                            kind: "practice",
                            id: "proj:e2e-project-step-3:test",
                            title: "Build a sum helper",
                            fetch: {
                                subject: "python",
                                module: "e2e-review-clone",
                                section: "e2e-section",
                                topic: "e2e-review-topic",
                                difficulty: "easy",
                                allowReveal: true,
                                preferPurpose: "project",
                                preferKind: "code_input",
                                exerciseKey: "e2e-project-step-3",
                                seedPolicy: "global",
                            },
                            maxAttempts: 3,
                        },
                    ],
                }),
            });
        },
    );

    await page.route(
        (url) => url.pathname === "/api/practice",
        async (route) => {
            const exerciseKey =
                new URL(route.request().url()).searchParams.get("exerciseKey") ??
                "e2e-print-name";

            const fixture =
                PRACTICE_FIXTURES[exerciseKey as keyof typeof PRACTICE_FIXTURES] ??
                PRACTICE_FIXTURES["e2e-print-name"];

            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    key: `practice-key-${exerciseKey}`,
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
                        workspace: {
                            language: "python",
                            entryFile: "main.py",
                            starterFiles: fixture.starterFiles,
                            solutionFiles: fixture.solutionFiles,
                        },
                        starterCode: fixture.starterCode,
                        solutionCode: fixture.solutionCode,
                    },
                    run: {
                        maxAttempts: 3,
                        allowReveal: true,
                        help: {
                            stepKeys: ["concept", "hint_1", "hint_2", "reveal"],
                        },
                    },
                }),
            });
        },
    );

    await page.route(
        (url) => url.pathname === "/api/practice/validate",
        async (route) => {
            let body: any = null;

            try {
                body = route.request().postDataJSON();
            } catch {
                body = route.request().postData();
            }

            const serialized = JSON.stringify(body ?? {});
            const isWrongAnswer =
                serialized.includes('print("wrong")') ||
                serialized.includes('print(\\"wrong\\")') ||
                serialized.includes("print('wrong')") ||
                serialized.includes("print(\\'wrong\\')");

            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    ok: !isWrongAnswer,
                    finalized: !isWrongAnswer,
                    explanation: isWrongAnswer ? "Not quite." : "Correct.",
                    attempts: {
                        used: 1,
                        max: 3,
                        left: 2,
                    },
                }),
            });
        },
    );

    await page.route(
        (url) => url.pathname === "/api/practice/help",
        async (route) => {
            const solutionCode = PRACTICE_FIXTURES["e2e-project-step-3"].solutionCode;

            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    stepKey: "concept",
                    step: {
                        key: "concept",
                        label: "Need a hint?",
                        kind: "concept",
                    },
                    source: "mock",
                    content:
                        "Keep the visible editor workspace unchanged unless Fill answer is clicked.",
                    reveal: {
                        kind: "code_input",
                        solutionCode,
                        language: "python",
                        workspace: {
                            version: 2,
                            language: "python",
                            entryFileId: "file:main.py",
                            activeFileId: "file:main.py",
                            nodes: [
                                {
                                    id: "file:main.py",
                                    kind: "file",
                                    name: "main.py",
                                    parentId: null,
                                    content: solutionCode,
                                    createdAt: 0,
                                    updatedAt: 0,
                                },
                            ],
                            openTabs: ["file:main.py"],
                            expanded: [],
                            stdin: "",
                            leftPct: 26,
                        },
                    },
                }),
            });
        },
    );
}

function projectQuestionCard(page: Page) {
    return page
        .getByRole("main")
        .locator("section, article, div")
        .filter({ hasText: "Review Clone Project A" })
        .filter({ hasText: /Question \d+ of 3/ })
        .first();
}

function projectQuestionNavigator(page: Page) {
    return projectQuestionCard(page)
        .locator("section, article, div")
        .filter({ hasText: /Question \d+ of 3/ })
        .first();
}

async function gotoReviewRoute(page: Page, route: string) {
    await page.goto(route, {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
    });
}

async function getVisibleCodeEditorValues(page: Page): Promise<string[]> {
    const editors = page.getByTestId("code-editor-e2e-input");

    await expect(editors.first()).toBeAttached({
        timeout: 15_000,
    });

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

async function expectAnyVisibleEditorToContain(
    page: Page,
    text: string | RegExp,
    message: string,
) {
    await expect
        .poll(
            async () => {
                const values = await getVisibleCodeEditorValues(page);

                return values.some((value) =>
                    typeof text === "string" ? value.includes(text) : text.test(value),
                );
            },
            {
                timeout: 15_000,
                message,
            },
        )
        .toBe(true);
}

async function expectNoVisibleEditorToContain(
    page: Page,
    text: string,
    message: string,
) {
    await expect
        .poll(
            async () => {
                const values = await getVisibleCodeEditorValues(page);

                return values.every((value) => !value.includes(text));
            },
            {
                timeout: 15_000,
                message,
            },
        )
        .toBe(true);
}

async function pickVisibleCodeEditor(page: Page): Promise<Locator> {
    const editors = page.getByTestId("code-editor-e2e-input");

    await expect(editors.first()).toBeAttached({
        timeout: 15_000,
    });

    const count = await editors.count();

    for (let i = count - 1; i >= 0; i -= 1) {
        const editor = editors.nth(i);

        const visible = await editor
            .evaluate((node) => {
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
            .catch(() => false);

        if (visible) return editor;
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

function savedExerciseFromPayload(body: any, exerciseKey: string) {
    return body?.state?.runtimeStateV2?.exercises?.[exerciseKey] ?? null;
}

function savedPracticePatchFromPayload(body: any, exerciseId: string) {
    return (
        body?.state?.topics?.["e2e-review-topic"]?.quizState?.[
            "review-clone-project"
        ]?.practiceItemPatch?.[exerciseId] ??
        body?.state?.topics?.unknown?.practiceItemPatch?.[exerciseId] ??
        null
    );
}

function savedToolStateFromPayload(body: any, exerciseKey: string) {
    return (
        body?.state?.runtimeStateV2?.toolState?.[`exercise:${exerciseKey}`] ??
        body?.state?.toolState?.[`exercise:${exerciseKey}`] ??
        null
    );
}

function workspaceText(workspace: any): string {
    if (!workspace || !Array.isArray(workspace.nodes)) return "";

    return workspace.nodes
        .filter((node: any) => node?.kind === "file")
        .map((node: any) => String(node?.content ?? ""))
        .join("\n");
}

function savedExerciseText(exercise: any): string {
    return [
        exercise?.code,
        exercise?.source,
        workspaceText(exercise?.workspace),
        workspaceText(exercise?.codeWorkspace),
        workspaceText(exercise?.ideWorkspace),
    ].join("\n");
}

function savedActiveTargetText(body: any, exerciseKey: string, exerciseId: string) {
    const carriers = [
        savedExerciseFromPayload(body, exerciseKey),
        savedToolStateFromPayload(body, exerciseKey),
        savedPracticePatchFromPayload(body, exerciseId),
    ];

    return carriers.map(savedExerciseText).join("\n");
}

async function waitForSavedActiveTargetPayload(
    savedBodies: any[],
    exerciseKey: string,
    exerciseId: string,
    marker: string,
) {
    await expect
        .poll(
            () =>
                savedBodies.some((body) =>
                    savedActiveTargetText(body, exerciseKey, exerciseId).includes(marker),
                ),
            {
                timeout: 20_000,
                message: `Expected a saved active-target payload for ${exerciseKey} to contain ${marker}`,
            },
        )
        .toBe(true);

    return savedBodies.find((body) =>
        savedActiveTargetText(body, exerciseKey, exerciseId).includes(marker),
    );
}

test("project question navigation keeps each exercise workspace isolated in the Tools editor", async ({
                                                                                                          page,
                                                                                                      }) => {
    await installDeterministicReviewCloneMocks(page);

    await gotoReviewRoute(page, PROJECT_STEP_2_ROUTE);

    await expect(projectQuestionCard(page)).toContainText("Review Clone Project A", {
        timeout: 15_000,
    });

    await expect(projectQuestionCard(page)).toContainText(/Question 2 of 3/, {
        timeout: 15_000,
    });

    await expect(page).toHaveURL(new RegExp(`${PROJECT_STEP_2_SLUG}(?:\\?.*)?$`));
    await expectAnyVisibleEditorToContain(
        page,
        Q2_STARTER,
        "Question 2 should hydrate its own shipping starter workspace",
    );

    let editor = await pickVisibleCodeEditor(page);

    await setEditorValue(
        editor,
        [
            Q2_MARKER,
            Q2_STARTER,
            "print(f'Shipping = {total}')",
            "",
        ].join("\n"),
    );

    await expectAnyVisibleEditorToContain(
        page,
        Q2_MARKER,
        "Question 2 user edit should be visible before navigating away",
    );

    await projectQuestionNavigator(page)
        .getByRole("button", { name: /^Next$/i })
        .nth(1)
        .click();

    await expect(projectQuestionCard(page)).toContainText(/Question 3 of 3/, {
        timeout: 15_000,
    });

    await expect(page).toHaveURL(new RegExp(`${PROJECT_STEP_3_SLUG}$`));

    await expectNoVisibleEditorToContain(
        page,
        Q2_MARKER,
        "Question 2 code must not leak into Question 3's bound Tools editor",
    );

    await expectAnyVisibleEditorToContain(
        page,
        Q3_STARTER,
        "Question 3 should hydrate its own sum_list starter workspace",
    );

    await expectAnyVisibleEditorToContain(
        page,
        Q3_STARTER_VALUES,
        "Question 3 starter should be visible after project navigation",
    );

    editor = await pickVisibleCodeEditor(page);

    await setEditorValue(
        editor,
        [
            Q3_MARKER,
            Q3_STARTER,
            "    return sum(xs)",
            "",
            Q3_STARTER_VALUES,
            "print(sum_list(values))",
            "",
        ].join("\n"),
    );

    await expectAnyVisibleEditorToContain(
        page,
        Q3_MARKER,
        "Question 3 user edit should be visible before navigating back",
    );

    await projectQuestionNavigator(page)
        .getByRole("button", { name: /^Previous$/i })
        .nth(1)
        .click();

    await expect(projectQuestionCard(page)).toContainText(/Question 2 of 3/, {
        timeout: 15_000,
    });

    await expect(page).toHaveURL(new RegExp(`${PROJECT_STEP_2_SLUG}$`));

    await expectAnyVisibleEditorToContain(
        page,
        Q2_MARKER,
        "Returning to Question 2 should restore Question 2's own workspace",
    );

    await expectNoVisibleEditorToContain(
        page,
        Q3_MARKER,
        "Question 3 code must not leak backward into Question 2's Tools editor",
    );
});

test("validated user code does not fall back to starterCode after Previous/Next navigation", async ({
                                                                                                        page,
                                                                                                    }) => {
    await installDeterministicReviewCloneMocks(page);

    await page.goto(PROJECT_STEP_2_ROUTE.replace(PROJECT_STEP_2_SLUG, PROJECT_STEP_3_SLUG));

    await expect(projectQuestionCard(page)).toContainText(/Question 3 of 3/, {
        timeout: 15_000,
    });

    const marker = "USER_CODE_AFTER_VALIDATE_123";
    const userCode = [
        `print("${marker}")`,
        "def sum_list(xs):",
        "    return sum(xs)",
        "",
        "values = [1, 2, 3]",
        "print(sum_list(values))",
        "",
    ].join("\n");

    await setEditorValue(await pickVisibleCodeEditor(page), userCode);
    await expectAnyVisibleEditorToContain(
        page,
        marker,
        "Edited user code should be visible before validating/navigation",
    );

    await page.getByRole("button", { name: /^Run$/i }).last().click();

    await projectQuestionNavigator(page)
        .getByRole("button", { name: /^Previous$/i })
        .nth(1)
        .click();

    await expect(projectQuestionCard(page)).toContainText(/Question 2 of 3/, {
        timeout: 15_000,
    });

    await projectQuestionNavigator(page)
        .getByRole("button", { name: /^Next$/i })
        .nth(1)
        .click();

    await expect(projectQuestionCard(page)).toContainText(/Question 3 of 3/, {
        timeout: 15_000,
    });

    await expectAnyVisibleEditorToContain(
        page,
        marker,
        "Validated user code must survive project Previous/Next navigation",
    );

    await expectNoVisibleEditorToContain(
        page,
        "# TODO",
        "Starter TODO text must not replace validated user code after Previous/Next",
    );
});

test("validated user code does not fall back to starterCode after top-level topic navigation and return", async ({
                                                                                                                     page,
                                                                                                                 }) => {
    await installDeterministicReviewCloneMocks(page);

    await page.goto(PROJECT_STEP_2_ROUTE.replace(PROJECT_STEP_2_SLUG, PROJECT_STEP_3_SLUG));

    await expect(projectQuestionCard(page)).toContainText(/Question 3 of 3/, {
        timeout: 15_000,
    });

    const marker = "USER_CODE_AFTER_TOP_LEVEL_RETURN_456";
    await setEditorValue(
        await pickVisibleCodeEditor(page),
        [
            `print("${marker}")`,
            "def sum_list(xs):",
            "    return sum(xs)",
            "values = [1, 2, 3]",
            "print(sum_list(values))",
            "",
        ].join("\n"),
    );

    await expectAnyVisibleEditorToContain(
        page,
        marker,
        "Edited user code should be visible before top-level navigation",
    );

    await page.getByRole("main").getByRole("button", { name: /^Next$/i }).first().click();
    await expect(projectQuestionCard(page)).not.toBeVisible({
        timeout: 15_000,
    });

    await page.goto(PROJECT_STEP_2_ROUTE.replace(PROJECT_STEP_2_SLUG, PROJECT_STEP_3_SLUG));
    await expect(projectQuestionCard(page)).toContainText(/Question 3 of 3/, {
        timeout: 15_000,
    });

    await expectAnyVisibleEditorToContain(
        page,
        marker,
        "User code must survive top-level card navigation away and back",
    );
    await expectNoVisibleEditorToContain(
        page,
        "# TODO",
        "Starter TODO text must not replace user code after top-level navigation",
    );
});

test("Reveal answer does not overwrite user-authored editor workspace", async ({
                                                                                   page,
                                                                               }) => {
    await installDeterministicReviewCloneMocks(page, {
        initialProgress: {
            topics: {
                "e2e-review-topic": {
                    readingDone: {
                        "e2e-reading": true,
                    },
                    cardsDone: {},
                    quizzesDone: {},
                    quizState: {
                        "review-clone-project": {
                            answers: {},
                            checkedById: {},
                            excusedById: {},
                            practiceMeta: {
                                "e2e-print-name": {
                                    attempts: 0,
                                    ok: true,
                                },
                                "e2e-project-step-2": {
                                    attempts: 0,
                                    ok: true,
                                },
                                "e2e-project-step-3": {
                                    attempts: 0,
                                    ok: false,
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    await page.goto(PROJECT_STEP_2_ROUTE.replace(PROJECT_STEP_2_SLUG, PROJECT_STEP_3_SLUG));

    const marker = "USER_PARTIAL_BEFORE_REVEAL_789";
    await setEditorValue(
        await pickVisibleCodeEditor(page),
        [`print("${marker}")`, "def sum_list(xs):", "    pass", ""].join("\n"),
    );

    await expectAnyVisibleEditorToContain(
        page,
        marker,
        "User-authored partial code should be visible before reveal",
    );

    const hintButton = projectQuestionCard(page).getByRole("button", {
        name: /Need a hint/i,
    });

    await expect(hintButton).toBeEnabled({
        timeout: 15_000,
    });
    await Promise.all([
        page.waitForRequest((request) => {
            const url = new URL(request.url());

            return url.pathname === "/api/practice/help";
        }),
        hintButton.click(),
    ]);

    await expect(projectQuestionCard(page)).toContainText(/concept|Still stuck/i, {
        timeout: 15_000,
    });

    await expectAnyVisibleEditorToContain(
        page,
        marker,
        "Opening reveal/hint UI must not auto-patch the editor",
    );
    await expectNoVisibleEditorToContain(
        page,
        "def sum_list(xs):\n    total = 0",
        "Solution code should not enter the editor until Fill answer is clicked",
    );

    const fillAnswer = projectQuestionCard(page).getByRole("button", { name: /Fill answer/i });
    if (await fillAnswer.isVisible().catch(() => false)) {
        await fillAnswer.click();
        await expectAnyVisibleEditorToContain(
            page,
            "total = 0",
            "Fill answer should be the explicit action that patches the editor",
        );
    }
});

test("successful check saves visible Monaco content into review progress payload", async ({
                                                                                              page,
                                                                                          }) => {
    const savedBodies: any[] = [];
    await installDeterministicReviewCloneMocks(page, { savedBodies });

    await page.goto(PROJECT_STEP_2_ROUTE.replace(PROJECT_STEP_2_SLUG, PROJECT_STEP_3_SLUG));

    const marker = "PROGRESS_PAYLOAD_VISIBLE_MONACO_321";
    await setEditorValue(
        await pickVisibleCodeEditor(page),
        [
            `print("${marker}")`,
            "def sum_list(xs):",
            "    return sum(xs)",
            "values = [1, 2, 3]",
            "print(sum_list(values))",
            "",
        ].join("\n"),
    );

    await page.getByRole("button", { name: /^Run$/i }).last().click();
    const matchingPayload = await waitForSavedActiveTargetPayload(
        savedBodies,
        PROJECT_STEP_3_KEY,
        "e2e-project-step-3",
        marker,
    );
    const exercise =
        savedExerciseFromPayload(matchingPayload, PROJECT_STEP_3_KEY) ??
        savedToolStateFromPayload(matchingPayload, PROJECT_STEP_3_KEY) ??
        savedPracticePatchFromPayload(matchingPayload, "e2e-project-step-3");
    const savedText = savedActiveTargetText(
        matchingPayload,
        PROJECT_STEP_3_KEY,
        "e2e-project-step-3",
    );

    expect(exercise?.userEdited).toBe(true);
    expect(savedText).toContain(marker);
    expect(savedText).not.toContain("# TODO");
});

test("completed/correct exercise still keeps user workspace", async ({ page }) => {
    await installDeterministicReviewCloneMocks(page);

    await page.goto(PROJECT_STEP_2_ROUTE.replace(PROJECT_STEP_2_SLUG, PROJECT_STEP_3_SLUG));

    await expect(projectQuestionCard(page)).toContainText(/Correct|Completed/, {
        timeout: 15_000,
    });

    const marker = "COMPLETED_EXERCISE_KEEP_USER_WORKSPACE_654";
    await setEditorValue(
        await pickVisibleCodeEditor(page),
        [
            `print("${marker}")`,
            "def sum_list(xs):",
            "    return sum(xs)",
            "values = [1, 2, 3]",
            "print(sum_list(values))",
            "",
        ].join("\n"),
    );

    await page.getByRole("main").getByRole("button", { name: /^Next$/i }).first().click();
    await expect(projectQuestionCard(page)).not.toBeVisible({
        timeout: 15_000,
    });

    await page.goto(PROJECT_STEP_2_ROUTE.replace(PROJECT_STEP_2_SLUG, PROJECT_STEP_3_SLUG));

    await expect(projectQuestionCard(page)).toContainText(/Question 3 of 3/, {
        timeout: 15_000,
    });
    await expectAnyVisibleEditorToContain(
        page,
        marker,
        "Correct/completed state must not cause starterCode to re-seed over user code",
    );
    await expectNoVisibleEditorToContain(
        page,
        "# TODO",
        "Completed exercise should keep submitted user code instead of starter TODO",
    );
});

test("direct project exercise route navigation does not reuse the previous exercise workspace", async ({
                                                                                                           page,
                                                                                                       }) => {
    await installDeterministicReviewCloneMocks(page);

    await page.goto(PROJECT_STEP_2_ROUTE);

    await expect(projectQuestionCard(page)).toContainText(/Question 2 of 3/, {
        timeout: 15_000,
    });

    await expect(page).toHaveURL(new RegExp(`${PROJECT_STEP_2_SLUG}$`));

    await expectAnyVisibleEditorToContain(
        page,
        Q2_STARTER,
        "Question 2 should start with its own shipping starter",
    );

    const editor = await pickVisibleCodeEditor(page);

    await setEditorValue(
        editor,
        [
            Q2_MARKER,
            Q2_STARTER,
            "print('question 2 direct route marker')",
            "",
        ].join("\n"),
    );

    await expectAnyVisibleEditorToContain(
        page,
        Q2_MARKER,
        "Question 2 marker should be visible before direct route navigation",
    );

    await page.goto(
        PROJECT_STEP_2_ROUTE.replace(PROJECT_STEP_2_SLUG, PROJECT_STEP_3_SLUG),
    );

    await expect(projectQuestionCard(page)).toContainText(/Question 3 of 3/, {
        timeout: 15_000,
    });

    await expect(page).toHaveURL(new RegExp(`${PROJECT_STEP_3_SLUG}$`));

    await expectNoVisibleEditorToContain(
        page,
        Q2_MARKER,
        "Direct route navigation to Question 3 must not reuse Question 2's editor workspace",
    );

    await expectAnyVisibleEditorToContain(
        page,
        Q3_STARTER,
        "Question 3 direct route load should hydrate its own starter workspace",
    );

    await expectAnyVisibleEditorToContain(
        page,
        Q3_STARTER_VALUES,
        "Question 3 direct route load should include its own starter values",
    );
});

test("hard direct reload of the current project exercise does not leak sibling exercise code", async ({
                                                                                                          page,
                                                                                                      }) => {
    test.setTimeout(90_000);

    await installDeterministicReviewCloneMocks(page);

    await page.goto(PROJECT_STEP_2_ROUTE);

    await expect(projectQuestionCard(page)).toContainText(/Question 2 of 3/, {
        timeout: 15_000,
    });

    await expectAnyVisibleEditorToContain(
        page,
        Q2_STARTER,
        "Question 2 should hydrate its starter before editing",
    );

    let editor = await pickVisibleCodeEditor(page);

    await setEditorValue(
        editor,
        [
            Q2_MARKER,
            Q2_STARTER,
            "print('question 2 saved marker')",
            "",
        ].join("\n"),
    );

    await expectAnyVisibleEditorToContain(
        page,
        Q2_MARKER,
        "Question 2 marker should be visible before moving to Question 3",
    );

    await projectQuestionNavigator(page)
        .getByRole("button", { name: /^Next$/i })
        .nth(1)
        .click();

    await expect(projectQuestionCard(page)).toContainText(/Question 3 of 3/, {
        timeout: 15_000,
    });

    await expect(page).toHaveURL(new RegExp(`${PROJECT_STEP_3_SLUG}$`));

    await expectNoVisibleEditorToContain(
        page,
        Q2_MARKER,
        "Question 2 marker should not leak into Question 3 before hard direct load",
    );

    await expectAnyVisibleEditorToContain(
        page,
        Q3_STARTER,
        "Question 3 should hydrate its own starter before editing",
    );

    editor = await pickVisibleCodeEditor(page);

    await setEditorValue(
        editor,
        [
            Q3_MARKER,
            Q3_STARTER,
            "    return sum(xs)",
            "",
            Q3_STARTER_VALUES,
            "print(sum_list(values))",
            "",
        ].join("\n"),
    );

    await expectAnyVisibleEditorToContain(
        page,
        Q3_MARKER,
        "Question 3 marker should be visible before hard direct load",
    );

    await page.goto(
        PROJECT_STEP_2_ROUTE.replace(PROJECT_STEP_2_SLUG, PROJECT_STEP_3_SLUG),
    );

    await expect(projectQuestionCard(page)).toContainText(/Question 3 of 3/, {
        timeout: 15_000,
    });

    await expect(page).toHaveURL(new RegExp(`${PROJECT_STEP_3_SLUG}$`));

    await expectNoVisibleEditorToContain(
        page,
        Q2_MARKER,
        "Hard direct load of Question 3 must not restore sibling Question 2 code",
    );

    await expectAnyVisibleEditorToContain(
        page,
        /def sum_list\(xs\):|E2E_Q3_SUM_LIST_WORKSPACE_MARKER/,
        "Hard direct load of Question 3 should show Question 3 workspace or starter, not sibling code",
    );
});

test("reset module clears project exercise workspace drafts so old question code cannot return", async ({
                                                                                                            page,
                                                                                                        }) => {
    await installDeterministicReviewCloneMocks(page);

    await page.goto(PROJECT_STEP_2_ROUTE);

    await expect(projectQuestionCard(page)).toContainText(/Question 2 of 3/, {
        timeout: 15_000,
    });

    await expect(page).toHaveURL(new RegExp(`${PROJECT_STEP_2_SLUG}$`));

    await expectAnyVisibleEditorToContain(
        page,
        Q2_STARTER,
        "Question 2 should hydrate its own starter before editing",
    );

    await expectAnyVisibleEditorToContain(
        page,
        Q2_STARTER_TODO,
        "Question 2 starter TODO should be present before reset",
    );

    const editor = await pickVisibleCodeEditor(page);

    await setEditorValue(
        editor,
        [
            Q2_MARKER,
            Q2_STARTER,
            "print('this should be cleared by reset module')",
            "",
        ].join("\n"),
    );

    await expectAnyVisibleEditorToContain(
        page,
        Q2_MARKER,
        "Question 2 stale marker should be visible before reset",
    );

    await page.getByTestId("review-reset-module-button").click();

    const dialog = page.getByRole("dialog");

    await expect(dialog).toBeVisible({
        timeout: 15_000,
    });

    await expect(dialog).toContainText(/reset the entire module/i);

    await dialog.getByRole("button", { name: /^Reset$/i }).click();

    await expect(dialog).not.toBeVisible({
        timeout: 15_000,
    });

    /**
     * Re-open the same exercise route after reset.
     *
     * This proves reset cleared local drafts AND that the route can still
     * hydrate its starter workspace instead of rendering a blank editor.
     */
    await page.goto(PROJECT_STEP_2_ROUTE);

    await expect(projectQuestionCard(page)).toContainText(/Question 2 of 3/, {
        timeout: 15_000,
    });

    await expect(page).toHaveURL(new RegExp(`${PROJECT_STEP_2_SLUG}$`));

    await expectNoVisibleEditorToContain(
        page,
        Q2_MARKER,
        "Reset Module must clear stale Question 2 workspace draft",
    );

    await expectNoVisibleEditorToContain(
        page,
        "this should be cleared by reset module",
        "Reset Module must not restore old edited code from local draft storage",
    );

    await expectAnyVisibleEditorToContain(
        page,
        Q2_STARTER,
        "After reset module, Question 2 should rehydrate its clean starter workspace instead of showing a blank editor",
    );

    await expectAnyVisibleEditorToContain(
        page,
        Q2_STARTER_TODO,
        "After reset module, Question 2 starter TODO should be restored",
    );
});

test("reset topic clears project exercise workspace drafts so old question code cannot return", async ({
                                                                                                           page,
                                                                                                       }) => {
    await installDeterministicReviewCloneMocks(page);

    await page.goto(PROJECT_STEP_2_ROUTE);

    await expect(projectQuestionCard(page)).toContainText(/Question 2 of 3/, {
        timeout: 15_000,
    });

    await expectAnyVisibleEditorToContain(
        page,
        Q2_STARTER,
        "Question 2 should hydrate its own starter before editing",
    );

    await expectAnyVisibleEditorToContain(
        page,
        Q2_STARTER_TODO,
        "Question 2 starter TODO should be present before reset topic",
    );

    const editor = await pickVisibleCodeEditor(page);

    await setEditorValue(
        editor,
        [
            Q2_MARKER,
            Q2_STARTER,
            "print('this should be cleared by reset topic')",
            "",
        ].join("\n"),
    );

    await expectAnyVisibleEditorToContain(
        page,
        Q2_MARKER,
        "Question 2 stale marker should be visible before reset topic",
    );

    await page.getByRole("button", { name: /reset topic/i }).first().click();

    const dialog = page.getByRole("dialog");

    await expect(dialog).toBeVisible({
        timeout: 15_000,
    });

    await dialog.getByRole("button", { name: /^Reset$/i }).click();

    await expect(dialog).not.toBeVisible({
        timeout: 15_000,
    });

    await page.goto(PROJECT_STEP_2_ROUTE);

    await expect(projectQuestionCard(page)).toContainText(/Question 2 of 3/, {
        timeout: 15_000,
    });

    await expectNoVisibleEditorToContain(
        page,
        Q2_MARKER,
        "Reset Topic must clear stale Question 2 workspace draft",
    );

    await expectNoVisibleEditorToContain(
        page,
        "this should be cleared by reset topic",
        "Reset Topic must not restore old edited code from local draft storage",
    );

    await expectAnyVisibleEditorToContain(
        page,
        Q2_STARTER,
        "After reset topic, Question 2 should rehydrate its clean starter workspace instead of showing a blank editor",
    );

    await expectAnyVisibleEditorToContain(
        page,
        Q2_STARTER_TODO,
        "After reset topic, Question 2 starter TODO should be restored",
    );
});

test("reset module navigates to the first topic card instead of staying on the old exercise route", async ({
                                                                                                               page,
                                                                                                           }) => {
    await installDeterministicReviewCloneMocks(page);

    await page.goto(PROJECT_STEP_2_ROUTE);

    await expect(projectQuestionCard(page)).toContainText(/Question 2 of 3/, {
        timeout: 15_000,
    });

    await expect(page).toHaveURL(new RegExp(`${PROJECT_STEP_2_SLUG}$`));

    await page.getByTestId("review-reset-module-button").click();

    const dialog = page.getByRole("dialog");

    await expect(dialog).toBeVisible({
        timeout: 15_000,
    });

    await dialog.getByRole("button", { name: /^Reset$/i }).click();

    await expect(dialog).not.toBeVisible({
        timeout: 15_000,
    });

    await expect
        .poll(
            async () => page.url(),
            {
                timeout: 15_000,
                message:
                    "Reset Module should navigate away from the old project exercise route",
            },
        )
        .not.toContain(PROJECT_STEP_2_SLUG);

    const urlAfterReset = page.url();

    expect(urlAfterReset).toContain("/learn/");
    expect(urlAfterReset).toContain("/e2e-section/e2e-review-topic/");
    expect(urlAfterReset).toContain("/text/e2e-reading");
    expect(urlAfterReset).not.toContain(PROJECT_STEP_2_SLUG);

    const shell = page.locator("main, [role='main'], body").first();

    await expect(
        shell,
        `Expected review shell/body after reset. URL: ${urlAfterReset}`,
    ).toBeVisible({
        timeout: 15_000,
    });

    await expect(shell).toContainText(/Item 1 of/i, {
        timeout: 15_000,
    });

    await expect(shell).toContainText(/Read before coding|E2E Review Topic/i, {
        timeout: 15_000,
    });

    await expect(shell).not.toContainText(/Question 2 of 3/);
    await expect(shell).not.toContainText(/Build a shipping helper/i);
    await expect(shell).not.toContainText(Q2_MARKER);
});

test("reset topic navigates to the first card of the same topic instead of staying on the old exercise route", async ({
                                                                                                                          page,
                                                                                                                      }) => {
    await installDeterministicReviewCloneMocks(page);

    await page.goto(PROJECT_STEP_2_ROUTE);

    await expect(projectQuestionCard(page)).toContainText(/Question 2 of 3/, {
        timeout: 15_000,
    });

    await expect(page).toHaveURL(new RegExp(`${PROJECT_STEP_2_SLUG}$`));

    await page.getByRole("button", { name: /reset topic/i }).first().click();

    const dialog = page.getByRole("dialog");

    await expect(dialog).toBeVisible({
        timeout: 15_000,
    });

    await dialog.getByRole("button", { name: /^Reset$/i }).click();

    await expect(dialog).not.toBeVisible({
        timeout: 15_000,
    });

    await expect(page).not.toHaveURL(new RegExp(`${PROJECT_STEP_2_SLUG}$`), {
        timeout: 15_000,
    });

    await expect(page.getByRole("main")).toContainText(/Item 1 of/i, {
        timeout: 15_000,
    });

    await expect(page.getByRole("main")).not.toContainText(/Question 2 of 3/);
});




function withProgressiveLock(url: string) {
    return `${url}?progressive=1`;
}

function freshModuleProgress() {
    return {
        topics: {
            "e2e-review-topic": {
                readingDone: {},
                cardsDone: {},
                quizzesDone: {},
                quizState: {},
            },
        },
    };
}

function projectProgressWithStep2Incomplete() {
    return {
        topics: {
            "e2e-review-topic": {
                readingDone: {
                    "e2e-reading": true,
                },
                cardsDone: {},
                quizzesDone: {
                    "review-clone-practice-quiz": true,
                },
                quizState: {
                    "review-clone-project": {
                        answers: {},
                        checkedById: {},
                        excusedById: {},
                        practiceMeta: {
                            "e2e-print-name": {
                                attempts: 1,
                                ok: true,
                            },
                            "e2e-project-step-2": {
                                attempts: 0,
                                ok: false,
                            },
                            "e2e-project-step-3": {
                                attempts: 0,
                                ok: false,
                            },
                        },
                    },
                },
            },
        },
    };
}

test("direct URL to locked project exercise redirects to earliest unlocked target", async ({
                                                                                               page,
                                                                                           }) => {
    await installDeterministicReviewCloneMocks(page, {
        initialProgress: freshModuleProgress(),
    });

    await page.goto(withProgressiveLock(PROJECT_STEP_2_ROUTE));

    await expect(page.getByRole("main")).toBeVisible({
        timeout: 30_000,
    });

    await expect
        .poll(async () => page.url(), {
            timeout: 15_000,
            message:
                "Locked direct exercise URL should redirect to the first unlocked reading card",
        })
        .toContain("/text/e2e-reading");

    await expect(page).not.toHaveURL(new RegExp(`${PROJECT_STEP_2_SLUG}$`));
    await expect(page.locator(".monaco-editor")).toHaveCount(0);
});

test("direct URL to locked project exercise does not create or overwrite workspace progress", async ({
                                                                                                         page,
                                                                                                     }) => {
    const savedBodies: any[] = [];

    await installDeterministicReviewCloneMocks(page, {
        initialProgress: freshModuleProgress(),
        savedBodies,
    });

    await page.goto(withProgressiveLock(PROJECT_STEP_2_ROUTE));

    await expect(page.getByRole("main")).toBeVisible({
        timeout: 30_000,
    });

    await expect
        .poll(async () => page.url(), {
            timeout: 15_000,
            message:
                "Locked direct exercise URL should redirect before hydrating the locked exercise workspace",
        })
        .toContain("/text/e2e-reading");

    await page.waitForTimeout(1_000);

    const serialized = JSON.stringify(savedBodies);

    expect(serialized).not.toContain("e2e-project-step-2");
    expect(serialized).not.toContain(Q2_STARTER);
    expect(serialized).not.toContain(Q2_STARTER_TODO);
});
test("project question Next is disabled before current exercise is complete", async ({
                                                                                         page,
                                                                                     }) => {
    await installDeterministicReviewCloneMocks(page, {
        initialProgress: projectProgressWithStep2Incomplete(),
    });

    await page.goto(withProgressiveLock(PROJECT_STEP_2_ROUTE));

    await expect(projectQuestionCard(page)).toContainText(/Question 2 of 3/, {
        timeout: 15_000,
    });

    await expect(page).toHaveURL(new RegExp(`${PROJECT_STEP_2_SLUG}(?:\\?.*)?$`));

    const nextButton = projectQuestionNavigator(page)
        .getByRole("button", { name: /^Next$/i })
        .nth(1);

    await expect(nextButton).toBeDisabled({
        timeout: 15_000,
    });

    await expect(projectQuestionCard(page)).not.toContainText(/Question 3 of 3/);
    await expect(page.getByText(/complete this step to continue/i)).toHaveCount(0);
});
test("project question Previous can return to completed previous exercise while future exercise stays locked", async ({
                                                                                                                          page,
                                                                                                                      }) => {
    await installDeterministicReviewCloneMocks(page, {
        initialProgress: projectProgressWithStep2Incomplete(),
    });

    await page.goto(withProgressiveLock(PROJECT_STEP_2_ROUTE));

    await expect(projectQuestionCard(page)).toContainText(/Question 2 of 3/, {
        timeout: 15_000,
    });

    await projectQuestionNavigator(page)
        .getByRole("button", { name: /^Previous$/i })
        .nth(1)
        .click();

    await expect(projectQuestionCard(page)).toContainText(/Question 1 of 3/, {
        timeout: 15_000,
    });

    await projectQuestionNavigator(page)
        .getByRole("button", { name: /^Next$/i })
        .nth(1)
        .click();

    await expect(projectQuestionCard(page)).toContainText(/Question 2 of 3/, {
        timeout: 15_000,
    });

    const step2Url = page.url();

    const nextButton = projectQuestionNavigator(page)
        .getByRole("button", { name: /^Next$/i })
        .nth(1);

    await expect(nextButton).toBeDisabled({
        timeout: 15_000,
    });

    await expect(page).toHaveURL(step2Url);
    await expect(projectQuestionCard(page)).toContainText(/Question 2 of 3/, {
        timeout: 15_000,
    });
    await expect(projectQuestionCard(page)).not.toContainText(/Question 3 of 3/);
    await expect(page.getByText(/complete this step to continue/i)).toHaveCount(0);
});
test("sidebar topic click cannot bypass progressive unlock when module is fresh", async ({
                                                                                             page,
                                                                                         }) => {
    await installDeterministicReviewCloneMocks(page, {
        initialProgress: freshModuleProgress(),
    });

    await page.goto(withProgressiveLock(PROJECT_STEP_2_ROUTE));

    await expect(page.getByRole("main")).toBeVisible({
        timeout: 30_000,
    });

    await expect
        .poll(async () => page.url(), {
            timeout: 15_000,
            message:
                "Fresh module should redirect locked exercise route to first reading card",
        })
        .toContain("/text/e2e-reading");

    const beforeUrl = page.url();

    const sidebarButtons = page
        .getByRole("button")
        .filter({ hasText: /E2E Review Topic|Review Clone Project A|Build/i });

    if ((await sidebarButtons.count()) > 0) {
        await sidebarButtons.last().click({ force: true });
    }

    await expect(page).toHaveURL(beforeUrl);
    await expect(page.locator(".monaco-editor")).toHaveCount(0);
});

test("correct project check auto-advances to next exercise under progressive lock", async ({ page }) => {
    await installDeterministicReviewCloneMocks(page, {
        initialProgress: projectProgressWithStep2Incomplete(),
    });

    await page.goto(withProgressiveLock(PROJECT_STEP_2_ROUTE));

    await expect(projectQuestionCard(page)).toContainText(/Question 2 of 3/, {
        timeout: 15_000,
    });

    await replaceMonacoText(page, Q2_SOLUTION);

    await projectQuestionCard(page)
        .getByRole("button", { name: /check this answer/i })
        .click();

    await expect(projectQuestionCard(page)).toContainText(/Question 3 of 3/, {
        timeout: 15_000,
    });

    await expect(page).toHaveURL(new RegExp(`${PROJECT_STEP_3_SLUG}(?:\\?.*)?$`));
});

test("wrong project check stays on current exercise under progressive lock", async ({ page }) => {
    await installDeterministicReviewCloneMocks(page, {
        initialProgress: projectProgressWithStep2Incomplete(),
    });

    await page.goto(withProgressiveLock(PROJECT_STEP_2_ROUTE));

    await expect(projectQuestionCard(page)).toContainText(/Question 2 of 3/, {
        timeout: 15_000,
    });

    await replaceMonacoText(page, `print("wrong")`);

    await projectQuestionCard(page)
        .getByRole("button", { name: /check this answer/i })
        .click();

    await expect(projectQuestionCard(page)).toContainText(/Question 2 of 3/, {
        timeout: 5_000,
    });

    await expect(projectQuestionCard(page)).not.toContainText(/Question 3 of 3/);

    await expect(page).toHaveURL(new RegExp(`${PROJECT_STEP_2_SLUG}(?:\\?.*)?$`));
});

test("Mark as read advances to next card without showing the progressive lock banner", async ({ page }) => {
    await installDeterministicReviewCloneMocks(page, {
        initialProgress: freshModuleProgress(),
    });

    await page.goto(withProgressiveLock(FIRST_READING_CARD_ROUTE));

    await expect(page).toHaveURL(new RegExp(`${FIRST_READING_CARD_SLUG}(?:\\?.*)?$`), {
        timeout: 15_000,
    });

    const main = page.getByRole("main");

    const markAsReadButton = main
        .getByRole("button", { name: /mark as read|complete|continue/i })
        .first();

    await expect(markAsReadButton).toBeEnabled({
        timeout: 15_000,
    });

    await markAsReadButton.click();

    await expect(page).not.toHaveURL(new RegExp(`${FIRST_READING_CARD_SLUG}(?:\\?.*)?$`), {
        timeout: 15_000,
    });

    await expect(page.getByText(/complete this step to continue/i)).toHaveCount(0);
});