// tests/e2e/review-module-clone/review-module-clone-real-user.spec.ts
import { test, expect, type Page } from "@playwright/test";
import {replaceMonacoEditorText, replaceMonacoText} from "../../utils";

const REVIEW_CLONE_URL =
    process.env.E2E_REVIEW_CLONE_URL ??
    "/en/dev/e2e/review-module-clone/python/e2e-review-clone/learn/e2e-section/e2e-review-topic/exercise/e2e-print-name";

const restoredWorkspace = {
    version: 2,
    language: "python",
    nodes: [
        {
            id: "file:main.py",
            kind: "file",
            name: "main.py",
            parentId: null,
            content: "print('restored on review clone page')\n",
            createdAt: 1,
            updatedAt: 1,
        },
    ],
    openTabs: ["file:main.py"],
    activeFileId: "file:main.py",
    entryFileId: "file:main.py",
    stdin: "review clone page stdin\n",
    expanded: [],
    leftPct: 26,
} as const;

const progressWithWorkspace = ({
                                   topicId,
                                   cardId,
                               }: {
    topicId: string;
    cardId: string;
}) => ({
    progress: {
        topics: {
            [topicId]: {
                runtimeStateV2: {
                    cards: {
                        [cardId]: {
                            toolWorkspace: restoredWorkspace,
                        },
                    },
                },
                toolState: {
                    [`${cardId}:general`]: {
                        workspace: restoredWorkspace,
                    },
                },
            },
        },
    },
});

async function mockCommonReviewCloneApis(
    page: Page,
    options?: {
        progress?: unknown;
        onProgressGet?: () => void;
        onProgressPut?: (body: any) => void;
    },
) {
    await page.route("**/api/review/progress**", async (route) => {
        const request = route.request();

        if (request.method() === "GET") {
            options?.onProgressGet?.();

            return route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(options?.progress ?? { progress: null }),
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

async function gotoReviewClone(page: Page) {
    const response = await page.goto(REVIEW_CLONE_URL, {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
    });

    expect(response?.status()).toBeLessThan(400);

    await expect(page.locator("body")).toBeVisible();

    return response;
}

test.describe("review module clone real-user equivalent flow", () => {
    test("clone review exercise page loads workspace and requests progress", async ({
                                                                                        page,
                                                                                    }) => {
        let progressGetCount = 0;

        await mockCommonReviewCloneApis(page, {
            onProgressGet: () => {
                progressGetCount += 1;
            },
        });

        await gotoReviewClone(page);

        await expect(page.locator("body")).toContainText(
            "E2E Real Review Module Clone",
            { timeout: 20_000 },
        );

        await expect(page.locator("body")).toContainText(/Tools|Run|Console/i, {
            timeout: 20_000,
        });

        await expect
            .poll(() => progressGetCount, {
                message: "Expected review clone page to request progress",
            })
            .toBeGreaterThan(0);
    });
    test("clone review exercise sends progress after user edits code", async ({
                                                                                  page,
                                                                              }) => {
        const savedBodies: any[] = [];
        const editedCode = "print('real_user_edit_review_clone')";

        await mockCommonReviewCloneApis(page, {
            onProgressPut: (body) => {
                savedBodies.push(body);
            },
        });

        await gotoReviewClone(page);

        await expect(page.locator("body")).toContainText(
            "E2E Real Review Module Clone",
            { timeout: 20_000 },
        );

        await replaceMonacoText(page, editedCode);

        await expect(page.locator("body")).toContainText(
            "real_user_edit_review_clone",
            {
                timeout: 15_000,
            },
        );

        await expect
            .poll(
                () =>
                    savedBodies.some((body) =>
                        JSON.stringify(body).includes("real_user_edit_review_clone"),
                    ),
                {
                    timeout: 30_000,
                    message:
                        "Expected at least one saved progress payload to contain the edited code",
                },
            )
            .toBe(true);

        const editedSave = savedBodies.find((body) =>
            JSON.stringify(body).includes("real_user_edit_review_clone"),
        );

        expect(editedSave.subjectSlug).toBe("python");
        expect(editedSave.moduleSlug).toBe("e2e-review-clone");
    });


    test("clone review exercise can receive restored progress payload without crashing", async ({
                                                                                                    page,
                                                                                                }) => {
        await mockCommonReviewCloneApis(page, {
            progress: progressWithWorkspace({
                topicId: "e2e-review-topic",
                cardId: "e2e-print-name",
            }),
        });

        await gotoReviewClone(page);

        await expect(page.locator("body")).toContainText(
            "E2E Real Review Module Clone",
            { timeout: 20_000 },
        );

        await expect(page.locator("body")).toContainText(/Tools|Run|Console/i, {
            timeout: 20_000,
        });

        await expect(page.locator("body")).toContainText(/main\.py|python/i, {
            timeout: 20_000,
        });
    });

    test("clone review exercise does not show duplicate primary completion CTAs", async ({
                                                                                             page,
                                                                                         }) => {
        await mockCommonReviewCloneApis(page);

        await gotoReviewClone(page);

        await expect(page.locator("body")).toContainText(
            "E2E Real Review Module Clone",
            { timeout: 20_000 },
        );

        const nextTopicButtons = page.getByRole("link", {
            name: /next topic/i,
        });

        const nextModuleButtons = page.getByRole("link", {
            name: /next module/i,
        });

        await expect
            .poll(async () => {
                const nextTopicCount = await nextTopicButtons.count();
                const nextModuleCount = await nextModuleButtons.count();

                return nextTopicCount + nextModuleCount;
            })
            .toBeLessThanOrEqual(1);
    });
});