import { expect, test, type Locator, type Page } from "@playwright/test";

const REAL_EXERCISE_URL =
    "/en/catalog/python/subjects/python-v2/modules/python-v2-3/learn/python-v2-3-while-loops/loop-debugging/exercise/loop-debug-code-3";

const STARTER_MARKER = "# TODO: print 3, 2, 1 using a while loop";

const SOLVED_CODE = [
    "n = 3",
    "while n >= 1:",
    "    print(n)",
    "    n = n - 1",
].join("\n");

const SOLVED_MARKER = "while n >= 1:";

function getEditorInputs(page: Page): Locator {
    return page.getByTestId("code-editor-e2e-input");
}

/**
 * The right-side Tools editor is the last code-editor textarea on the page.
 */
function getToolsEditorInput(page: Page): Locator {
    return getEditorInputs(page).last();
}

async function readToolsEditor(page: Page): Promise<string> {
    const editor = getToolsEditorInput(page);
    await expect(editor).toBeAttached({ timeout: 30_000 });
    return editor.inputValue();
}

async function expectToolsEditorToContain(
    page: Page,
    expected: string,
    timeout = 30_000,
) {
    await expect
        .poll(() => readToolsEditor(page), { timeout })
        .toContain(expected);
}

async function expectToolsEditorNotToContain(
    page: Page,
    unexpected: string,
    timeout = 30_000,
) {
    await expect
        .poll(() => readToolsEditor(page), { timeout })
        .not.toContain(unexpected);
}

async function expectToolsEditorNotBlank(page: Page, timeout = 30_000) {
    await expect
        .poll(async () => (await readToolsEditor(page)).trim(), { timeout })
        .not.toBe("");
}

async function gotoRealExercise(page: Page) {
    await page.goto(REAL_EXERCISE_URL);
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByText(/write python code/i).first()).toBeVisible({
        timeout: 30_000,
    });

    await expect
        .poll(async () => getEditorInputs(page).count(), {
            timeout: 30_000,
        })
        .toBeGreaterThan(0);

    await expectToolsEditorNotBlank(page);
}

async function fillToolsEditor(page: Page, code: string) {
    const editor = getToolsEditorInput(page);
    await expect(editor).toBeAttached({ timeout: 30_000 });

    await editor.fill(code);

    await expect
        .poll(() => readToolsEditor(page), { timeout: 10_000 })
        .toBe(code);
}

async function clickCheckThisAnswer(page: Page) {
    const candidates = [
        page.getByRole("button", { name: /check this answer/i }),
        page.getByRole("button", { name: /^check$/i }),
        page.getByRole("button", { name: /^submit$/i }),
    ];

    for (const locator of candidates) {
        const count = await locator.count();

        for (let index = count - 1; index >= 0; index -= 1) {
            const button = locator.nth(index);

            if ((await button.isVisible()) && (await button.isEnabled())) {
                await button.click();
                return;
            }
        }
    }

    throw new Error("No enabled Check this answer button found.");
}

async function waitForCorrect(page: Page) {
    await expect(page.getByText(/\bcorrect\b/i).last()).toBeVisible({
        timeout: 45_000,
    });
}

async function visibleEnabledButtonTexts(page: Page): Promise<string[]> {
    return page.getByRole("button").evaluateAll((buttons) =>
        buttons
            .filter((button) => {
                const element = button as HTMLElement;
                const style = window.getComputedStyle(element);

                return (
                    style.display !== "none" &&
                    style.visibility !== "hidden" &&
                    !element.hasAttribute("disabled") &&
                    element.getAttribute("aria-disabled") !== "true"
                );
            })
            .map((button) => (button.textContent ?? "").trim())
            .filter(Boolean),
    );
}

async function clickEnabledButton(page: Page, name: RegExp) {
    const buttons = page.getByRole("button", { name });
    const count = await buttons.count();

    for (let index = count - 1; index >= 0; index -= 1) {
        const button = buttons.nth(index);

        if ((await button.isVisible()) && (await button.isEnabled())) {
            await button.click();
            return;
        }
    }

    const visibleButtons = await visibleEnabledButtonTexts(page);

    throw new Error(
        `No enabled button found for ${String(name)}. Visible enabled buttons: ${visibleButtons.join(
            " | ",
        )}`,
    );
}

