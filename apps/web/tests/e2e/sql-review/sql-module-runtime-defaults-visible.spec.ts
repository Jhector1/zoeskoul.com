import { expect, test } from "@playwright/test";

const SQL_REVIEW_CLONE_READING_ROUTE =
    "/en/dev/e2e/review-module-clone/sql/e2e-sql-review-clone/learn/e2e-sql-section/e2e-sql-topic/text/e2e-sql-reading";

test.describe("SQL review module runtime defaults", () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            window.localStorage.clear();
            window.sessionStorage.clear();
        });

        await page.setViewportSize({ width: 1440, height: 1000 });
    });

    test("module-level SQL runtimeDefaults hydrate the Tools panel outside exercise scope", async ({ page }) => {
        await page.goto(SQL_REVIEW_CLONE_READING_ROUTE);

        const main = page.getByRole("main");

        await expect(
            main.getByText("SQL module runtimeDefaults"),
        ).toBeVisible({ timeout: 30_000 });

        await expect(
            main.getByText(
                "This card is intentionally not an exercise. The right Tools rail should still receive the module-level SQL dataset.",
            ),
        ).toBeVisible();

        // This is expected: the text card is not bound to an exercise/code-input.
        // The dataset should still hydrate from module runtimeDefaults.
        await expect(page.getByText("Not bound")).toBeVisible();

        const tablesTab = page.getByRole("button", { name: /^Tables$/ }).last();

        await expect(tablesTab).toBeVisible({ timeout: 30_000 });
        await tablesTab.click();

        await expect(page.getByText("No tables available")).toBeHidden();

        await expect(page.getByText("products")).toBeVisible({ timeout: 30_000 });
    });

    test("module SQL runtimeDefaults survive non-exercise card navigation", async ({ page }) => {
        await page.goto(SQL_REVIEW_CLONE_READING_ROUTE);

        const main = page.getByRole("main");

        await expect(
            main.getByText("SQL module runtimeDefaults"),
        ).toBeVisible({ timeout: 30_000 });

        let tablesTab = page.getByRole("button", { name: /^Tables$/ }).last();
        await expect(tablesTab).toBeVisible({ timeout: 30_000 });
        await tablesTab.click();

        await expect(page.getByText("No tables available")).toBeHidden();
        await expect(page.getByText("products")).toBeVisible({ timeout: 30_000 });

        await page.goto(
            "/en/dev/e2e/review-module-clone/sql/e2e-sql-review-clone/learn/e2e-sql-section/e2e-sql-topic/text/e2e-sql-second-reading",
        );

        await expect(
            main.getByText("Second SQL reading card"),
        ).toBeVisible({ timeout: 30_000 });

        tablesTab = page.getByRole("button", { name: /^Tables$/ }).last();
        await expect(tablesTab).toBeVisible({ timeout: 30_000 });
        await tablesTab.click();

        await expect(page.getByText("No tables available")).toBeHidden();
        await expect(page.getByText("products")).toBeVisible({ timeout: 30_000 });

        await page.goto(SQL_REVIEW_CLONE_READING_ROUTE);

        await expect(
            main.getByText("SQL module runtimeDefaults"),
        ).toBeVisible({ timeout: 30_000 });

        tablesTab = page.getByRole("button", { name: /^Tables$/ }).last();
        await expect(tablesTab).toBeVisible({ timeout: 30_000 });
        await tablesTab.click();

        await expect(page.getByText("No tables available")).toBeHidden();
        await expect(page.getByText("products")).toBeVisible({ timeout: 30_000 });
    });
});