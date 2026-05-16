import { expect, test } from "@playwright/test";

test.use({
    viewport: {
        width: 1440,
        height: 1000,
    },
});

const DIRECT_TOOLS_ROUTE =
    "/en/dev/e2e/review-module-clone/python-v2/e2e-review-clone/learn/e2e-section/e2e-review-topic/exercise/e2e-print-name";

test.describe("code_input Fill answer visibility", () => {
    test("direct Tools editor route does not expose a second Fill answer button", async ({
                                                                                             page,
                                                                                         }) => {
        await page.goto(DIRECT_TOOLS_ROUTE);

        // The direct exercise/tools route should load the real editor surface.
        await expect(page.getByTestId("code-editor-e2e-input").first()).toBeAttached({
            timeout: 15_000,
        });

        // This route should not expose Fill answer directly.
        // Fill answer belongs to the existing reveal/help flow only.
        await expect(page.getByRole("button", { name: /fill answer/i })).toHaveCount(0);

        // Make sure the outdated product copy is gone too.
        await expect(
            page.getByText(/Fill answer directly in the Tools pane/i),
        ).toHaveCount(0);
    });
});