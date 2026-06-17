import { expect, test, type Locator, type Page } from "@playwright/test";

const EXERCISE_A_URL =
    "/en/dev/e2e/review-module-clone/python/e2e-review-clone/learn/e2e-section/e2e-review-topic/exercise/e2e-print-name";

const EXERCISE_B_URL =
    "/en/dev/e2e/review-module-clone/python/e2e-review-clone/learn/e2e-section/e2e-review-topic/exercise/e2e-project-step-2";

const STEP_A_STARTER_MARKER = "print('Hello, ' + name)";
const STEP_A_SOLVED_MARKER = "print(shout('Hello, ' + name))";

const STEP_A_SOLVED = [
    "from helper import shout",
    "name = 'ZoeSkoul learner'",
    "print(shout('Hello, ' + name))",
].join("\n");

const STEP_B_STARTER_MARKER = "# TODO: print shipping cost";

function getEditorInputs(page: Page): Locator {
    return page.getByTestId("code-editor-e2e-input");
}

function getToolsEditorInput(page: Page): Locator {
    return getEditorInputs(page).last();
}

async function readToolsEditor(page: Page): Promise<string> {
    const editor = getToolsEditorInput(page);
    await expect(editor).toBeAttached({ timeout: 30_000 });
    return editor.inputValue();
}

async function expectAnyEditorInput(page: Page) {
    await expect
        .poll(async () => getEditorInputs(page).count(), {
            timeout: 30_000,
        })
        .toBeGreaterThan(0);
}

async function expectToolsEditorToContain(
    page: Page,
    expected: string,
    timeout = 45_000,
) {
    await expect
        .poll(() => readToolsEditor(page), { timeout })
        .toContain(expected);
}

async function expectToolsEditorNotToContain(
    page: Page,
    unexpected: string,
    timeout = 45_000,
) {
    await expect
        .poll(() => readToolsEditor(page), { timeout })
        .not.toContain(unexpected);
}

async function expectToolsEditorNotBlank(page: Page, timeout = 45_000) {
    await expect
        .poll(async () => (await readToolsEditor(page)).trim(), { timeout })
        .not.toBe("");
}

async function gotoExerciseA(page: Page) {
    await page.goto(EXERCISE_A_URL);
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByText("Review Clone Project A").first()).toBeVisible({
        timeout: 30_000,
    });

    await expectAnyEditorInput(page);
    await expectToolsEditorNotBlank(page);
    await expectToolsEditorToContain(page, STEP_A_STARTER_MARKER);
}

async function gotoExerciseB(page: Page) {
    await page.goto(EXERCISE_B_URL);
    await page.waitForLoadState("domcontentloaded");

    await expectAnyEditorInput(page);
    await expectToolsEditorNotBlank(page);
    await expectToolsEditorToContain(page, STEP_B_STARTER_MARKER);
}

async function fillToolsEditor(page: Page, code: string) {
    const editor = getToolsEditorInput(page);
    await expect(editor).toBeAttached({ timeout: 30_000 });

    await editor.fill(code);

    await expect
        .poll(() => readToolsEditor(page), { timeout: 10_000 })
        .toBe(code);
}

async function clickFirstVisibleEnabled(locators: Locator[]) {
    for (const locator of locators) {
        const count = await locator.count();

        for (let index = count - 1; index >= 0; index -= 1) {
            const button = locator.nth(index);

            if ((await button.isVisible()) && (await button.isEnabled())) {
                await button.click();
                return true;
            }
        }
    }

    return false;
}

async function clickOptionalReviewAction(page: Page) {
    await clickFirstVisibleEnabled([
        page.getByRole("button", { name: /check this answer/i }),
        page.getByRole("button", { name: /^check$/i }),
        page.getByRole("button", { name: /^submit$/i }),
        page.getByRole("button", { name: /mark as read/i }),
        page.getByRole("button", { name: /run tests/i }),
        page.getByRole("button", { name: /^run$/i }),
        page.getByRole("button", { name: /run code/i }),
        page.getByRole("button", { name: /continue/i }),
    ]);
}

test.describe("dev clone exercise browser back/forward Tools persistence", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies();
    });

    test("exercise A hydrates starter code in Tools", async ({ page }) => {
        await gotoExerciseA(page);

        const code = await readToolsEditor(page);

        expect(code).toContain("name = 'ZoeSkoul learner'");
        expect(code).toContain(STEP_A_STARTER_MARKER);
    });

    test("browser back from exercise B restores learner code for exercise A, not starter", async ({
                                                                                                      page,
                                                                                                  }) => {
        await gotoExerciseA(page);

        await fillToolsEditor(page, STEP_A_SOLVED);
        await clickOptionalReviewAction(page);

        await expectToolsEditorToContain(page, STEP_A_SOLVED_MARKER);
        await expectToolsEditorNotToContain(page, STEP_A_STARTER_MARKER);

        await gotoExerciseB(page);

        await page.goBack();
        await page.waitForLoadState("domcontentloaded");

        await expectToolsEditorToContain(page, STEP_A_SOLVED_MARKER);
        await expectToolsEditorNotToContain(page, STEP_A_STARTER_MARKER);

        const codeAfterBack = await readToolsEditor(page);

        expect(codeAfterBack).toContain("from helper import shout");
        expect(codeAfterBack).toContain(STEP_A_SOLVED_MARKER);
        expect(codeAfterBack).not.toContain(STEP_A_STARTER_MARKER);
    });

    test("browser back forward back keeps learner code for exercise A", async ({
                                                                                   page,
                                                                               }) => {
        await gotoExerciseA(page);

        await fillToolsEditor(page, STEP_A_SOLVED);
        await clickOptionalReviewAction(page);

        await expectToolsEditorToContain(page, STEP_A_SOLVED_MARKER);

        await gotoExerciseB(page);

        await page.goBack();
        await page.waitForLoadState("domcontentloaded");

        await expectToolsEditorToContain(page, STEP_A_SOLVED_MARKER);
        await expectToolsEditorNotToContain(page, STEP_A_STARTER_MARKER);

        await page.goForward();
        await page.waitForLoadState("domcontentloaded");

        await expectToolsEditorToContain(page, STEP_B_STARTER_MARKER);

        await page.goBack();
        await page.waitForLoadState("domcontentloaded");

        await expectToolsEditorToContain(page, STEP_A_SOLVED_MARKER);
        await expectToolsEditorNotToContain(page, STEP_A_STARTER_MARKER);

        const finalCode = await readToolsEditor(page);

        expect(finalCode).toContain("from helper import shout");
        expect(finalCode).toContain(STEP_A_SOLVED_MARKER);
        expect(finalCode).not.toContain(STEP_A_STARTER_MARKER);
    });
});