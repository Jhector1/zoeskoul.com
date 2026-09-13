import { expect, type Locator, type Page } from "@playwright/test";

export type ReviewResetScope = "card" | "topic" | "module";

export function reviewFullIdeEditorInputs(page: Page): Locator {
  return page.getByTestId("code-editor-e2e-input");
}

export async function currentReviewFullIdeEditor(
  page: Page,
): Promise<Locator> {
  const editors = reviewFullIdeEditorInputs(page);
  await expect(editors.first()).toBeAttached({ timeout: 30_000 });

  const count = await editors.count();
  for (let index = count - 1; index >= 0; index -= 1) {
    const candidate = editors.nth(index);
    if (await candidate.isVisible().catch(() => false)) {
      return candidate;
    }
  }

  return editors.last();
}

export async function readCurrentReviewFullIdeEditor(
  page: Page,
): Promise<string> {
  return (await currentReviewFullIdeEditor(page)).inputValue();
}

export async function fillCurrentReviewFullIdeEditor(
  page: Page,
  value: string,
): Promise<void> {
  const editor = await currentReviewFullIdeEditor(page);
  await editor.fill(value);

  await expect
    .poll(() => readCurrentReviewFullIdeEditor(page), {
      timeout: 10_000,
      message: "Expected shared FullIDE editor to contain requested value",
    })
    .toBe(value);
}

export function reviewResetMenuButton(page: Page): Locator {
  return page.getByTestId("review-reset-menu-button");
}

export function reviewResetAction(
  page: Page,
  scope: ReviewResetScope,
): Locator {
  return page.getByTestId(`review-reset-${scope}-button`);
}

export async function openReviewResetMenu(page: Page): Promise<void> {
  const trigger = reviewResetMenuButton(page).first();
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await trigger.click();
}

export async function clickReviewResetAction(
  page: Page,
  scope: ReviewResetScope,
): Promise<void> {
  await openReviewResetMenu(page);

  const action = reviewResetAction(page, scope).first();
  await expect(
    action,
    `Expected current Review reset action "${scope}"`,
  ).toBeVisible({ timeout: 10_000 });
  await action.click();
}

export async function confirmReviewResetIfNeeded(
  page: Page,
): Promise<void> {
  const dialog = page.getByRole("dialog");
  if (!(await dialog.isVisible().catch(() => false))) return;

  const confirm = dialog.getByRole("button", { name: /^Reset$/i });
  await expect(confirm).toBeVisible({ timeout: 10_000 });
  await confirm.click();
  await expect(dialog).not.toBeVisible({ timeout: 20_000 });
}

export async function resetReviewScope(
  page: Page,
  scope: ReviewResetScope,
): Promise<void> {
  await clickReviewResetAction(page, scope);
  await confirmReviewResetIfNeeded(page);
}
