import { expect, test, type Locator, type Page } from "@playwright/test";

// Zoeskoul E2E suite pruning: this file is opt-in.
test.skip(process.env.RUN_E2E_LEGACY !== "1", "Legacy broad E2E suite is opt-in. Run with RUN_E2E_LEGACY=1 or pnpm test:e2e:legacy.");


const EXERCISE_A_URL =
    "/en/dev/e2e/review-module-clone/python/e2e-review-clone/learn/e2e-section/e2e-review-topic/exercise/e2e-print-name";

const EXERCISE_A_STARTER_MARKER = "print('Hello, ' + name)";
const EXERCISE_A_SOLVED_MARKER = "print(shout('Hello, ' + name))";

const EXERCISE_A_SOLVED = [
    "from helper import shout",
    "name = 'ZoeSkoul learner'",
    "print(shout('Hello, ' + name))",
].join("\n");

function getEditorInputs(page: Page): Locator {
    return page.getByTestId("code-editor-e2e-input");
}

/**
 * The dev review route can render more than one editor textarea.
 * The right Tools editor is last in this shell.
 */
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
    timeout = 30_000,
) {
    await expect
        .poll(() => readToolsEditor(page), { timeout })
        .toContain(expected);
}

async function expectToolsEditorNotBlank(page: Page, timeout = 30_000) {
    await expect
        .poll(async () => (await readToolsEditor(page)).trim(), { timeout })
        .not.toBe("");
}

async function gotoExerciseA(page: Page) {
    /**
     * Do not clear localStorage/sessionStorage with addInitScript here.
     * addInitScript runs again on page.reload(), which would erase the
     * learner workspace before the app can restore it.
     */
    await page.goto(EXERCISE_A_URL);
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByText("Review Clone Project A").first()).toBeVisible({
        timeout: 30_000,
    });

    await expectAnyEditorInput(page);

    await expectToolsEditorNotBlank(page);
    await expectToolsEditorToContain(page, EXERCISE_A_STARTER_MARKER);
}

async function fillToolsEditor(page: Page, code: string) {
    const editor = getToolsEditorInput(page);
    await expect(editor).toBeAttached({ timeout: 30_000 });

    await editor.fill(code);

    await expect
        .poll(() => readToolsEditor(page), { timeout: 10_000 })
        .toBe(code);
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

/**
 * The dev clone route may not expose the production "Check this answer" button.
 * This helper clicks a meaningful action when present, but the persistence tests
 * do not depend on production correctness feedback being rendered here.
 */
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

async function clickRun(page: Page) {
    await clickEnabledButton(page, /^run$/i);
}

async function clickFileTab(page: Page, fileName: string) {
    await clickEnabledButton(
        page,
        new RegExp(`^${fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    );
}

test.describe("dev clone review code_input Tools workspace persistence", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies();
    });

    test("initial exercise route hydrates starter code in the Tools editor", async ({
                                                                                        page,
                                                                                    }) => {
        await gotoExerciseA(page);

        const code = await readToolsEditor(page);

        expect(code).toContain("name = 'ZoeSkoul learner'");
        expect(code).toContain(EXERCISE_A_STARTER_MARKER);
    });

    test("after editing and invoking any available review action, the Tools editor keeps learner code instead of reverting to starter", async ({
                                                                                                                                                   page,
                                                                                                                                               }) => {
        await gotoExerciseA(page);

        await fillToolsEditor(page, EXERCISE_A_SOLVED);
        await clickOptionalReviewAction(page);

        await expectToolsEditorToContain(page, EXERCISE_A_SOLVED_MARKER);

        const codeAfterAction = await readToolsEditor(page);

        expect(codeAfterAction).toContain("from helper import shout");
        expect(codeAfterAction).toContain(EXERCISE_A_SOLVED_MARKER);
        expect(codeAfterAction).not.toContain(EXERCISE_A_STARTER_MARKER);
    });

    test("reload preserves learner code for the first exercise instead of restoring starter", async ({
                                                                                                         page,
                                                                                                     }) => {
        await gotoExerciseA(page);

        await fillToolsEditor(page, EXERCISE_A_SOLVED);
        await clickOptionalReviewAction(page);

        await expectToolsEditorToContain(page, EXERCISE_A_SOLVED_MARKER);

        await page.reload();
        await page.waitForLoadState("domcontentloaded");

        await expect(page.getByText("Review Clone Project A").first()).toBeVisible({
            timeout: 30_000,
        });

        await expectAnyEditorInput(page);

        await expectToolsEditorToContain(page, EXERCISE_A_SOLVED_MARKER);

        const codeAfterReload = await readToolsEditor(page);

        expect(codeAfterReload).toContain("from helper import shout");
        expect(codeAfterReload).toContain(EXERCISE_A_SOLVED_MARKER);
        expect(codeAfterReload).not.toContain(EXERCISE_A_STARTER_MARKER);
    });

    test("running from the Tools editor preserves learner code instead of restoring starter", async ({
                                                                                                         page,
                                                                                                     }) => {
        await gotoExerciseA(page);

        await fillToolsEditor(page, EXERCISE_A_SOLVED);

        await clickRun(page);

        await expectToolsEditorToContain(page, EXERCISE_A_SOLVED_MARKER);

        const codeAfterRun = await readToolsEditor(page);

        expect(codeAfterRun).toContain("from helper import shout");
        expect(codeAfterRun).toContain(EXERCISE_A_SOLVED_MARKER);
        expect(codeAfterRun).not.toContain(EXERCISE_A_STARTER_MARKER);
    });

    test("switching file tabs returns to learner code in main.py instead of restoring starter", async ({
                                                                                                           page,
                                                                                                       }) => {
        await gotoExerciseA(page);

        await fillToolsEditor(page, EXERCISE_A_SOLVED);

        await clickFileTab(page, "helper.py");
        await expectToolsEditorNotBlank(page);

        await clickFileTab(page, "main.py");

        await expectToolsEditorToContain(page, EXERCISE_A_SOLVED_MARKER);

        const codeAfterTabSwitch = await readToolsEditor(page);

        expect(codeAfterTabSwitch).toContain("from helper import shout");
        expect(codeAfterTabSwitch).toContain(EXERCISE_A_SOLVED_MARKER);
        expect(codeAfterTabSwitch).not.toContain(EXERCISE_A_STARTER_MARKER);
    });
});