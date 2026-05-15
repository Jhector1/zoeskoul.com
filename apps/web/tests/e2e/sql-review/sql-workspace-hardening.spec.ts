import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const SQL_EXERCISE_URL =
    "/en/catalog/sql/subjects/sql/modules/sql_module_1/learn/section_1_1/intro-to-select/exercise/show-all-products";

const SQL_TARGET_TOPIC_URL =
    "/en/catalog/sql/subjects/sql/modules/sql_module_1/learn/section_1_1/reading-data-from-a-table/card/reading-data-from-a-table-reading";

const INVALID_SQL_EXERCISE_URL =
    "/en/catalog/sql/subjects/sql/modules/sql_module_1/learn/section_1_1/intro-to-select/exercise/does-not-exist";

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

function completedIntroToSelectProgress() {
    return {
        activeTopicId: "intro_to_select",
        viewTopicId: "intro_to_select",
        topics: {
            intro_to_select: {
                readingDone: {
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
                    project: true,
                    quiz: true,

                    intro_to_select_p4: true,
                    intro_to_select_q5: true,
                },
            },
        },
    };
}

async function mockReviewChromeApis(page: Page) {
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

async function installProgressRoundTripMock(page: Page) {
    let savedProgress: unknown = {
        progress: completedIntroToSelectProgress(),
    };

    const savedBodies: any[] = [];

    await page.route("**/api/review/progress**", async (route) => {
        const request = route.request();

        if (request.method() === "GET") {
            return route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(savedProgress),
            });
        }

        if (request.method() === "PUT") {
            const body = request.postDataJSON();
            savedBodies.push(body);

            savedProgress = {
                progress: body.state,
            };

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

    return {
        savedBodies,
        getSavedProgress: () => savedProgress,
        setSavedProgress: (next: unknown) => {
            savedProgress = next;
        },
        resetToCompletedIntroProgress: () => {
            savedProgress = {
                progress: completedIntroToSelectProgress(),
            };
            savedBodies.length = 0;
        },
    };
}

async function installRunCaptureMock(page: Page) {
    const runBodies: string[] = [];

    await page.route("**/api/run/judge0", async (route) => {
        const request = route.request();

        if (request.method() !== "POST") {
            return route.fallback();
        }

        runBodies.push(request.postData() ?? "");

        return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                ok: true,
                stdout: "sql e2e run ok\n",
                stderr: "",
                output: "sql e2e run ok\n",
                result: {
                    stdout: "sql e2e run ok\n",
                    stderr: "",
                    output: "sql e2e run ok\n",
                },
            }),
        });
    });

    return { runBodies };
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

    await expect(page.locator("body")).toContainText("query.sql", {
        timeout: 20_000,
    });

    await expect(page.locator("body")).toContainText("products", {
        timeout: 20_000,
    });
}

async function gotoTargetTopic(page: Page) {
    const response = await page.goto(SQL_TARGET_TOPIC_URL, {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
    });

    expect(response?.status()).toBeLessThan(400);

    await expect(page.locator("body")).toContainText("Reading Data", {
        timeout: 20_000,
    });
}

async function replaceMonacoText(page: Page, text: string) {
    const editor = page.locator(".monaco-editor").first();
    const viewLines = page.locator(".monaco-editor .view-lines").first();

    await expect(editor).toBeVisible({
        timeout: 30_000,
    });

    await viewLines.click({
        position: {
            x: 120,
            y: 40,
        },
        force: true,
    });

    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Delete");
    await page.keyboard.insertText(text);
}

async function expectEditorContains(page: Page, marker: string) {
    await expect(page.locator("body")).toContainText(marker, {
        timeout: 20_000,
    });
}

async function expectEditorNotContains(page: Page, marker: string) {
    await expect(page.locator("body")).not.toContainText(marker, {
        timeout: 10_000,
    });
}

async function waitForSavedPayloadContaining(
    savedBodies: any[],
    marker: string,
) {
    await expect
        .poll(
            () =>
                savedBodies.some((body) =>
                    JSON.stringify(body).includes(marker),
                ),
            {
                timeout: 40_000,
                message: `Expected saved progress payload to contain ${marker}`,
            },
        )
        .toBe(true);
}

