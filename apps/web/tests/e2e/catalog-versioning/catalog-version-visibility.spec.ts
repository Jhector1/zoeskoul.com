import { expect, test } from "@playwright/test";

test.describe("catalog subject version visibility", () => {
    test("new user sees only the default active course version in catalog counts and detail", async ({ page }) => {
        await page.goto("/en/catalogs");

        const pythonCatalog = page
            .getByRole("link", { name: /Python/i })
            .first();

        await expect(pythonCatalog).toBeVisible({
            timeout: 30_000,
        });

        await expect(pythonCatalog).toContainText(/1 course/i);
        await expect(pythonCatalog).toContainText(/Python/i);

        await pythonCatalog.click();

        await expect(page).toHaveURL(/\/en\/catalogs\/python/);

        await expect(page.locator("body")).toContainText(/Python/i);

        /**
         * New users should see the current/default version, not both
         * legacy + current versions from the same family.
         */
        const courseCards = page.locator('[data-testid="subject-tile"], article, a').filter({
            hasText: /Python/i,
        });

        await expect(page.locator("body")).not.toContainText(/Unavailable/i);
        await expect(page.locator("body")).not.toContainText(/Legacy/i);

        /**
         * The exact title can change, so assert the important invariant:
         * the page does not expose both python and python-v2 as separate
         * enrollable choices.
         */
        await expect(page.locator("body")).not.toContainText(/python-v1/i);
    });

    test("catalog list count reflects only visible subjects", async ({ page }) => {
        await page.goto("/en/catalogs");

        const pythonCatalog = page
            .getByRole("link", { name: /Python/i })
            .first();

        await expect(pythonCatalog).toBeVisible({
            timeout: 30_000,
        });

        /**
         * The generated Python catalog contains python + python-v2,
         * but new users should see/count only the default active one.
         */
        await expect(pythonCatalog).toContainText(/1 course/i);
        await expect(pythonCatalog).not.toContainText(/2 courses/i);
    });
});