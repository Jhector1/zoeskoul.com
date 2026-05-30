import { expect, test, type Locator, type Page } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

const PROJECT_B_URL =
    `${BASE_URL}/en/dev/e2e/review-module-clone/python/e2e-review-clone` +
    `/learn/e2e-section/e2e-review-topic/project/review-clone-project-b` +
    `?runnerBackend=judge0`;

const REVEAL_MULTIFILE_URL =
    `${BASE_URL}/en/dev/e2e/review-module-clone/python/e2e-review-clone` +
    `/learn/e2e-section/e2e-review-topic/project/review-clone-reveal-fill-multifile` +
    `?runnerBackend=judge0`;

async function isVisible(locator: Locator, timeout = 1500) {
    try {
        await locator.waitFor({ state: "visible", timeout });
        return true;
    } catch {
        return false;
    }
}

async function bindTools(page: Page) {
    const openInTools = page
        .getByRole("button", {
            name: /Open in Tools|Bind this question|Bound ✓|Bound/i,
        })
        .last();

    /**
     * Important:
     * Do not return only because the file tree is visible.
     * The file tree may still be from the previous bound exercise after navigation.
     * If the current card exposes an Open/Bind button, click it.
     */
    if (await isVisible(openInTools, 5000)) {
        await openInTools.click();
    }

    await expect(page.getByTestId("tools-file-tree")).toBeVisible({
        timeout: 30_000,
    });
}

async function readEditorText(page: Page): Promise<string> {
    const editor = page.locator(".monaco-editor").last();
    await expect(editor).toBeVisible({ timeout: 30_000 });

    const modelText = await page.evaluate(() => {
        const w = window as unknown as {
            monaco?: {
                editor?: {
                    getModels?: () => Array<{
                        uri?: { toString?: () => string };
                        getValue?: () => string;
                    }>;
                };
            };
        };

        const models = w.monaco?.editor?.getModels?.() ?? [];

        return models
            .map((model) => {
                const value = model.getValue?.() ?? "";
                return value;
            })
            .filter((value) => value.trim().length > 0)
            .join("\n---MODEL---\n");
    });

    if (modelText.trim()) {
        return modelText;
    }

    const visibleLines = await page
        .locator(".monaco-editor .view-lines")
        .last()
        .innerText()
        .catch(() => "");

    const editorText = await editor.innerText().catch(() => "");

    return `${visibleLines}\n${editorText}`;
}

async function setEditorText(page: Page, text: string) {
    const editor = page.locator(".monaco-editor").last();
    await expect(editor).toBeVisible({ timeout: 30_000 });

    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Backspace");
    await page.keyboard.insertText(text);

    await expect.poll(async () => readEditorText(page), {
        timeout: 30_000,
    }).toContain("STALE_NAV_MARKER");
}

async function expectEditorContains(page: Page, value: string | RegExp) {
    await expect.poll(async () => readEditorText(page), {
        timeout: 30_000,
    }).toMatch(value instanceof RegExp ? value : new RegExp(escapeRegExp(value)));
}

async function expectEditorNotContains(page: Page, value: string | RegExp) {
    await expect.poll(async () => readEditorText(page), {
        timeout: 30_000,
    }).not.toMatch(value instanceof RegExp ? value : new RegExp(escapeRegExp(value)));
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function openExplorerFile(page: Page, fileName: string) {
    const tree = page.getByTestId("tools-file-tree");
    await expect(tree).toBeVisible({ timeout: 30_000 });

    const toolsFolder = tree.getByText("tools", { exact: true }).first();

    if (await isVisible(toolsFolder, 1000)) {
        const fileVisible = await isVisible(
            tree.getByText(fileName, { exact: true }).first(),
            500,
        );

        if (!fileVisible) {
            await toolsFolder.click();
        }
    }

    const file = tree.getByText(fileName, { exact: true }).first();
    await expect(file).toBeVisible({ timeout: 30_000 });
    await file.click();
}

test.describe("Tools editor navigation isolation", () => {
    test("navigating to another project does not carry stale bound editor code", async ({ page }) => {
        test.setTimeout(120_000);

        await page.setViewportSize({ width: 1440, height: 1000 });

        await page.goto(PROJECT_B_URL, { waitUntil: "domcontentloaded" });
        await expect(page.getByText(/Review Clone Project B/i).first()).toBeVisible({
            timeout: 30_000,
        });

        await bindTools(page);
        await openExplorerFile(page, "main.py");

        const staleMarker = "STALE_NAV_MARKER";
        const staleCode =
            `# ${staleMarker}\n` +
            `message = "${staleMarker}"\n` +
            "print(message)\n";

        await setEditorText(page, staleCode);
        await expectEditorContains(page, staleMarker);

        await page.waitForTimeout(1200);

        await page.goto(REVEAL_MULTIFILE_URL, { waitUntil: "domcontentloaded" });
        await expect(page.getByText(/Reveal Fill Multi-File/i).first()).toBeVisible({
            timeout: 30_000,
        });

        /**
         * This must actively bind the new project even if the old file tree is still visible.
         */
        await bindTools(page);
        await openExplorerFile(page, "main.py");

        await expectEditorContains(page, "from tools.names import clean_name");
        await expectEditorNotContains(page, staleMarker);
    });
});