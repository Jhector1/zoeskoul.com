import { expect, Page, test } from "@playwright/test";

const REVIEW_URL =
    process.env.E2E_REVIEW_URL ??
    "/en/catalog/python/subjects/python/modules/python-1/learn/python-1-core-building-blocks/variables-intro/exercise/boxes-print";

type SavedProgressRequest = {
    revision?: number;
    state?: any;
    subjectSlug?: string;
    moduleSlug?: string;
};

async function installMockReviewProgressApi(page: Page) {
    const saves: SavedProgressRequest[] = [];

    await page.route("**/api/review/progress**", async (route, request) => {
        if (request.method() === "PUT") {
            const body = request.postDataJSON() as SavedProgressRequest;
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

    return {
        saves,
        getLastSave() {
            return saves.at(-1);
        },
    };
}

async function waitForReviewProgressPut(page: Page) {
    return page.waitForResponse((res) => {
        return (
            res.url().includes("/api/review/progress") &&
            res.request().method() === "PUT" &&
            res.status() >= 200 &&
            res.status() < 300
        );
    });
}

async function gotoReviewWithCodeExercise(page: Page) {
    await page.goto(REVIEW_URL);

    await expect(page.getByTestId("code-input-exercise")).toBeVisible({
        timeout: 20_000,
    });

    await expect(page.getByTestId("code-runner")).toBeVisible();
    await expect(page.getByTestId("code-editor")).toBeVisible();
}

async function selectAllAndType(page: Page, text: string) {
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    await page.keyboard.type(text);
}

async function fillEditor(page: Page, code: string) {
    const editor = page.getByTestId("code-editor");

    await editor.click();
    await selectAllAndType(page, code);
}

async function fillStdin(page: Page, stdin: string) {
    const stdinBox = page.getByTestId("code-stdin");

    await expect(stdinBox).toBeVisible();
    await stdinBox.click();
    await selectAllAndType(page, stdin);
}

async function editorTextShouldContain(page: Page, text: string) {
    const editor = page.getByTestId("code-editor");

    await expect
        .poll(async () => {
            return await editor.innerText().catch(() => "");
        })
        .toContain(text);
}

function findExerciseRuntimeState(state: any) {
    const topics = state?.topics;

    if (!topics || typeof topics !== "object") {
        return null;
    }

    for (const topic of Object.values(topics) as any[]) {
        const exercises = topic?.runtimeStateV2?.exercises;

        if (!exercises || typeof exercises !== "object") {
            continue;
        }

        for (const exerciseState of Object.values(exercises) as any[]) {
            if (
                exerciseState?.workspace ||
                exerciseState?.codeWorkspace ||
                exerciseState?.ideWorkspace
            ) {
                return exerciseState;
            }
        }
    }

    return null;
}

function expectSavedExerciseWorkspace(save: SavedProgressRequest | undefined) {
    expect(save).toBeTruthy();

    const exerciseState = findExerciseRuntimeState(save?.state);

    expect(exerciseState).toBeTruthy();
    expect(exerciseState.workspace).toBeTruthy();
    expect(exerciseState.codeWorkspace).toBeTruthy();
    expect(exerciseState.ideWorkspace).toBeTruthy();

    expect(exerciseState.workspace.version).toBe(2);
    expect(Array.isArray(exerciseState.workspace.nodes)).toBe(true);

    return exerciseState;
}

test.describe("review code_input workspace persistence", () => {
    test("saves and restores code plus stdin after refresh", async ({ page }) => {
        const progress = await installMockReviewProgressApi(page);

        await gotoReviewWithCodeExercise(page);

        await fillEditor(page, "print('saved after refresh')");
        await fillStdin(page, "stdin-after-refresh");

        await waitForReviewProgressPut(page);

        const savedExercise = expectSavedExerciseWorkspace(progress.getLastSave());

        expect(savedExercise.code).toContain("saved after refresh");
        expect(savedExercise.source).toContain("saved after refresh");
        expect(savedExercise.stdin).toBe("stdin-after-refresh");
        expect(savedExercise.codeStdin).toBe("stdin-after-refresh");

        await page.reload();

        await expect(page.getByTestId("code-input-exercise")).toBeVisible();
        await editorTextShouldContain(page, "saved after refresh");
        await expect(page.getByTestId("code-stdin")).toHaveValue("stdin-after-refresh");
    });

    test("saves compatibility fields for code_input exercises", async ({ page }) => {
        const progress = await installMockReviewProgressApi(page);

        await gotoReviewWithCodeExercise(page);

        await fillEditor(page, "print('compatibility fields')");
        await fillStdin(page, "compat-stdin");

        await waitForReviewProgressPut(page);

        const savedExercise = expectSavedExerciseWorkspace(progress.getLastSave());

        expect(savedExercise).toEqual(
            expect.objectContaining({
                workspace: expect.any(Object),
                codeWorkspace: expect.any(Object),
                ideWorkspace: expect.any(Object),
                stdin: "compat-stdin",
                codeStdin: "compat-stdin",
                code: expect.stringContaining("compatibility fields"),
                source: expect.stringContaining("compatibility fields"),
                userEdited: true,
                workspaceOrigin: "user",
            }),
        );

        expect(savedExercise.language || savedExercise.lang).toBeTruthy();
        expect(typeof savedExercise.updatedAt).toBe("number");
    });

    test("does not lose stdin when only code changes afterward", async ({ page }) => {
        await installMockReviewProgressApi(page);

        await gotoReviewWithCodeExercise(page);

        await fillStdin(page, "stdin should survive code edit");
        await waitForReviewProgressPut(page);

        await fillEditor(page, "print(input())");
        await waitForReviewProgressPut(page);

        await page.reload();

        await expect(page.getByTestId("code-stdin")).toHaveValue(
            "stdin should survive code edit",
        );

        await editorTextShouldContain(page, "print(input())");
    });

    test("does not lose code when only stdin changes afterward", async ({ page }) => {
        await installMockReviewProgressApi(page);

        await gotoReviewWithCodeExercise(page);

        await fillEditor(page, "print('code should survive stdin edit')");
        await waitForReviewProgressPut(page);

        await fillStdin(page, "new stdin only");
        await waitForReviewProgressPut(page);

        await page.reload();

        await editorTextShouldContain(page, "code should survive stdin edit");
        await expect(page.getByTestId("code-stdin")).toHaveValue("new stdin only");
    });

    test("preserves workspace when navigating away and back", async ({ page }) => {
        await installMockReviewProgressApi(page);

        await gotoReviewWithCodeExercise(page);

        await fillEditor(page, "print('navigate away and back')");
        await fillStdin(page, "navigation-stdin");

        await waitForReviewProgressPut(page);

        const nextButton = page
            .getByRole("button", { name: /next/i })
            .or(page.getByLabel(/next/i));

        const previousButton = page
            .getByRole("button", { name: /previous|back/i })
            .or(page.getByLabel(/previous|back/i));

        await nextButton.click();
        await previousButton.click();

        await expect(page.getByTestId("code-input-exercise")).toBeVisible();
        await editorTextShouldContain(page, "navigate away and back");
        await expect(page.getByTestId("code-stdin")).toHaveValue("navigation-stdin");
    });
});