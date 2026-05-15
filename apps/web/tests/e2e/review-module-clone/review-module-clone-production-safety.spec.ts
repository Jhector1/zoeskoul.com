import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const BASE =
    "/en/dev/e2e/review-module-clone/python/e2e-review-clone/learn/e2e-section/e2e-review-topic";

const EXERCISE_A_URL = `${BASE}/exercise/e2e-print-name`;
const EXERCISE_B_URL = `${BASE}/exercise/e2e-helper-name`;
const BLANK_EXERCISE_URL = `${BASE}/exercise/e2e-blank-fallback`;
const READING_URL = `${BASE}/card/e2e-reading`;

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
        resetProgress: () => {
            savedProgress = { progress: null };
            savedBodies.length = 0;
        },
    };
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

test.describe("review module clone production workspace safety", () => {
    test("multi-target isolation: exercise A and B keep separate saved workspaces with no leakage", async ({
                                                                                                               page,
                                                                                                           }) => {
        await mockNonProgressReviewCloneApis(page);

        const { savedBodies } = await installProgressRoundTripMock(page);

        const markerA = "workspace_isolation_marker_A";
        const markerB = "workspace_isolation_marker_B";

        await gotoCloneUrl(page, EXERCISE_A_URL);
        await expectExerciseAStarter(page);
        await expectBodyNotContains(page, markerB);

        await replaceMonacoText(page, `print('${markerA}')`);

        await expectBodyContains(page, markerA);
        await waitForSavedPayloadContaining(savedBodies, markerA);

        await gotoCloneUrl(page, EXERCISE_B_URL);
        await expectExerciseBStarter(page);
        await expectBodyNotContains(page, markerA);

        await replaceMonacoText(page, `print('${markerB}')`);

        await expectBodyContains(page, markerB);
        await waitForSavedPayloadContaining(savedBodies, markerB);

        await gotoCloneUrl(page, EXERCISE_A_URL);
        await expectBodyContains(page, markerA);
        await expectBodyNotContains(page, markerB);

        await gotoCloneUrl(page, EXERCISE_B_URL);
        await expectBodyContains(page, markerB);
        await expectBodyNotContains(page, markerA);
    });
    test("restore priority: saved progress workspace beats manifest starter on fresh load", async ({
                                                                                                       page,
                                                                                                   }) => {
        await mockNonProgressReviewCloneApis(page);

        const { savedBodies } = await installProgressRoundTripMock(page);

        const marker = "saved_progress_beats_manifest_starter_marker";

        await gotoCloneUrl(page, EXERCISE_A_URL);
        await expectExerciseAStarter(page);

        await replaceMonacoText(page, `print('${marker}')`);

        await expectBodyContains(page, marker);
        await waitForSavedPayloadContaining(savedBodies, marker);

        await gotoCloneUrl(page, EXERCISE_A_URL);

        await expectBodyContains(page, marker);

        await expect(page.locator("body")).toContainText("main.py", {
            timeout: 20_000,
        });
    });
    test("restore priority: manifest starter is used when no saved progress exists", async ({
                                                                                                page,
                                                                                            }) => {
        await mockNonProgressReviewCloneApis(page);

        const { resetProgress } = await installProgressRoundTripMock(page);

        resetProgress();

        await gotoCloneUrl(page, EXERCISE_A_URL);
        await expectExerciseAStarter(page);

        await gotoCloneUrl(page, EXERCISE_B_URL);
        await expectExerciseBStarter(page);
    });

    test("restore priority: blank fallback is used only when no saved progress and no manifest starter exist", async ({
                                                                                                                          page,
                                                                                                                      }) => {
        await mockNonProgressReviewCloneApis(page);

        const { resetProgress } = await installProgressRoundTripMock(page);

        resetProgress();

        await gotoCloneUrl(page, BLANK_EXERCISE_URL);
        await expectBlankFallback(page);
    });

    test("saved workspace survives reading-card navigation and does not leak into non-code card", async ({
                                                                                                             page,
                                                                                                         }) => {
        await mockNonProgressReviewCloneApis(page);

        const { savedBodies } = await installProgressRoundTripMock(page);

        const marker = "reading_navigation_keeps_exercise_workspace_marker";

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

        await gotoCloneUrl(page, EXERCISE_A_URL);

        await expectBodyContains(page, marker);
    });

    test.skip("stdin is scoped per target and does not leak between exercises", async ({
                                                                                      page,
                                                                                  }) => {
        await mockNonProgressReviewCloneApis(page);

        const { savedBodies } = await installProgressRoundTripMock(page);

        const stdinA = "stdin_target_A_123";
        const stdinB = "stdin_target_B_456";

        await gotoCloneUrl(page, EXERCISE_A_URL);

        const stdinEditorA = page.locator("textarea").last();

        await stdinEditorA.click({ force: true });
        await page.keyboard.press("ControlOrMeta+A");
        await page.keyboard.press("Backspace");
        await page.keyboard.insertText(stdinA);

        await waitForSavedPayloadContaining(savedBodies, stdinA);

        await gotoCloneUrl(page, EXERCISE_B_URL);

        await expectBodyNotContains(page, stdinA);

        const stdinEditorB = page.locator("textarea").last();

        await stdinEditorB.click({ force: true });
        await page.keyboard.press("ControlOrMeta+A");
        await page.keyboard.press("Backspace");
        await page.keyboard.insertText(stdinB);

        await waitForSavedPayloadContaining(savedBodies, stdinB);

        await gotoCloneUrl(page, EXERCISE_A_URL);
        await expectBodyContains(page, stdinA);
        await expectBodyNotContains(page, stdinB);

        await gotoCloneUrl(page, EXERCISE_B_URL);
        await expectBodyContains(page, stdinB);
        await expectBodyNotContains(page, stdinA);
    });
});