async function clickQuestionNext(page: Page) {
    await clickEnabledButton(page, /^next(?:\s*→)?$/i);
}

async function clickQuestionPrevious(page: Page) {
    await clickEnabledButton(page, /^previous$/i);
}

async function waitUntilToolsBoundToExercise(page: Page, exerciseKeyPart: string) {
    await expect
        .poll(
            async () => {
                const body = await page.locator("body").innerText();
                return body.includes(exerciseKeyPart);
            },
            { timeout: 30_000 },
        )
        .toBe(true);
}

test.describe("real review route Tools editor back/forward persistence", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies();
    });

    test("correct code_input keeps learner code after next, previous, and repeated back/forward navigation", async ({
                                                                                                                        page,
                                                                                                                    }) => {
        await gotoRealExercise(page);

        await fillToolsEditor(page, SOLVED_CODE);

        await clickCheckThisAnswer(page);
        await waitForCorrect(page);

        await expectToolsEditorToContain(page, SOLVED_MARKER);
        await expectToolsEditorNotToContain(page, STARTER_MARKER);

        const codeAfterCorrect = await readToolsEditor(page);
        expect(codeAfterCorrect).toContain(SOLVED_MARKER);
        expect(codeAfterCorrect).toContain("n = n - 1");
        expect(codeAfterCorrect).not.toContain(STARTER_MARKER);

        await clickQuestionNext(page);

        await expectToolsEditorNotBlank(page);

        await clickQuestionPrevious(page);

        await waitUntilToolsBoundToExercise(page, "loop-debug-code-3");

        await expectToolsEditorToContain(page, SOLVED_MARKER);
        await expectToolsEditorNotToContain(page, STARTER_MARKER);

        const codeAfterPrevious = await readToolsEditor(page);
        expect(codeAfterPrevious).toContain(SOLVED_MARKER);
        expect(codeAfterPrevious).toContain("n = n - 1");
        expect(codeAfterPrevious).not.toContain(STARTER_MARKER);

        await clickQuestionNext(page);
        await expectToolsEditorNotBlank(page);

        await clickQuestionPrevious(page);

        await waitUntilToolsBoundToExercise(page, "loop-debug-code-3");

        await expectToolsEditorToContain(page, SOLVED_MARKER);
        await expectToolsEditorNotToContain(page, STARTER_MARKER);

        const codeAfterSecondReturn = await readToolsEditor(page);
        expect(codeAfterSecondReturn).toContain(SOLVED_MARKER);
        expect(codeAfterSecondReturn).toContain("n = n - 1");
        expect(codeAfterSecondReturn).not.toContain(STARTER_MARKER);
    });

    test("browser history back and forward do not restore starter over solved learner code", async ({
                                                                                                        page,
                                                                                                    }) => {
        await gotoRealExercise(page);

        await fillToolsEditor(page, SOLVED_CODE);

        await clickCheckThisAnswer(page);
        await waitForCorrect(page);

        await expectToolsEditorToContain(page, SOLVED_MARKER);
        await expectToolsEditorNotToContain(page, STARTER_MARKER);

        await clickQuestionNext(page);
        await expectToolsEditorNotBlank(page);

        await page.goBack();
        await page.waitForLoadState("domcontentloaded");

        await waitUntilToolsBoundToExercise(page, "loop-debug-code-3");

        await expectToolsEditorToContain(page, SOLVED_MARKER);
        await expectToolsEditorNotToContain(page, STARTER_MARKER);

        await page.goForward();
        await page.waitForLoadState("domcontentloaded");
        await expectToolsEditorNotBlank(page);

        await page.goBack();
        await page.waitForLoadState("domcontentloaded");

        await waitUntilToolsBoundToExercise(page, "loop-debug-code-3");

        await expectToolsEditorToContain(page, SOLVED_MARKER);
        await expectToolsEditorNotToContain(page, STARTER_MARKER);

        const codeAfterHistoryBack = await readToolsEditor(page);
        expect(codeAfterHistoryBack).toContain(SOLVED_MARKER);
        expect(codeAfterHistoryBack).toContain("n = n - 1");
        expect(codeAfterHistoryBack).not.toContain(STARTER_MARKER);
    });
});