import { test, expect, type Page } from "@playwright/test";

// Zoeskoul E2E suite pruning: this file is opt-in.
test.skip(process.env.RUN_E2E_LEGACY !== "1", "Legacy broad E2E suite is opt-in. Run with RUN_E2E_LEGACY=1 or pnpm test:e2e:legacy.");


test.describe.configure({ mode: "serial" });

const BASE =
    "/en/dev/e2e/review-module-clone/python/e2e-review-clone/learn/e2e-section/e2e-review-topic";

const EXERCISE_A_URL = `${BASE}/exercise/e2e-print-name`;
const EXERCISE_B_URL = `${BASE}/exercise/e2e-helper-name`;
const BLANK_EXERCISE_URL = `${BASE}/exercise/e2e-blank-fallback`;
const READING_URL = `${BASE}/card/e2e-reading`;
const INVALID_EXERCISE_URL = `${BASE}/exercise/e2e-does-not-exist`;

async function mockNonProgressReviewCloneApis(page: Page) {
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
    let savedProgress: unknown = { progress: null };
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
        resetProgress: () => {
            savedProgress = { progress: null };
            savedBodies.length = 0;
        },
    };
}

async function installFailingProgressSaveMock(page: Page) {
    const savedBodies: any[] = [];

    await page.route("**/api/review/progress**", async (route) => {
        const request = route.request();

        if (request.method() === "GET") {
            return route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ progress: null }),
            });
        }

        if (request.method() === "PUT") {
            const body = request.postDataJSON();
            savedBodies.push(body);

            return route.fulfill({
                status: 500,
                contentType: "application/json",
                body: JSON.stringify({
                    ok: false,
                    message: "e2e forced save failure",
                }),
            });
        }

        return route.fallback();
    });

    return { savedBodies };
}

async function installRunCaptureMock(page: Page) {
    const runBodies: string[] = [];

    await page.route("**/api/run/judge0", async (route) => {        const request = route.request();

        if (request.method() !== "POST") {
            return route.fallback();
        }

        runBodies.push(request.postData() ?? "");

        return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                ok: true,
                stdout: "e2e run ok\n",
                stderr: "",
                output: "e2e run ok\n",
                result: {
                    stdout: "e2e run ok\n",
                    stderr: "",
                    output: "e2e run ok\n",
                },
            }),
        });
    });

    return { runBodies };
}

async function gotoCloneUrl(page: Page, url: string) {
    const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
    });

    expect(response?.status()).toBeLessThan(400);

    await expect(page.locator("body")).toContainText(
        "E2E Real Review Module Clone",
        { timeout: 20_000 },
    );
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
                message: `Expected at least one saved progress payload to contain ${marker}`,
            },
        )
        .toBe(true);
}

async function waitForRunPayloadContaining(runBodies: string[], marker: string) {
    await expect
        .poll(
            () => runBodies.some((body) => body.includes(marker)),
            {
                timeout: 30_000,
                message: `Expected run request payload to contain ${marker}`,
            },
        )
        .toBe(true);
}

async function expectBodyContains(page: Page, marker: string) {
    await expect(page.locator("body")).toContainText(marker, {
        timeout: 20_000,
    });
}

async function expectBodyNotContains(page: Page, marker: string) {
    await expect(page.locator("body")).not.toContainText(marker, {
        timeout: 10_000,
    });
}

async function expectExerciseAStarter(page: Page) {
    await expect(page.locator("body")).toContainText("ZoeSkoul learner", {
        timeout: 20_000,
    });

    await expect(page.locator("body")).toContainText("helper.py", {
        timeout: 20_000,
    });
}

async function expectExerciseBStarter(page: Page) {
    await expect(page.locator("body")).toContainText(
        "second exercise starter marker",
        { timeout: 20_000 },
    );

    await expect(page.locator("body")).toContainText("main.py", {
        timeout: 20_000,
    });
}

async function expectBlankFallback(page: Page) {
    await expect(page.locator(".monaco-editor").first()).toBeVisible({
        timeout: 30_000,
    });

    await expect(page.locator("body")).not.toContainText("ZoeSkoul learner", {
        timeout: 10_000,
    });

    await expect(page.locator("body")).not.toContainText(
        "second exercise starter marker",
        { timeout: 10_000 },
    );
}

async function clickRunButton(page: Page) {
    const runButton = page.getByTestId("code-runner-run-button").first();

    await expect(runButton).toBeVisible({
        timeout: 20_000,
    });

    await expect(runButton).toBeEnabled({
        timeout: 20_000,
    });

    await runButton.click();
}

