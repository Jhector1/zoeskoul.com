// tests/e2e/review-progress-restore.spec.ts
import { test, expect } from "@playwright/test";

const workspace = {
    version: 2,
    language: "python",
    nodes: [
        {
            id: "file:main.py",
            kind: "file",
            name: "main.py",
            parentId: null,
            content: "print('restored from server')\n",
            createdAt: 1,
            updatedAt: 1,
        },
    ],
    openTabs: ["file:main.py"],
    activeFileId: "file:main.py",
    entryFileId: "file:main.py",
    stdin: "123\n",
    expanded: [],
    leftPct: 26,
} as const;

test("shows empty restore state when no progress exists", async ({ page }) => {
    await page.route("**/api/review/progress**", async (route) => {
        if (route.request().method() !== "GET") {
            return route.fallback();
        }

        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ progress: null }),
        });
    });

    await page.goto("/en/dev/e2e/sketch-save");

    await expect(page.getByTestId("e2e-restore-status")).toContainText("empty");
    await expect(page.getByTestId("e2e-sketch-save-page")).toBeVisible();
});

test("shows failed restore state when progress API fails", async ({ page }) => {
    await page.route("**/api/review/progress**", async (route) => {
        if (route.request().method() !== "GET") {
            return route.fallback();
        }

        await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ message: "boom" }),
        });
    });

    await page.goto("/en/dev/e2e/sketch-save");

    await expect(page.getByTestId("e2e-restore-status")).toContainText("failed");

    await expect(
        page.getByRole("heading", { name: /e2e sketch save harness/i }),
    ).toBeVisible();
});

test("sends review progress PUT with runtimeStateV2 and toolState workspace carriers", async ({
                                                                                                  page,
                                                                                              }) => {
    let savedBody: any = null;

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
            savedBody = request.postDataJSON();

            return route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    ok: true,
                    state: savedBody.state,
                }),
            });
        }

        return route.fallback();
    });

    await page.goto("/en/dev/e2e/sketch-save");

    await page.getByTestId("e2e-force-save-workspace").click();

    await expect
        .poll(() => savedBody, {
            message: "Expected browser to send PUT /api/review/progress",
        })
        .not.toBeNull();

    expect(savedBody.subjectSlug).toBe("e2e");
    expect(savedBody.moduleSlug).toBe("e2e");

    expect(
        savedBody.state.topics.e2e_topic.runtimeStateV2.cards.e2e_card
            .toolWorkspace,
    ).toBeTruthy();

    expect(
        savedBody.state.topics.e2e_topic.toolState["e2e_card:general"].workspace,
    ).toBeTruthy();
});

test("restores saved review workspace from GET /api/review/progress", async ({
                                                                                 page,
                                                                             }) => {
    await page.route("**/api/review/progress**", async (route) => {
        if (route.request().method() !== "GET") {
            return route.fallback();
        }

        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                progress: {
                    topics: {
                        e2e_topic: {
                            runtimeStateV2: {
                                cards: {
                                    e2e_card: {
                                        toolWorkspace: workspace,
                                    },
                                },
                            },
                        },
                    },
                },
            }),
        });
    });

    await page.goto("/en/dev/e2e/sketch-save");

    await expect(page.getByTestId("e2e-restore-status")).toContainText(
        "restored",
    );

    await expect(page.getByTestId("e2e-workspace-debug")).toContainText(
        "restored from server",
    );

    await expect(page.getByTestId("e2e-workspace-debug")).toContainText("123");
});

test("does not crash when progress exists but workspace shape is invalid", async ({
                                                                                      page,
                                                                                  }) => {
    await page.route("**/api/review/progress**", async (route) => {
        if (route.request().method() !== "GET") {
            return route.fallback();
        }

        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                progress: {
                    topics: {
                        e2e_topic: {
                            runtimeStateV2: {
                                cards: {
                                    e2e_card: {
                                        toolWorkspace: {
                                            version: 999,
                                            nodes: "not-an-array",
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            }),
        });
    });

    await page.goto("/en/dev/e2e/sketch-save");

    await expect(page.getByTestId("e2e-sketch-save-page")).toBeVisible();

    await expect(page.getByTestId("e2e-restore-status")).not.toContainText(
        "restored",
    );
});