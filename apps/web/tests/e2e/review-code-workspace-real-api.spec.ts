import { expect, test } from "@playwright/test";

const REVIEW_URL =
    process.env.E2E_REVIEW_URL ??
    "/en/catalog/python/subjects/python/modules/python-1/learn/python-1-core-building-blocks/variables-intro/exercise/boxes-print";

test.describe("review workspace persistence through real API", () => {
    test.skip(
        !process.env.E2E_REAL_PROGRESS_API,
        "Set E2E_REAL_PROGRESS_API=1 when test auth and DB seed are available.",
    );

    test("saves and restores tools workspace through real review progress API", async ({
                                                                                           page,
                                                                                       }) => {
        await page.goto(REVIEW_URL);

        await expect(page.getByText("Tools").first()).toBeVisible({
            timeout: 20_000,
        });

        await expect(page.getByText("Loading...")).toHaveCount(0, {
            timeout: 20_000,
        });

        const editorInput = page.getByTestId("code-editor-e2e-input");

        await expect(editorInput).toBeAttached({
            timeout: 20_000,
        });

        const uniqueCode = `print("real api persisted workspace ${Date.now()}")`;

        const saveResponsePromise = page.waitForResponse((res) => {
            if (
                !res.url().includes("/api/review/progress") ||
                res.request().method() !== "PUT"
            ) {
                return false;
            }

            const body = res.request().postData() ?? "";
            return body.includes(uniqueCode.replaceAll('"', '\\"'));
        });

        await editorInput.fill(uniqueCode);

        const saveResponse = await saveResponsePromise;

        expect(saveResponse.status()).toBeGreaterThanOrEqual(200);
        expect(saveResponse.status()).toBeLessThan(300);

        await page.reload();

        await expect(page.getByText("Tools").first()).toBeVisible({
            timeout: 20_000,
        });

        await expect(page.getByText("Loading...")).toHaveCount(0, {
            timeout: 20_000,
        });

        await expect(page.getByTestId("code-editor-e2e-input")).toHaveValue(
            uniqueCode,
            {
                timeout: 20_000,
            },
        );
    });
});