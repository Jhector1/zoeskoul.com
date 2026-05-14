import { expect, test } from "@playwright/test";

const HARNESS_URL = "/en/dev/e2e/sketch-save";

function findSavedToolCode(state: any) {
    const topics = state?.topics;

    if (!topics || typeof topics !== "object") {
        return null;
    }

    for (const topic of Object.values(topics) as any[]) {
        const cards = topic?.runtimeStateV2?.cards;

        if (cards && typeof cards === "object") {
            for (const card of Object.values(cards) as any[]) {
                if (typeof card?.toolCode === "string" && card.toolCode.length > 0) {
                    return card.toolCode;
                }

                const content = card?.toolWorkspace?.nodes?.find?.(
                    (node: any) =>
                        node?.kind === "file" &&
                        typeof node?.content === "string" &&
                        node.content.length > 0,
                )?.content;

                if (typeof content === "string") {
                    return content;
                }
            }
        }

        const toolState = topic?.toolState;

        if (toolState && typeof toolState === "object") {
            for (const tool of Object.values(toolState) as any[]) {
                if (typeof tool?.code === "string" && tool.code.length > 0) {
                    return tool.code;
                }

                const content = tool?.workspace?.nodes?.find?.(
                    (node: any) =>
                        node?.kind === "file" &&
                        typeof node?.content === "string" &&
                        node.content.length > 0,
                )?.content;

                if (typeof content === "string") {
                    return content;
                }
            }
        }
    }

    return null;
}

function findSavedToolStdin(state: any) {
    const topics = state?.topics;

    if (!topics || typeof topics !== "object") {
        return null;
    }

    for (const topic of Object.values(topics) as any[]) {
        const cards = topic?.runtimeStateV2?.cards;

        if (cards && typeof cards === "object") {
            for (const card of Object.values(cards) as any[]) {
                if (typeof card?.toolStdin === "string" && card.toolStdin.length > 0) {
                    return card.toolStdin;
                }

                if (
                    typeof card?.toolWorkspace?.stdin === "string" &&
                    card.toolWorkspace.stdin.length > 0
                ) {
                    return card.toolWorkspace.stdin;
                }
            }
        }

        const toolState = topic?.toolState;

        if (toolState && typeof toolState === "object") {
            for (const tool of Object.values(toolState) as any[]) {
                if (typeof tool?.stdin === "string" && tool.stdin.length > 0) {
                    return tool.stdin;
                }

                if (
                    typeof tool?.workspace?.stdin === "string" &&
                    tool.workspace.stdin.length > 0
                ) {
                    return tool.workspace.stdin;
                }
            }
        }
    }

    return null;
}

function workspaceContainsCode(workspace: any, expectedCode: string) {
    return Boolean(
        workspace?.version === 2 &&
        workspace?.nodes?.some?.(
            (node: any) => node?.kind === "file" && node?.content === expectedCode,
        ),
    );
}

function workspaceContainsStdin(workspace: any, expectedStdin: string) {
    return Boolean(workspace?.version === 2 && workspace?.stdin === expectedStdin);
}

function findSavedToolWorkspace(state: any, expectedCode: string) {
    const topics = state?.topics;

    if (!topics || typeof topics !== "object") {
        return null;
    }

    for (const topic of Object.values(topics) as any[]) {
        const cards = topic?.runtimeStateV2?.cards;

        if (cards && typeof cards === "object") {
            for (const card of Object.values(cards) as any[]) {
                if (workspaceContainsCode(card?.toolWorkspace, expectedCode)) {
                    return card.toolWorkspace;
                }

                if (workspaceContainsCode(card?.workspace, expectedCode)) {
                    return card.workspace;
                }
            }
        }

        const toolState = topic?.toolState;

        if (toolState && typeof toolState === "object") {
            for (const tool of Object.values(toolState) as any[]) {
                if (workspaceContainsCode(tool?.workspace, expectedCode)) {
                    return tool.workspace;
                }
            }
        }
    }

    return null;
}

function findSavedToolWorkspaceByStdin(state: any, expectedStdin: string) {
    const topics = state?.topics;

    if (!topics || typeof topics !== "object") {
        return null;
    }

    for (const topic of Object.values(topics) as any[]) {
        const cards = topic?.runtimeStateV2?.cards;

        if (cards && typeof cards === "object") {
            for (const card of Object.values(cards) as any[]) {
                if (workspaceContainsStdin(card?.toolWorkspace, expectedStdin)) {
                    return card.toolWorkspace;
                }

                if (workspaceContainsStdin(card?.workspace, expectedStdin)) {
                    return card.workspace;
                }
            }
        }

        const toolState = topic?.toolState;

        if (toolState && typeof toolState === "object") {
            for (const tool of Object.values(toolState) as any[]) {
                if (workspaceContainsStdin(tool?.workspace, expectedStdin)) {
                    return tool.workspace;
                }
            }
        }
    }

    return null;
}

async function installMockReviewProgressApi(page: any) {
    let latestState: any = null;
    const saves: any[] = [];

    await page.route("**/api/review/progress**", async (route: any, request: any) => {
        if (request.method() === "PUT") {
            const body = request.postDataJSON();
            saves.push(body);
            latestState = body.state;

            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    ok: true,
                    revision: saves.length,
                    state: latestState,
                    savedAt: new Date().toISOString(),
                }),
            });

            return;
        }

        if (request.method() === "GET") {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    ok: true,
                    revision: saves.length || 1,
                    state: latestState,
                    savedAt: new Date().toISOString(),
                }),
            });

            return;
        }

        await route.continue();
    });

    return {
        saves,
        getLatestState() {
            return latestState;
        },
    };
}

