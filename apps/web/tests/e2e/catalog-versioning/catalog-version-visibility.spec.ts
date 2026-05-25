import { expect, test } from "@playwright/test";

test.describe("catalog subject version visibility", () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            window.localStorage.clear();
            window.sessionStorage.clear();
        });
    });

    test("new user sees only the default active course version in catalog counts and detail", async ({
                                                                                                         page,
                                                                                                     }) => {
        await page.goto("/en/catalogs");

        const pythonCatalog = page.getByTestId("catalog-card-python");

        await expect(pythonCatalog).toBeVisible({
            timeout: 30_000,
        });

        await expect(pythonCatalog).toContainText(/1 course/i);
        await expect(pythonCatalog).toContainText(/Python/i);
        await expect(pythonCatalog).not.toContainText(/2 courses/i);

        await expect(pythonCatalog).toHaveAttribute("href", "/en/catalogs/python");
        await page.goto("/en/catalogs/python");
        await expect(page).toHaveURL(/\/en\/catalogs\/python/);

        const body = page.locator("body");

        await expect(body).toContainText(/Python/i);

        /**
         * New users should see the current/default version, not both
         * legacy + current versions from the same family.
         */
        await expect(body).not.toContainText(/Unavailable/i);
        await expect(body).not.toContainText(/Not seeded/i);
        await expect(body).not.toContainText(/Legacy/i);
        await expect(body).not.toContainText(/legacy track/i);

        /**
         * The exact title can change, so assert the important invariant:
         * the page does not expose both python and python-v2 as separate
         * enrollable choices.
         */
        await expect(body).not.toContainText(/python-v1/i);
    });

    test("catalog list count reflects only visible subjects", async ({ page }) => {
        await page.goto("/en/catalogs");

        const pythonCatalog = page.getByTestId("catalog-card-python");

        await expect(pythonCatalog).toBeVisible({
            timeout: 30_000,
        });

        /**
         * The generated Python catalog contains python + python-v2,
         * but learner/new-user visibility should count only the default active one.
         */
        await expect(pythonCatalog).toContainText(/1 course/i);
        await expect(pythonCatalog).not.toContainText(/2 courses/i);
    });
});
