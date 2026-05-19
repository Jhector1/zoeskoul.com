import { expect, test, type Page } from "@playwright/test";

test.use({
    viewport: {
        width: 1440,
        height: 1000,
    },
});

const REAL_SUM_LIST_ROUTE =
    "/en/catalog/python/subjects/python/modules/python-2/learn/python-2-control-flow-collections/functions-basics/exercise/sum-list";

const REAL_SUM_LIST_E2E_UNLOCK_ROUTE = `${REAL_SUM_LIST_ROUTE}?e2eUnlockAll=1`;

const SUM_LIST_SLUG = "/exercise/sum-list";
const NEXT_QUIZ_SLUG = "/quiz/functions-basics-q5";

const PRACTICE_FIXTURES = {
    m2_func_total_with_tip_code: {
        title: "Build `total_with_tip(bill, pct)`",
        starterCode:
            "def total_with_tip(bill, pct):\n    # TODO: compute tip using integer math\n    # TODO: return total\n    pass\n\nbill = int(input())\npct = int(input())\n# TODO: call the function and print Total = <total>\n",
        solutionCode:
            "def total_with_tip(bill, pct):\n    tip = bill * pct // 100\n    return bill + tip\n\nbill = int(input())\npct = int(input())\ntotal = total_with_tip(bill, pct)\nprint(f\"Total = {total}\")\n",
    },
    m2_func_shipping_rule_code: {
        title: "Build `shipping_cost(total)`",
        starterCode:
            "def shipping_cost(total):\n    # TODO: return 0 or 7\n    pass\n\ntotal = int(input())\n# TODO: print Shipping = <cost>\n",
        solutionCode:
            "def shipping_cost(total):\n    if total >= 50:\n        return 0\n    else:\n        return 7\n\ntotal = int(input())\nprint(f\"Shipping = {shipping_cost(total)}\")\n",
    },
    m2_func_sum_list_code: {
        title: "Build `sum_list(xs)`",
        starterCode:
            "def sum_list(xs):\n    # TODO: loop and add\n    pass\n\na = int(input())\nb = int(input())\nc = int(input())\nxs = [a, b, c]\n# TODO: print sum = <sum_list(xs)>\n",
        solutionCode:
            "def sum_list(xs):\n    total = 0\n    for x in xs:\n        total = total + x\n    return total\n\na = int(input())\nb = int(input())\nc = int(input())\nxs = [a, b, c]\nprint(f\"sum = {sum_list(xs)}\")\n",
    },
} as const;