test.describe("E2E sketch/tool workspace save harness", () => {
    test("saves code workspace through review progress payload", async ({ page }) => {
        const progress = await installMockReviewProgressApi(page);

        await page.goto(HARNESS_URL);

        await expect(page.getByTestId("e2e-sketch-save-page")).toBeVisible({
            timeout: 20_000,
        });

        await expect(page.getByTestId("code-runner")).toBeVisible({
            timeout: 20_000,
        });

        await expect(page.getByTestId("code-editor-e2e-input")).toBeAttached({
            timeout: 20_000,
        });

        const uniqueCode = `print("e2e harness save ${Date.now()}")`;

        await page.getByTestId("code-editor-e2e-input").fill(uniqueCode);

        await expect
            .poll(
                () => {
                    for (const save of progress.saves.slice().reverse()) {
                        const savedCode = findSavedToolCode(save?.state);

                        if (savedCode === uniqueCode) {
                            return savedCode;
                        }
                    }

                    return null;
                },
                {
                    timeout: 20_000,
                    message:
                        "Wait for review progress autosave to include typed harness code",
                },
            )
            .toBe(uniqueCode);

        const matchingSave = progress.saves
            .slice()
            .reverse()
            .find((save) => findSavedToolCode(save?.state) === uniqueCode);

        expect(matchingSave).toBeTruthy();

        const savedWorkspace = findSavedToolWorkspace(
            matchingSave?.state,
            uniqueCode,
        );

        expect(savedWorkspace).toEqual(
            expect.objectContaining({
                version: 2,
                language: "python",
                activeFileId: expect.any(String),
                entryFileId: expect.any(String),
                nodes: expect.arrayContaining([
                    expect.objectContaining({
                        kind: "file",
                        content: uniqueCode,
                    }),
                ]),
            }),
        );
    });

    test("saves stdin through review progress payload", async ({ page }) => {
        const progress = await installMockReviewProgressApi(page);

        await page.goto(HARNESS_URL);

        await expect(page.getByTestId("e2e-sketch-save-page")).toBeVisible({
            timeout: 20_000,
        });

        await expect(page.getByTestId("code-stdin")).toBeVisible({
            timeout: 20_000,
        });

        const uniqueStdin = `stdin-${Date.now()}`;

        await page.getByTestId("code-stdin").fill(uniqueStdin);

        await expect
            .poll(
                () => {
                    for (const save of progress.saves.slice().reverse()) {
                        const savedStdin = findSavedToolStdin(save?.state);

                        if (savedStdin === uniqueStdin) {
                            return savedStdin;
                        }
                    }

                    return null;
                },
                {
                    timeout: 20_000,
                    message: "Wait for review progress autosave to include stdin",
                },
            )
            .toBe(uniqueStdin);

        const matchingSave = progress.saves
            .slice()
            .reverse()
            .find((save) => findSavedToolStdin(save?.state) === uniqueStdin);

        expect(matchingSave).toBeTruthy();

        const savedWorkspace = findSavedToolWorkspaceByStdin(
            matchingSave?.state,
            uniqueStdin,
        );

        expect(savedWorkspace).toEqual(
            expect.objectContaining({
                version: 2,
                language: "python",
                stdin: uniqueStdin,
            }),
        );
    });

    test("restores saved workspace after reload", async ({ page }) => {
        const progress = await installMockReviewProgressApi(page);

        await page.goto(HARNESS_URL);

        await expect(page.getByTestId("e2e-sketch-save-page")).toBeVisible({
            timeout: 20_000,
        });

        await expect(page.getByTestId("code-editor-e2e-input")).toBeAttached({
            timeout: 20_000,
        });

        await expect(page.getByTestId("code-stdin")).toBeVisible({
            timeout: 20_000,
        });

        const uniqueCode = `print("reload restore ${Date.now()}")`;
        const uniqueStdin = `reload-stdin-${Date.now()}`;

        await page.getByTestId("code-editor-e2e-input").fill(uniqueCode);
        await page.getByTestId("code-stdin").fill(uniqueStdin);

        await expect
            .poll(
                () => {
                    const latestState = progress.getLatestState();

                    return (
                        findSavedToolCode(latestState) === uniqueCode &&
                        findSavedToolStdin(latestState) === uniqueStdin
                    );
                },
                {
                    timeout: 20_000,
                    message:
                        "Wait for latest review progress state to include code and stdin before reload",
                },
            )
            .toBe(true);

        await page.reload();

        await expect(page.getByTestId("e2e-sketch-save-page")).toBeVisible({
            timeout: 20_000,
        });

        await expect(page.getByTestId("e2e-restore-status")).toContainText(
            /restored/i,
            {
                timeout: 20_000,
            },
        );

        await expect(page.getByTestId("code-editor-e2e-input")).toHaveValue(
            uniqueCode,
            {
                timeout: 20_000,
            },
        );

        await expect(page.getByTestId("code-stdin")).toHaveValue(uniqueStdin, {
            timeout: 20_000,
        });

        await expect(page.getByTestId("code-editor-e2e-input")).toHaveValue(
            uniqueCode,
            {
                timeout: 20_000,
            },
        );

        await expect(page.getByTestId("code-stdin")).toHaveValue(uniqueStdin, {
            timeout: 20_000,
        });
    });
});