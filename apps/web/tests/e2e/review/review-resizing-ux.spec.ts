import { expect, test, type Locator, type Page } from "@playwright/test";

const REVIEW_URL =
  "/en/dev/e2e/review-module-clone/python/e2e-review-clone/learn/e2e-section/e2e-review-topic/exercise/e2e-print-name";

async function mockWorkspaceApis(page: Page) {
  await page.route("**/api/review/progress**", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { progress: null } });
    }
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/review/module-nav**", (route) =>
    route.fulfill({
      json: {
        prevModuleId: null,
        nextModuleId: null,
        nextLocked: false,
        nextBillingHref: null,
        index: 1,
        total: 1,
      },
    }),
  );
  await page.route("**/api/review/subject-finish**", (route) =>
    route.fulfill({
      json: {
        status: "in_progress",
        certificateReady: false,
        certificateIssued: false,
      },
    }),
  );
  await page.route("**/api/gamification/me**", (route) =>
    route.fulfill({
      json: {
        summary: {
          totalXp: 0,
          level: 1,
          currentStreak: 0,
          levelProgressPct: 0,
        },
      },
    }),
  );
  await page.route("**/api/tools/doc**", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { doc: null } });
    }
    return route.fulfill({ json: { ok: true } });
  });
}

async function dragTo(page: Page, handle: Locator, x: number) {
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.locator("[data-workspace-resize-drag-shield]"))
    .toHaveCount(1);
  await page.mouse.move(x, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator("[data-workspace-resize-drag-shield]"))
    .toHaveCount(0);
}

test("review rails resize continuously to both recoverable edges", async ({ page }) => {
  await page.setViewportSize({ width: 1_600, height: 1_000 });
  await mockWorkspaceApis(page);
  await page.goto(REVIEW_URL, { waitUntil: "domcontentloaded" });

  const rightRail = page.locator("[data-review-right-rail]");
  await expect(page.locator("[data-review-left-rail]")).toBeVisible({
    timeout: 20_000,
  });
  if (!(await rightRail.isVisible())) {
    await page.getByRole("button", { name: /^Tools/ }).click();
  }
  await expect(rightRail).toBeVisible();

  const rightHandle = page.locator("[data-review-right-resize-handle]");
  await dragTo(page, rightHandle, 1_590);
  await expect.poll(async () => (await rightRail.boundingBox())?.width ?? 0)
    .toBeLessThanOrEqual(52);

  await dragTo(page, rightHandle, 100);
  await expect.poll(async () => (await rightRail.boundingBox())?.width ?? 0)
    .toBeGreaterThan(1_000);

  await rightHandle.press("Home");
  await expect.poll(async () => (await rightRail.boundingBox())?.width ?? 0)
    .toBeLessThanOrEqual(52);

  const leftRail = page.locator("[data-review-left-rail]");
  if (!(await leftRail.isVisible())) {
    await page.getByRole("button", { name: "Modules" }).click();
  }
  await expect(leftRail).toBeVisible();

  const leftHandle = page.locator("[data-review-left-resize-handle]");
  await dragTo(page, leftHandle, 10);
  await expect.poll(async () => (await leftRail.boundingBox())?.width ?? 0)
    .toBeLessThanOrEqual(52);

  await dragTo(page, leftHandle, 1_500);
  await expect.poll(async () => (await leftRail.boundingBox())?.width ?? 0)
    .toBeGreaterThan(1_000);

  await expect(rightRail).toBeVisible();
  await expect(page.getByRole("button", { name: /^Tools/ })).toBeVisible();
});

test("Monaco input remains functional with the shared resizing runtime", async ({ page }) => {
  await page.setViewportSize({ width: 1_440, height: 900 });
  await page.goto("/en/dev/e2e/sketch-save", { waitUntil: "domcontentloaded" });

  const editor = page.locator(".monaco-editor").first();
  await expect(editor).toBeVisible({ timeout: 20_000 });

  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("\n# resize-still-editable");
  await expect(editor.locator(".view-lines")).toContainText(
    "resize-still-editable",
  );
});
