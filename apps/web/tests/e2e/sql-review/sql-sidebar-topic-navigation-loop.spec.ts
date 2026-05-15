import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const SQL_EXERCISE_URL =
    "/en/catalog/sql/subjects/sql/modules/sql_module_1/learn/section_1_1/intro-to-select/exercise/show-all-products";

const SQL_TARGET_TOPIC_TEST_ID =
    "review-sidebar-topic-reading_data_from_a_table";

function installReactRuntimeErrorTrap(page: Page) {
    const errors: string[] = [];

    page.on("pageerror", (error) => {
        errors.push(error.message || String(error));
    });

    page.on("console", (message) => {
        if (message.type() !== "error") return;
        errors.push(message.text());
    });

    return {
        errors,
        assertNoMaximumUpdateDepth() {
            expect(
                errors.filter((message) =>
                    message
                        .toLowerCase()
                        .includes("maximum update depth exceeded"),
                ),
                `Expected no React maximum update depth errors. Captured errors:\n${errors.join(
                    "\n\n",
                )}`,
            ).toEqual([]);
        },
    };
}

async function mockReviewChromeApis(page: Page) {
    await page.route("**/api/review/progress**", async (route) => {
        const request = route.request();

        if (request.method() === "GET") {
            return route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    progress: {
                        activeTopicId: "intro_to_select",
                        viewTopicId: "intro_to_select",
                        topics: {
                            intro_to_select: {
                                // raw sketch ids
                                readingDone: {
                                    sketch0: true,
                                    sketch1: true,
                                    sketch2: true,
                                    sketch3: true,

                                    // likely generated sketch/card ids
                                    intro_to_select_s0: true,
                                    intro_to_select_s1: true,
                                    intro_to_select_s2: true,
                                    intro_to_select_s3: true,

                                    intro_to_select_c0: true,
                                    intro_to_select_c1: true,
                                    intro_to_select_c2: true,
                                    intro_to_select_c3: true,
                                },

                                cardsDone: {
                                    sketch0: true,
                                    sketch1: true,
                                    sketch2: true,
                                    sketch3: true,

                                    intro_to_select_s0: true,
                                    intro_to_select_s1: true,
                                    intro_to_select_s2: true,
                                    intro_to_select_s3: true,

                                    intro_to_select_c0: true,
                                    intro_to_select_c1: true,
                                    intro_to_select_c2: true,
                                    intro_to_select_c3: true,
                                },

                                quizzesDone: {
                                    // raw ids
                                    project: true,
                                    quiz: true,

                                    // generated ids seen/likely in the real UI
                                    intro_to_select_p4: true,
                                    intro_to_select_q5: true,
                                },
                            },
                        },
                    },
                }),
            });
        }
        if (request.method() === "PUT") {
            const body = request.postDataJSON();

            return route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    ok: true,
                    state: body.state,
                }),
            });
        }

        return route.fallback();
    });

    await page.route("**/api/review/module-nav**", async (route) => {
        return route.fulfill({
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
        return route.fulfill({
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
        return route.fulfill({
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
            return route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ doc: null }),
            });
        }

        return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true }),
        });
    });
}

async function gotoSqlExercise(page: Page) {
    const response = await page.goto(SQL_EXERCISE_URL, {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
    });

    expect(response?.status()).toBeLessThan(400);

    await expect(page.locator("body")).toContainText("SQL", {
        timeout: 20_000,
    });

    await expect(page.locator(".monaco-editor").first()).toBeVisible({
        timeout: 30_000,
    });

    await expect(page.getByTestId(SQL_TARGET_TOPIC_TEST_ID)).toBeVisible({
        timeout: 20_000,
    });
}

test.describe("SQL review sidebar navigation regression", () => {
    test("clicking a module-sidebar topic from a SQL exercise does not trigger a FullIDE workspace hydration loop", async ({
                                                                                                                               page,
                                                                                                                           }) => {
        const errorTrap = installReactRuntimeErrorTrap(page);

        await mockReviewChromeApis(page);
        await gotoSqlExercise(page);

        const targetTopic = page.getByTestId(SQL_TARGET_TOPIC_TEST_ID);

        await expect(targetTopic).toBeVisible({
            timeout: 20_000,
        });

        await expect(targetTopic).toBeEnabled({
            timeout: 20_000,
        });

        await targetTopic.click();

        await expect(page).toHaveURL(/reading[-_]data[-_]from[-_]a[-_]table/, {
            timeout: 20_000,
        });

        await page.waitForTimeout(1_000);

        errorTrap.assertNoMaximumUpdateDepth();

        await expect(page.locator("body")).not.toContainText(
            "Maximum update depth exceeded",
        );
    });
});