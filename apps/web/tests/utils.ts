import { test, expect, type Page } from "@playwright/test";

export async function replaceMonacoEditorText(page: Page, text: string) {
    const editor = page.locator(".monaco-editor").first();

    await expect(editor).toBeVisible({
        timeout: 30_000,
    });

    await editor.click({
        position: {
            x: 120,
            y: 80,
        },
    });

    await page.keyboard.press(
        process.platform === "darwin" ? "Meta+A" : "Control+A",
    );

    await page.keyboard.type(text);
}


export async function replaceMonacoText(page: Page, text: string) {
    const editor = page.locator(".monaco-editor").first();
    const viewLines = page.locator(".monaco-editor .view-lines").first();

    await expect(editor).toBeVisible({
        timeout: 30_000,
    });

    await viewLines.click({
        position: {
            x: 120,
            y: 40,
        },
        force: true,
    });

    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Backspace");
    await page.keyboard.insertText(text);
}