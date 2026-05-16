import { expect, test, type Locator, type Page } from "@playwright/test";

test.use({
    viewport: {
        width: 1440,
        height: 1000,
    },
});

const ROUTE =
    "/en/catalog/python/subjects/python-v2/modules/python-v2-0/learn/python-v2-0-setup-and-first-programs/running-python-code/code/running-python-code_q4c1_print_greeting";

async function getCodeEditors(page: Page) {
    const editors = page.getByTestId("code-editor-e2e-input");

    await expect(editors.first()).toBeAttached({
        timeout: 15_000,
    });

    return editors;
}

async function pickBoundToolsEditor(page: Page): Promise<Locator> {
    const editors = await getCodeEditors(page);
    const count = await editors.count();

    for (let i = count - 1; i >= 0; i -= 1) {
        const editor = editors.nth(i);
        const value = await editor.inputValue().catch(() => "");

        if (
            value.includes("# Write your code below") ||
            value.includes("Hello, ZoeSkoul") ||
            value.includes("print(")
        ) {
            return editor;
        }
    }

    return editors.nth(Math.max(0, count - 1));
}

async function setEditorValue(editor: Locator, value: string) {
    await editor.evaluate((node, nextValue) => {
        const textarea = node as HTMLTextAreaElement;
        const setter = Object.getOwnPropertyDescriptor(
            HTMLTextAreaElement.prototype,
            "value",
        )?.set;

        setter?.call(textarea, nextValue);

        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
}

test("ReviewModule Fill answer patches the bound right-side Tools editor", async ({
                                                                                      page,
                                                                                  }) => {
    await page.goto(ROUTE);

    await expect(page.getByRole("button", { name: /fill answer/i })).toBeVisible({
        timeout: 15_000,
    });

    const editor = await pickBoundToolsEditor(page);

    await setEditorValue(editor, "# wrong code");

    await expect
        .poll(async () => editor.inputValue(), {
            timeout: 15_000,
            message: "Expected test to control the bound Tools editor",
        })
        .toContain("# wrong code");

    await page.getByRole("button", { name: /fill answer/i }).click();

    await expect
        .poll(async () => editor.inputValue(), {
            timeout: 15_000,
            message: "Fill answer should patch the bound right-side Tools editor",
        })
        .toContain('print("Hello, ZoeSkoul!")');
});