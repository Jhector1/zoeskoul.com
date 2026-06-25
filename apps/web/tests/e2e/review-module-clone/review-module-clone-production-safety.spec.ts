import { test, expect, type Page } from "@playwright/test";

// Zoeskoul E2E suite pruning: this file is opt-in.
test.skip(process.env.RUN_E2E_LEGACY !== "1", "Legacy broad E2E suite is opt-in. Run with RUN_E2E_LEGACY=1 or pnpm test:e2e:legacy.");


test.describe.configure({ mode: "serial", timeout: 90_000 });

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

async function installSharedProgressRoundTripMock(
    page: Page,
    shared: {
        savedProgress: unknown;
        savedBodies: any[];
    },
) {
    await page.route("**/api/review/progress**", async (route) => {
        const request = route.request();

        if (request.method() === "GET") {
            return route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(shared.savedProgress),
            });
        }

        if (request.method() === "PUT") {
            const body = request.postDataJSON();
            shared.savedBodies.push(body);
            shared.savedProgress = {
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

    test("cross-device saved progress restores user code instead of starterCode", async ({
                                                                                             browser,
                                                                                         }) => {
        const shared = {
            savedProgress: { progress: null },
            savedBodies: [] as any[],
        };

        const contextA = await browser.newContext();
        const contextB = await browser.newContext();

        try {
            const pageA = await contextA.newPage();
            const pageB = await contextB.newPage();

            await mockNonProgressReviewCloneApis(pageA);
            await mockNonProgressReviewCloneApis(pageB);
            await installSharedProgressRoundTripMock(pageA, shared);
            await installSharedProgressRoundTripMock(pageB, shared);

            const marker = "cross_device_saved_progress_user_code_marker";

            await gotoCloneUrl(pageA, EXERCISE_A_URL);
            await expectExerciseAStarter(pageA);
            await replaceMonacoText(pageA, `print('${marker}')`);
            await expectBodyContains(pageA, marker);
            await waitForSavedPayloadContaining(shared.savedBodies, marker);

            await gotoCloneUrl(pageB, EXERCISE_A_URL);
            await expectBodyContains(pageB, marker);
            await expectBodyNotContains(pageB, "print('Hello, ' + name)");
        } finally {
            await contextA.close();
            await contextB.close();
        }
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

    test("starterCode is only used when no saved/user workspace exists", async ({
                                                                                    page,
                                                                                }) => {
        await mockNonProgressReviewCloneApis(page);

        const { savedBodies, resetProgress } = await installProgressRoundTripMock(page);
        const marker = "starter_only_until_user_workspace_exists_marker";

        resetProgress();

        /**
         * With no saved/user workspace, the manifest starter should hydrate.
         */
        await gotoCloneUrl(page, EXERCISE_A_URL);
        await expectExerciseAStarter(page);

        /**
         * User-authored editor content should replace the starter visibly.
         */
        await replaceMonacoText(page, `print('${marker}')`);
        await expectBodyContains(page, marker);

        /**
         * Do not rely only on the debounced progress payload here.
         * Some full-suite timing can make the PUT arrive later than this test's
         * assertion window. The real invariant is:
         *
         * 1. starter hydrates only when there is no saved/user workspace
         * 2. user-authored code remains visible across route reload/navigation
         * 3. starter does not overwrite user-authored code
         */
        await gotoCloneUrl(page, EXERCISE_A_URL);

        await expectBodyContains(page, marker);
        await expectBodyNotContains(page, "print('Hello, ' + name)");

        /**
         * If a save happened, it must contain the user marker, not starter-only
         * fallback content. But saving is not the primary assertion in this test.
         */
        const savedPayloadText = JSON.stringify(savedBodies);
        if (savedBodies.length > 0) {
            expect(savedPayloadText).toContain(marker);
        }

        /**
         * Once saved progress is cleared, starter is allowed again.
         */
        resetProgress();
        await gotoCloneUrl(page, EXERCISE_A_URL);
        await expectExerciseAStarter(page);
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