test.describe("review module clone hardening", () => {
    test("run uses the visible Monaco editor workspace, not stale starter code", async ({
                                                                                            page,
                                                                                        }) => {
        await mockNonProgressReviewCloneApis(page);

        const { savedBodies } = await installProgressRoundTripMock(page);
        const { runBodies } = await installRunCaptureMock(page);

        const marker = "visible_editor_code_sent_to_runner_marker";

        await gotoCloneUrl(page, EXERCISE_A_URL);
        await expectExerciseAStarter(page);

        await replaceMonacoText(page, `print('${marker}')`);

        await expectBodyContains(page, marker);
        await waitForSavedPayloadContaining(savedBodies, marker);

        await clickRunButton(page);

        await waitForRunPayloadContaining(runBodies, marker);
    });

    test("failed progress save does not wipe the visible local editor workspace", async ({
                                                                                             page,
                                                                                         }) => {
        await mockNonProgressReviewCloneApis(page);

        const { savedBodies } = await installFailingProgressSaveMock(page);

        const marker = "failed_save_keeps_local_editor_marker";

        await gotoCloneUrl(page, EXERCISE_A_URL);
        await expectExerciseAStarter(page);

        await replaceMonacoText(page, `print('${marker}')`);

        await expectBodyContains(page, marker);

        await expect
            .poll(
                () =>
                    savedBodies.some((body) =>
                        JSON.stringify(body).includes(marker),
                    ),
                {
                    timeout: 40_000,
                    message:
                        "Expected failed progress save attempt to contain local edit marker",
                },
            )
            .toBe(true);

        await expectBodyContains(page, marker);

        await expect(page.locator("body")).not.toContainText(
            "e2e forced save failure wiped editor",
        );
    });

    test("direct URLs load the correct starter workspace for each route target", async ({
                                                                                            page,
                                                                                        }) => {
        await mockNonProgressReviewCloneApis(page);

        const { resetProgress } = await installProgressRoundTripMock(page);

        resetProgress();

        await gotoCloneUrl(page, EXERCISE_A_URL);
        await expectExerciseAStarter(page);
        await expectBodyNotContains(page, "second exercise starter marker");

        await gotoCloneUrl(page, EXERCISE_B_URL);
        await expectExerciseBStarter(page);
        await expectBodyNotContains(page, "ZoeSkoul learner");

        await gotoCloneUrl(page, BLANK_EXERCISE_URL);
        await expectBlankFallback(page);

        await gotoCloneUrl(page, READING_URL);

        await expect(page.locator("body")).toContainText("Read before coding", {
            timeout: 20_000,
        });
    });

    test("invalid exercise target does not leak the previous exercise workspace", async ({
                                                                                             page,
                                                                                         }) => {
        await mockNonProgressReviewCloneApis(page);

        const { savedBodies } = await installProgressRoundTripMock(page);

        const marker = "invalid_target_must_not_leak_previous_workspace_marker";

        await gotoCloneUrl(page, EXERCISE_A_URL);
        await expectExerciseAStarter(page);

        await replaceMonacoText(page, `print('${marker}')`);

        await expectBodyContains(page, marker);
        await waitForSavedPayloadContaining(savedBodies, marker);

        await gotoCloneUrl(page, INVALID_EXERCISE_URL);

        await expectBodyNotContains(page, marker);

        await expect(page.locator("body")).not.toContainText(
            "Bound to: python:e2e-review-clone:e2e-section:e2e-review-topic:review-clone-project:e2e-print-name",
            { timeout: 10_000 },
        );
    });

    test("saved progress still beats manifest starter after direct route navigation", async ({
                                                                                                 page,
                                                                                             }) => {
        await mockNonProgressReviewCloneApis(page);

        const { savedBodies } = await installProgressRoundTripMock(page);

        const marker = "direct_route_saved_progress_priority_marker";

        await gotoCloneUrl(page, EXERCISE_B_URL);
        await expectExerciseBStarter(page);

        await replaceMonacoText(page, `print('${marker}')`);

        await expectBodyContains(page, marker);
        await waitForSavedPayloadContaining(savedBodies, marker);

        await gotoCloneUrl(page, EXERCISE_A_URL);
        await expectExerciseAStarter(page);
        await expectBodyNotContains(page, marker);

        await gotoCloneUrl(page, EXERCISE_B_URL);
        await expectBodyContains(page, marker);
    });

    test("reading card does not bind to a code exercise workspace", async ({
                                                                               page,
                                                                           }) => {
        await mockNonProgressReviewCloneApis(page);

        const { savedBodies } = await installProgressRoundTripMock(page);

        const marker = "reading_card_should_not_bind_code_workspace_marker";

        await gotoCloneUrl(page, EXERCISE_A_URL);
        await expectExerciseAStarter(page);

        await replaceMonacoText(page, `print('${marker}')`);

        await expectBodyContains(page, marker);
        await waitForSavedPayloadContaining(savedBodies, marker);

        await gotoCloneUrl(page, READING_URL);

        await expect(page.locator("body")).toContainText("Read before coding", {
            timeout: 20_000,
        });

        await expectBodyNotContains(page, marker);

        await expect(page.locator("body")).toContainText("Not bound", {
            timeout: 20_000,
        });
    });
});