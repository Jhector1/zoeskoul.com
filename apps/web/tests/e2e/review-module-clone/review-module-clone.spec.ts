import { test, expect, type Page } from "@playwright/test";

const REVIEW_MODULE_CLONE_URL =
    "/en/dev/e2e/review-module-clone/python/e2e-review-clone/learn/e2e-section/e2e-review-topic/exercise/e2e-print-name";

async function mockReviewModuleCloneApis(page: Page, options?: {
    onProgressPut?: (body: any) => void;
}) {
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
            options?.onProgressPut?.(body);

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

async function gotoClone(page: Page) {
    const response = await page.goto(REVIEW_MODULE_CLONE_URL, {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
    });

    expect(response?.status()).toBeLessThan(400);

    await expect(page.locator("body")).toBeVisible();

    return response;
}

test.describe("real review module clone", () => {
    test("loads the real review module clone shell", async ({ page }) => {
        let progressGetCount = 0;

        await page.route("**/api/review/progress**", async (route) => {
            const request = route.request();

            if (request.method() === "GET") {
                progressGetCount += 1;

                return route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({ progress: null }),
                });
            }

            if (request.method() === "PUT") {
                return route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({ ok: true }),
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

        await gotoClone(page);

        await expect(page.locator("body")).toContainText(
            "E2E Real Review Module Clone",
            { timeout: 20_000 },
        );

        await expect
            .poll(() => progressGetCount, {
                message: "Expected real review module clone to request progress",
            })
            .toBeGreaterThan(0);
    });

    test("opens the exercise route and hydrates the tools rail editor", async ({
                                                                                   page,
                                                                               }) => {
        await mockReviewModuleCloneApis(page);

        await gotoClone(page);

        await expect(page.locator("body")).toContainText(
            "E2E Real Review Module Clone",
            { timeout: 20_000 },
        );

        await expect(page.locator("body")).toContainText(/Tools|Run|Console/i, {
            timeout: 20_000,
        });

        await expect(page.locator("body")).toContainText("main.py", {
            timeout: 20_000,
        });
    });

   });