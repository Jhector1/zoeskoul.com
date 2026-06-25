import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

// Zoeskoul E2E suite pruning: this file is opt-in.
test.skip(process.env.RUN_E2E_LEGACY !== "1", "Legacy broad E2E suite is opt-in. Run with RUN_E2E_LEGACY=1 or pnpm test:e2e:legacy.");


test.use({
    viewport: {
        width: 1440,
        height: 1000,
    },
});




const LAST_PROJECT_EXERCISE_ROUTE =
    "/en/dev/e2e/review-module-clone/python/e2e-review-clone/learn/e2e-section/e2e-review-topic/exercise/e2e-project-step-3";
const LAST_PROJECT_EXERCISE_SLUG = "/exercise/e2e-project-step-3";
const MIDDLE_PROJECT_EXERCISE_SLUG = "/exercise/e2e-project-step-2";

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

async function installDeterministicReviewCloneMocks(
    page: Page,
    options: {
        projectADone?: boolean;
    } = {},
) {
    await page.route("**/api/review/progress**", async (route) => {
        const request = route.request();

        if (request.method() === "GET") {
            const progress = options.projectADone
                ? {
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
                                    practiceMeta: {
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
                                },
                            },
                        },
                    },
                }
                : null;

            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ progress }),
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
                    quizKey: "e2e-project-route-navigation-quiz-key",
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
            const exerciseKey = route.request().url()
                ? new URL(route.request().url()).searchParams.get("exerciseKey") ?? "e2e-print-name"
                : "e2e-print-name";
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
}

function projectQuestionCard(page: Page) {
    const main = page.getByRole("main");

    return main
        .locator("section, article, div")
        .filter({ hasText: "Review Clone Project A" })
        .filter({ hasText: /Question \d+ of 3/ })
        .first();
}

function projectQuestionNavigator(projectCard: ReturnType<typeof projectQuestionCard>) {
    return projectCard
        .locator("section, article, div")
        .filter({ hasText: /Question \d+ of 3/ })
        .first();
}

test("project exercise Previous/Next changes the active exercise route instead of snapping back to the same question", async ({
                                                                                                                                  page,
                                                                                                                              }) => {
    await installDeterministicReviewCloneMocks(page, {
        projectADone: true,
    });

    await page.goto(LAST_PROJECT_EXERCISE_ROUTE);

    const projectCard = projectQuestionCard(page);
    const questionNav = projectQuestionNavigator(projectCard);

    await expect(projectCard).toContainText("Review Clone Project A", {
        timeout: 15_000,
    });
    await expect(projectCard).toContainText(/Question 3 of 3/, {
        timeout: 15_000,
    });
    await expect(page).toHaveURL(new RegExp(`${LAST_PROJECT_EXERCISE_SLUG}$`));

    await questionNav.getByRole("button", { name: /^Previous$/i }).nth(1).click();

    await expect(projectCard).toContainText(/Question 2 of 3/, {
        timeout: 15_000,
    });

    await expect(page).not.toHaveURL(new RegExp(`${LAST_PROJECT_EXERCISE_SLUG}$`));
    await expect(page).toHaveURL(new RegExp(`${MIDDLE_PROJECT_EXERCISE_SLUG}$`));

    await questionNav.getByRole("button", { name: /^Next$/i }).nth(1).click();

    await expect(projectCard).toContainText(/Question 3 of 3/, {
        timeout: 15_000,
    });
    await expect(page).toHaveURL(new RegExp(`${LAST_PROJECT_EXERCISE_SLUG}$`));
});

test("top-level topic Next from a route-owned project exercise navigates to the next topic item without snapping back", async ({
                                                                                                                                   page,
                                                                                                                               }) => {
    await installDeterministicReviewCloneMocks(page, {
        projectADone: true,
    });

    await page.goto(LAST_PROJECT_EXERCISE_ROUTE);

    const main = page.getByRole("main");

    await expect(projectQuestionCard(page)).toContainText("Review Clone Project A", {
        timeout: 15_000,
    });

    await expect(projectQuestionCard(page)).toContainText(/Question 3 of 3/, {
        timeout: 15_000,
    });

    await expect(page).toHaveURL(new RegExp(`${LAST_PROJECT_EXERCISE_SLUG}$`));

    /**
     * Dev clone card order is not the same as the real catalog route.
     * In the real video, Project A is Item 5 of 6.
     * In the dev clone fixture, Project A is earlier, usually Item 3 of 5.
     *
     * So do not hardcode "Item 5 of 6". Find the topic-level FlowNavigator
     * whose rendered item contains Project A, then click its enabled Next.
     */
    const topicNav = main
        .locator(".ui-surface-muted")
        .filter({ hasText: /Item \d+ of \d+/i })
        .first();

    await expect(topicNav).toBeVisible({ timeout: 15_000 });

    await expect(topicNav).toContainText(/Item \d+ of \d+/i);

    const nextButtons = topicNav.getByRole("button", { name: /^Next$/i });
    await expect(nextButtons.first()).toBeVisible({ timeout: 15_000 });

    const topLevelNext = nextButtons.first();

    await expect(topLevelNext).toBeEnabled({ timeout: 15_000 });

    await topLevelNext.click();

    await expect(page).not.toHaveURL(new RegExp(`${LAST_PROJECT_EXERCISE_SLUG}$`), {
        timeout: 15_000,
    });

    await expect(main).toContainText(/Review Clone Project B/i, {
        timeout: 15_000,
    });

    await expect
        .poll(
            async () => page.url(),
            {
                timeout: 3_000,
                message:
                    "Top-level item navigation should not snap back to the previous route-owned project exercise",
            },
        )
        .not.toContain(LAST_PROJECT_EXERCISE_SLUG);
});