async function installRealSumListMocks(page: Page) {
    await page.route("**/api/review/progress**", async (route) => {
        const request = route.request();

        if (request.method() === "GET") {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    progress: {
                        activeTopicId: "functions_basics",
                        quizVersion: 1,
                        topics: {
                            functions_basics: {
                                readingDone: {
                                    sketch0: true,
                                    sketch1: true,
                                    sketch2: true,
                                    sketch3: true,
                                    functions_basics_p0: true,
                                    functions_basics_p1: true,
                                    functions_basics_p2: true,
                                    functions_basics_p3: true,
                                    why_functions: true,
                                    def_and_call: true,
                                    parameters_and_return: true,
                                    scope_and_reuse: true,
                                },
                                cardsDone: {},
                                quizzesDone: {
                                    project: true,
                                    functions_basics_p4: true,
                                },
                                completed: false,
                                quizState: {
                                    project: {
                                        answers: {},
                                        checkedById: {},
                                        excusedById: {},
                                        practiceMeta: {
                                            m2_func_total_with_tip_code: {
                                                attempts: 1,
                                                ok: true,
                                            },
                                            m2_func_shipping_rule_code: {
                                                attempts: 1,
                                                ok: true,
                                            },
                                            m2_func_sum_list_code: {
                                                attempts: 1,
                                                ok: true,
                                            },
                                        },
                                    },
                                    functions_basics_p4: {
                                        answers: {},
                                        checkedById: {},
                                        excusedById: {},
                                        practiceMeta: {
                                            m2_func_total_with_tip_code: {
                                                attempts: 1,
                                                ok: true,
                                            },
                                            m2_func_shipping_rule_code: {
                                                attempts: 1,
                                                ok: true,
                                            },
                                            m2_func_sum_list_code: {
                                                attempts: 1,
                                                ok: true,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                }),
            });
            return;
        }

        if (request.method() === "PUT") {
            const body = request.postDataJSON();
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ ok: true, state: body.state }),
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
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ doc: null, ok: true }),
        });
    });

    await page.route(
        (url) => url.pathname === "/api/review/quiz",
        async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    quizKey: "real-sum-list-route-navigation-quiz",
                    questions: [
                        {
                            kind: "practice",
                            id: "proj:total_with_tip:e2e",
                            title: "Build `total_with_tip(bill, pct)`",
                            fetch: {
                                subject: "python",
                                module: "python-2",
                                section: "python-2-control-flow-collections",
                                topic: "functions_basics",
                                difficulty: "easy",
                                allowReveal: true,
                                preferPurpose: "project",
                                preferKind: "code_input",
                                exerciseKey: "m2_func_total_with_tip_code",
                                seedPolicy: "global",
                            },
                            maxAttempts: 10,
                        },
                        {
                            kind: "practice",
                            id: "proj:shipping_cost:e2e",
                            title: "Build `shipping_cost(total)`",
                            fetch: {
                                subject: "python",
                                module: "python-2",
                                section: "python-2-control-flow-collections",
                                topic: "functions_basics",
                                difficulty: "easy",
                                allowReveal: true,
                                preferPurpose: "project",
                                preferKind: "code_input",
                                exerciseKey: "m2_func_shipping_rule_code",
                                seedPolicy: "global",
                            },
                            maxAttempts: 10,
                        },
                        {
                            kind: "practice",
                            id: "proj:sum_list:e2e",
                            title: "Build `sum_list(xs)`",
                            fetch: {
                                subject: "python",
                                module: "python-2",
                                section: "python-2-control-flow-collections",
                                topic: "functions_basics",
                                difficulty: "easy",
                                allowReveal: true,
                                preferPurpose: "project",
                                preferKind: "code_input",
                                exerciseKey: "m2_func_sum_list_code",
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
            const url = new URL(route.request().url());
            const exerciseKey =
                url.searchParams.get("exerciseKey") ?? "m2_func_total_with_tip_code";
            const fixture =
                PRACTICE_FIXTURES[
                    exerciseKey as keyof typeof PRACTICE_FIXTURES
                    ] ?? PRACTICE_FIXTURES.m2_func_total_with_tip_code;

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
                        workspace: {
                            language: "python",
                            entryFile: "main.py",
                            starterFiles: {
                                "main.py": fixture.starterCode,
                            },
                            solutionFiles: {
                                "main.py": fixture.solutionCode,
                            },
                        },
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
}

test("real sum-list catalog route top-level Next does not snap back to the project exercise", async ({
                                                                                                         page,
                                                                                                     }) => {
    await installRealSumListMocks(page);
    await page.goto(REAL_SUM_LIST_E2E_UNLOCK_ROUTE);

    const main = page.getByRole("main");
    const projectCard = main
        .locator("section, article, div")
        .filter({ hasText: "Project: Reusable helpers" })
        .filter({ hasText: /Question \d+ of 3/ })
        .first();
    const topicNavigator = main
        .locator(".ui-surface-muted")
        .filter({ hasText: "Item 5 of 6" })
        .first();

    await expect(page).toHaveURL(new RegExp(`${SUM_LIST_SLUG}(?:\\?.*)?$`));
    await expect(projectCard).toContainText("Project: Reusable helpers", {
        timeout: 15_000,
    });
    await expect(topicNavigator).toContainText("Item 5 of 6", {
        timeout: 15_000,
    });
    await expect(projectCard).toContainText("Question 3 of 3", {
        timeout: 15_000,
    });

    await topicNavigator.getByRole("button", { name: /^Next$/i }).click();

    await expect(page).not.toHaveURL(new RegExp(`${SUM_LIST_SLUG}(?:\\?.*)?$`), {
        timeout: 15_000,
    });
    await expect(page).toHaveURL(new RegExp(`${NEXT_QUIZ_SLUG}(?:\\?.*)?$`), {
        timeout: 15_000,
    });
    await expect(main).toContainText("Item 6 of 6", {
        timeout: 15_000,
    });

    await page.waitForTimeout(3_000);
    await expect(page).not.toHaveURL(new RegExp(`${SUM_LIST_SLUG}(?:\\?.*)?$`));
});