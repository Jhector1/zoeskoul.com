// tests/e2e/harness/review-progress-edge-cases.spec.ts
import { test, expect } from "@playwright/test";

const progressWithRuntimeWorkspace = (workspace: unknown) => ({
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
});

test("handles stale revision conflict without losing local workspace", async ({
                                                                                  page,
                                                                              }) => {
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
            return route.fulfill({
                status: 409,
                contentType: "application/json",
                body: JSON.stringify({
                    error: "stale_revision",
                    message: "Progress was updated elsewhere.",
                }),
            });
        }

        return route.fallback();
    });

    await page.goto("/en/dev/e2e/sketch-save");

    await page.getByTestId("e2e-force-save-workspace").click();

    await expect(page.getByTestId("e2e-sketch-save-page")).toBeVisible();

    await expect(page.getByTestId("e2e-workspace-debug")).toContainText(
        "browser save",
    );

    await expect(page.getByTestId("e2e-workspace-debug")).toContainText(
        "browser stdin",
    );
});

test("keeps local workspace visible when PUT save is rate limited", async ({
                                                                               page,
                                                                           }) => {
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
            return route.fulfill({
                status: 429,
                contentType: "application/json",
                body: JSON.stringify({
                    error: "rate_limited",
                    message: "Too many saves.",
                }),
            });
        }

        return route.fallback();
    });

    await page.goto("/en/dev/e2e/sketch-save");

    await page.getByTestId("e2e-force-save-workspace").click();

    await expect(page.getByTestId("e2e-sketch-save-page")).toBeVisible();

    await expect(page.getByTestId("e2e-workspace-debug")).toContainText(
        "browser save",
    );

    await expect(page.getByTestId("e2e-workspace-debug")).toContainText(
        "browser stdin",
    );
});

test("restores multi-file workspace with active file and open tabs", async ({
                                                                                page,
                                                                            }) => {
    const multiFileWorkspace = {
        version: 2,
        language: "python",
        nodes: [
            {
                id: "file:main.py",
                kind: "file",
                name: "main.py",
                parentId: null,
                content: "from helper import greet\nprint(greet())\n",
                createdAt: 1,
                updatedAt: 1,
            },
            {
                id: "file:helper.py",
                kind: "file",
                name: "helper.py",
                parentId: null,
                content: "def greet():\n    return 'hello from helper'\n",
                createdAt: 2,
                updatedAt: 2,
            },
        ],
        openTabs: ["file:main.py", "file:helper.py"],
        activeFileId: "file:helper.py",
        entryFileId: "file:main.py",
        stdin: "multi-file stdin\n",
        expanded: [],
        leftPct: 32,
    } as const;

    await page.route("**/api/review/progress**", async (route) => {
        if (route.request().method() !== "GET") {
            return route.fallback();
        }

        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(progressWithRuntimeWorkspace(multiFileWorkspace)),
        });
    });

    await page.goto("/en/dev/e2e/sketch-save");

    await expect(page.getByTestId("e2e-restore-status")).toContainText(
        "restored",
    );

    await expect(page.getByTestId("e2e-workspace-debug")).toContainText(
        "helper.py",
    );

    await expect(page.getByTestId("e2e-workspace-debug")).toContainText(
        "hello from helper",
    );

    await expect(page.getByTestId("e2e-workspace-debug")).toContainText(
        "file:helper.py",
    );

    await expect(page.getByTestId("e2e-workspace-debug")).toContainText(
        "multi-file stdin",
    );
});

test("restores workspace from legacy toolState carrier", async ({ page }) => {
    const legacyWorkspace = {
        version: 2,
        language: "python",
        nodes: [
            {
                id: "file:main.py",
                kind: "file",
                name: "main.py",
                parentId: null,
                content: "print('legacy carrier restore')\n",
                createdAt: 1,
                updatedAt: 1,
            },
        ],
        openTabs: ["file:main.py"],
        activeFileId: "file:main.py",
        entryFileId: "file:main.py",
        stdin: "legacy stdin\n",
        expanded: [],
        leftPct: 26,
    } as const;

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
                            toolState: {
                                "e2e_card:general": {
                                    workspace: legacyWorkspace,
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
        "legacy carrier restore",
    );

    await expect(page.getByTestId("e2e-workspace-debug")).toContainText(
        "legacy stdin",
    );
});

test("restores workspace with empty file content", async ({ page }) => {
    const emptyFileWorkspace = {
        version: 2,
        language: "python",
        nodes: [
            {
                id: "file:main.py",
                kind: "file",
                name: "main.py",
                parentId: null,
                content: "",
                createdAt: 1,
                updatedAt: 1,
            },
        ],
        openTabs: ["file:main.py"],
        activeFileId: "file:main.py",
        entryFileId: "file:main.py",
        stdin: "",
        expanded: [],
        leftPct: 26,
    } as const;

    await page.route("**/api/review/progress**", async (route) => {
        if (route.request().method() !== "GET") {
            return route.fallback();
        }

        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(progressWithRuntimeWorkspace(emptyFileWorkspace)),
        });
    });

    await page.goto("/en/dev/e2e/sketch-save");

    await expect(page.getByTestId("e2e-restore-status")).toContainText(
        "restored",
    );

    await expect(page.getByTestId("e2e-workspace-debug")).toContainText(
        '"content": ""',
    );

    await expect(page.getByTestId("e2e-workspace-debug")).toContainText(
        '"stdin": ""',
    );
});