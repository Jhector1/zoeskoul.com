import { expect, Page, test } from "@playwright/test";

const SKETCH_CARD_URL =
    process.env.E2E_SKETCH_CARD_URL ??
    "/en/catalog/python/subjects/python/modules/python-1/learn/python-1-core-building-blocks/errors-intro/sketch/errors-intro";

async function selectAllAndType(page: Page, text: string) {
    await page.keyboard.press(
        process.platform === "darwin" ? "Meta+A" : "Control+A",
    );
    await page.keyboard.type(text);
}

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

                const toolWorkspaceNodeContent = card?.toolWorkspace?.nodes?.find?.(
                    (node: any) =>
                        node?.kind === "file" &&
                        typeof node?.content === "string" &&
                        node.content.length > 0,
                )?.content;

                if (typeof toolWorkspaceNodeContent === "string") {
                    return toolWorkspaceNodeContent;
                }

                const workspaceNodeContent = card?.workspace?.nodes?.find?.(
                    (node: any) =>
                        node?.kind === "file" &&
                        typeof node?.content === "string" &&
                        node.content.length > 0,
                )?.content;

                if (typeof workspaceNodeContent === "string") {
                    return workspaceNodeContent;
                }
            }
        }

        const toolState = topic?.toolState;

        if (toolState && typeof toolState === "object") {
            for (const tool of Object.values(toolState) as any[]) {
                if (typeof tool?.code === "string" && tool.code.length > 0) {
                    return tool.code;
                }

                const workspaceNodeContent = tool?.workspace?.nodes?.find?.(
                    (node: any) =>
                        node?.kind === "file" &&
                        typeof node?.content === "string" &&
                        node.content.length > 0,
                )?.content;

                if (typeof workspaceNodeContent === "string") {
                    return workspaceNodeContent;
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
            (node: any) =>
                node?.kind === "file" && node?.content === expectedCode,
        ),
    );
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

test("sketch/tools editor saves typed code to review progress", async ({
                                                                           page,
                                                                       }) => {
    const saves: any[] = [];

    await page.route("**/api/review/progress**", async (route, request) => {
        if (request.method() === "PUT") {
            const body = request.postDataJSON();
            saves.push(body);

            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    ok: true,
                    revision: saves.length,
                    state: body.state,
                    savedAt: new Date().toISOString(),
                }),
            });

            return;
        }

        if (request.method() === "GET") {
            const lastSave = saves.at(-1);

            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    ok: true,
                    revision: saves.length || 1,
                    state: lastSave?.state ?? null,
                    savedAt: new Date().toISOString(),
                }),
            });

            return;
        }

        await route.continue();
    });

    await page.goto(SKETCH_CARD_URL);

    await expect(page.getByRole("main")).toContainText(
        /Common Errors and Debugging/i,
        {
            timeout: 20_000,
        },
    );

    await expect(page.getByText("Tools").first()).toBeVisible({
        timeout: 20_000,
    });

    await expect(page.getByText("Loading...")).toHaveCount(0, {
        timeout: 20_000,
    });

    const uniqueCode = `print("e2e sketch save ${Date.now()}")`;

    const editorInput = page.getByTestId("code-editor-e2e-input");

    await expect(editorInput).toBeAttached({
        timeout: 20_000,
    });

    await editorInput.fill(uniqueCode);

    await expect
        .poll(
            () => {
                for (const save of saves.slice().reverse()) {
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
                    "Wait for review progress autosave to include typed sketch/tool code",
            },
        )
        .toBe(uniqueCode);

    const matchingSave = saves
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