async function waitForRunPayloadContaining(runBodies: string[], marker: string) {
    await expect
        .poll(() => runBodies.some((body) => body.includes(marker)), {
            timeout: 30_000,
            message: `Expected run request payload to contain ${marker}`,
        })
        .toBe(true);
}

async function clickRealRunButton(page: Page) {
    const testIdRunButton = page.getByTestId("code-runner-run-button").first();

    if ((await testIdRunButton.count()) > 0) {
        await expect(testIdRunButton).toBeVisible({
            timeout: 20_000,
        });

        await expect(testIdRunButton).toBeEnabled({
            timeout: 20_000,
        });

        await testIdRunButton.click();
        return;
    }

    const sqlHeaderRunButton = page
        .locator("button")
        .filter({ hasText: /^Run$/ })
        .last();

    await expect(sqlHeaderRunButton).toBeVisible({
        timeout: 20_000,
    });

    await expect(sqlHeaderRunButton).toBeEnabled({
        timeout: 20_000,
    });

    await sqlHeaderRunButton.click();
}

async function clickSqlTab(page: Page, label: "Results" | "Tables" | "ERD") {
    const tab = page.getByRole("button", { name: new RegExp(`^${label}$`, "i") });

    if ((await tab.count()) === 0) {
        return false;
    }

    await expect(tab.first()).toBeVisible({
        timeout: 20_000,
    });

    await tab.first().click();
    return true;
}

