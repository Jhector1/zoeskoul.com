import { test, expect, type Page } from "@playwright/test";

const BASE =
    "/en/dev/e2e/review-module-clone/python/e2e-review-clone/learn/e2e-section/e2e-review-topic";

const EXERCISE_URL = `${BASE}/exercise/e2e-print-name`;
const READING_URL = `${BASE}/card/e2e-reading`;

async function mockCommonReviewCloneApis(page: Page, progress: unknown) {
    await page.route("**/api/review/progress**", async (route) => {
        const request = route.request();

        if (request.method() === "GET") {
            return route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(progress),
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

async function expectExerciseShowsStarterWorkspace(page: Page) {
    await expect(page.locator("body")).toContainText("ZoeSkoul learner", {
        timeout: 20_000,
    });

    await expect(page.locator("body")).toContainText("helper.py", {
        timeout: 20_000,
    });

    await expect(page.locator("body")).not.toContainText(
        "saved_from_progress_for_print_name",
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
    await page.keyboard.press("Backspace");
    await page.keyboard.insertText(text);
}

test.describe("review module clone navigation workspace isolation", () => {
    test("navigating away and back restores the workspace from the app's own saved progress payload", async ({
                                                                                                                 page,
                                                                                                             }) => {
        const editedMarker = "nav_saved_workspace_restore_marker";
        const editedCode = `print('${editedMarker}')`;

        let savedProgress: unknown = { progress: null };
        const savedBodies: any[] = [];

        await mockCommonReviewCloneApis(page, { progress: null });

        await page.unroute("**/api/review/progress");

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

                if (JSON.stringify(body).includes(editedMarker)) {
                    savedProgress = {
                        progress: body.state,
                    };
                }

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

        await gotoCloneUrl(page, EXERCISE_URL);

        await expectExerciseShowsStarterWorkspace(page);

        await replaceMonacoText(page, editedCode);

        await expect(page.locator("body")).toContainText(editedMarker, {
            timeout: 15_000,
        });

        await expect
            .poll(
                () =>
                    savedBodies.some((body) =>
                        JSON.stringify(body).includes(editedMarker),
                    ),
                {
                    timeout: 30_000,
                    message:
                        "Expected app to save an edited workspace payload before navigation",
                },
            )
            .toBe(true);

        await gotoCloneUrl(page, READING_URL);

        await expect(page.locator("body")).toContainText("Read before coding", {
            timeout: 20_000,
        });

        await gotoCloneUrl(page, EXERCISE_URL);

        await expect(page.locator("body")).toContainText(editedMarker, {
            timeout: 20_000,
        });

        await expect(page.locator("body")).toContainText("main.py", {
            timeout: 20_000,
        });
    });

    test("exercise uses starter workspace when no saved progress exists after navigation", async ({
                                                                                                      page,
                                                                                                  }) => {
        await mockCommonReviewCloneApis(page, { progress: null });

        await gotoCloneUrl(page, EXERCISE_URL);
        await expectExerciseShowsStarterWorkspace(page);

        await gotoCloneUrl(page, READING_URL);

        await expect(page.locator("body")).toContainText("Read before coding", {
            timeout: 20_000,
        });

        await gotoCloneUrl(page, EXERCISE_URL);
        await expectExerciseShowsStarterWorkspace(page);
    });
});