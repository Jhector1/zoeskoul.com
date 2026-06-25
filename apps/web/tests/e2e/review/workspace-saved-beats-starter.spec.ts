import { expect, test, type Locator, type Page } from "@playwright/test";

// Zoeskoul E2E suite pruning: this file is opt-in.
test.skip(process.env.RUN_E2E_LEGACY !== "1", "Legacy broad E2E suite is opt-in. Run with RUN_E2E_LEGACY=1 or pnpm test:e2e:legacy.");


const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

const DEV_CLONE_URL =
    `${BASE_URL}/en/dev/e2e/review-module-clone/python/e2e-review-clone` +
    `/learn/e2e-section/e2e-review-topic/project/review-clone-project-b` +
    `?runnerBackend=judge0`;

async function isVisible(locator: Locator, timeout = 1500): Promise<boolean> {
    try {
        await locator.waitFor({ state: "visible", timeout });
        return true;
    } catch {
        return false;
    }
}

function toolsTree(page: Page) {
    return page.getByTestId("tools-file-tree");
}

function explorerFile(page: Page, name: string) {
    return toolsTree(page).getByText(name, { exact: true }).first();
}

async function bindTools(page: Page) {
    const tree = toolsTree(page);

    if (await isVisible(tree, 1500)) return;

    const openInTools = page
        .getByRole("button", {
            name: /Open in Tools|Bind this question|Bound ✓|Bound/i,
        })
        .last();

    await expect(openInTools).toBeVisible({ timeout: 30_000 });
    await openInTools.click();

    await expect(tree).toBeVisible({ timeout: 30_000 });
}

async function resetTopicIfPossible(page: Page) {
    const resetButton = page.getByTestId("review-reset-topic-button").first();

    if (!(await isVisible(resetButton))) return;

    await resetButton.click();

    const dialog = page.getByRole("dialog");

    if (await isVisible(dialog, 3000)) {
        const resetConfirm = dialog.getByRole("button", { name: /^Reset$/i }).last();
        await expect(resetConfirm).toBeVisible({ timeout: 10_000 });
        await resetConfirm.click();
        await expect(dialog).toBeHidden({ timeout: 10_000 });
    }
}

async function expectEditorContains(page: Page, text: string | RegExp) {
    const editor = page.locator(".monaco-editor").last();
    await expect(editor).toBeVisible({ timeout: 30_000 });
    await expect(editor).toContainText(text, { timeout: 30_000 });
}

async function setEditorText(page: Page, text: string) {
    const editor = page.locator(".monaco-editor").last();
    await expect(editor).toBeVisible({ timeout: 30_000 });
    await editor.click();

    const isMac = process.platform === "darwin";
    await page.keyboard.press(isMac ? "Meta+A" : "Control+A");
    await page.keyboard.type(text);
}

test.describe("workspace precedence", () => {
    test("saved user workspace survives refresh and rebind, reset restores starter", async ({ page }) => {
        test.setTimeout(150_000);

        await page.setViewportSize({ width: 1440, height: 1000 });

        await page.goto(DEV_CLONE_URL, { waitUntil: "domcontentloaded" });
        await expect(page.getByText(/Review Clone Project B/i).first()).toBeVisible({
            timeout: 30_000,
        });

        await resetTopicIfPossible(page);

        await page.goto(DEV_CLONE_URL, { waitUntil: "domcontentloaded" });
        await expect(page.getByText(/Review Clone Project B/i).first()).toBeVisible({
            timeout: 30_000,
        });

        await bindTools(page);

        await expect(explorerFile(page, "main.py")).toBeVisible({ timeout: 30_000 });
        await expectEditorContains(page, "second exercise starter marker");

        const learnerCode =
            "message = 'learner saved workspace marker'\n" +
            "print(message)\n";

        await setEditorText(page, learnerCode);

        /**
         * Let debounced runtime/progress persistence run.
         */
        await page.waitForTimeout(2500);

        await page.reload({ waitUntil: "domcontentloaded" });
        await expect(page.getByText(/Review Clone Project B/i).first()).toBeVisible({
            timeout: 30_000,
        });

        await bindTools(page);

        await expectEditorContains(page, "learner saved workspace marker");
        await expectEditorContains(page, "print(message)");
        await expect(page.locator(".monaco-editor").last()).not.toContainText(
            "second exercise starter marker solved",
        );

        await resetTopicIfPossible(page);

        await page.goto(DEV_CLONE_URL, { waitUntil: "domcontentloaded" });
        await bindTools(page);

        await expectEditorContains(page, "second exercise starter marker");
        await expect(page.locator(".monaco-editor").last()).not.toContainText(
            "learner saved workspace marker",
        );
    });
});