test.describe("SQL review workspace hardening", () => {
    test("SQL run uses the visible query.sql editor content, not stale starter code", async ({
                                                                                                 page,
                                                                                             }) => {
        const errorTrap = installReactRuntimeErrorTrap(page);

        await mockReviewChromeApis(page);

        const { savedBodies } = await installProgressRoundTripMock(page);
        const { runBodies } = await installRunCaptureMock(page);

        const marker = "sql_visible_query_sent_to_runner_marker";
        const query = `SELECT '${marker}' AS marker;`;

        await gotoSqlExercise(page);

        await replaceMonacoText(page, query);

        await expectEditorContains(page, marker);
        await waitForSavedPayloadContaining(savedBodies, marker);

        await clickRealRunButton(page);

        await waitForRunPayloadContaining(runBodies, marker);

        errorTrap.assertNoMaximumUpdateDepth();
    });

    test("SQL sidebar topic navigation from an exercise does not trigger FullIDE hydration loop", async ({
                                                                                                             page,
                                                                                                         }) => {
        const errorTrap = installReactRuntimeErrorTrap(page);

        await mockReviewChromeApis(page);
        await installProgressRoundTripMock(page);

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

    test("SQL edited query survives sidebar navigation and direct return to exercise", async ({
                                                                                                  page,
                                                                                              }) => {
        const errorTrap = installReactRuntimeErrorTrap(page);

        await mockReviewChromeApis(page);

        const { savedBodies } = await installProgressRoundTripMock(page);

        const marker = "sql_query_survives_sidebar_navigation_marker";
        const query = `SELECT '${marker}' AS marker;`;

        await gotoSqlExercise(page);

        await replaceMonacoText(page, query);

        await expectEditorContains(page, marker);
        await waitForSavedPayloadContaining(savedBodies, marker);

        const targetTopic = page.getByTestId(SQL_TARGET_TOPIC_TEST_ID);

        await expect(targetTopic).toBeEnabled({
            timeout: 20_000,
        });

        await targetTopic.click();

        await expect(page).toHaveURL(/reading[-_]data[-_]from[-_]a[-_]table/, {
            timeout: 20_000,
        });

        await page.waitForTimeout(1_000);

        errorTrap.assertNoMaximumUpdateDepth();

        await gotoSqlExercise(page);

        await expectEditorContains(page, marker);
        await expect(page.locator("body")).toContainText("query.sql", {
            timeout: 20_000,
        });
    });

    test("SQL Results, Tables, and optional ERD controls do not reset editor or cause hydration loop", async ({
                                                                                                                  page,
                                                                                                              }) => {
        const errorTrap = installReactRuntimeErrorTrap(page);

        await mockReviewChromeApis(page);

        const { savedBodies } = await installProgressRoundTripMock(page);

        const marker = "sql_tabs_should_not_reset_editor_marker";
        const query = `SELECT '${marker}' AS marker;`;

        await gotoSqlExercise(page);

        await replaceMonacoText(page, query);

        await expectEditorContains(page, marker);
        await waitForSavedPayloadContaining(savedBodies, marker);

        await clickSqlTab(page, "Tables");
        await expectEditorContains(page, marker);

        await clickSqlTab(page, "Results");
        await expectEditorContains(page, marker);

        await clickSqlTab(page, "Tables");
        await expectEditorContains(page, marker);

        const erdClicked = await clickSqlTab(page, "ERD");

        if (erdClicked) {
            await expectEditorContains(page, marker);
        }

        await page.waitForTimeout(1_000);

        errorTrap.assertNoMaximumUpdateDepth();
    });

    test("SQL invalid exercise target does not leak previous query or stale dataset binding", async ({
                                                                                                         page,
                                                                                                     }) => {
        const errorTrap = installReactRuntimeErrorTrap(page);

        await mockReviewChromeApis(page);

        const { savedBodies } = await installProgressRoundTripMock(page);

        const marker = "sql_invalid_target_must_not_leak_previous_query_marker";
        const query = `SELECT '${marker}' AS marker;`;

        await gotoSqlExercise(page);

        await replaceMonacoText(page, query);

        await expectEditorContains(page, marker);
        await waitForSavedPayloadContaining(savedBodies, marker);

        const response = await page.goto(INVALID_SQL_EXERCISE_URL, {
            waitUntil: "domcontentloaded",
            timeout: 45_000,
        });

        expect(response?.status()).toBeLessThan(500);

        await expectEditorNotContains(page, marker);

        await expect(page.locator("body")).not.toContainText(
            "Bound to: sql:sql_module_1:section_1_1:intro_to_select:intro_to_select_p4:m1_s01_show_all_products",
            { timeout: 10_000 },
        );

        errorTrap.assertNoMaximumUpdateDepth();
    });

    test("SQL saved progress query beats starter after fresh direct navigation", async ({
                                                                                            page,
                                                                                        }) => {
        const errorTrap = installReactRuntimeErrorTrap(page);

        await mockReviewChromeApis(page);

        const { savedBodies } = await installProgressRoundTripMock(page);

        const marker = "sql_saved_progress_beats_starter_marker";
        const query = `SELECT '${marker}' AS marker;`;

        await gotoSqlExercise(page);

        await replaceMonacoText(page, query);

        await expectEditorContains(page, marker);
        await waitForSavedPayloadContaining(savedBodies, marker);

        await gotoTargetTopic(page);

        await expectEditorNotContains(page, marker);

        await gotoSqlExercise(page);

        await expectEditorContains(page, marker);

        errorTrap.assertNoMaximumUpdateDepth();
    });

    test("SQL dataset/table pane remains available after query edit and navigation return", async ({
                                                                                                       page,
                                                                                                   }) => {
        const errorTrap = installReactRuntimeErrorTrap(page);

        await mockReviewChromeApis(page);

        const { savedBodies } = await installProgressRoundTripMock(page);

        const marker = "sql_dataset_binding_survives_navigation_marker";
        const query = `SELECT '${marker}' AS marker;`;

        await gotoSqlExercise(page);

        await expect(page.locator("body")).toContainText("products", {
            timeout: 20_000,
        });

        await expect(page.locator("body")).toContainText("6 rows", {
            timeout: 20_000,
        });

        await replaceMonacoText(page, query);

        await expectEditorContains(page, marker);
        await waitForSavedPayloadContaining(savedBodies, marker);

        await gotoTargetTopic(page);

        await expectEditorNotContains(page, marker);

        await gotoSqlExercise(page);

        await expectEditorContains(page, marker);

        await clickSqlTab(page, "Tables");

        await expect(page.locator("body")).toContainText("products", {
            timeout: 20_000,
        });

        await expect(page.locator("body")).toContainText("6 rows", {
            timeout: 20_000,
        });

        errorTrap.assertNoMaximumUpdateDepth();
    });
});