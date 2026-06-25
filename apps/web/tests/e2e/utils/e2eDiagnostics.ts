import type { Page, TestInfo } from '@playwright/test';

export function logE2EStep(testInfo: TestInfo, message: string, details?: Record<string, unknown>) {
  const suffix = details ? ` ${JSON.stringify(details)}` : '';
  console.info(`[e2e:${testInfo.titlePath.join(' > ')}] ${message}${suffix}`);
}

export async function logE2EPageSnapshot(page: Page, testInfo: TestInfo, label: string) {
  const url = page.url();
  const title = await page.title().catch(() => '');
  const bodyText = await page.locator('body').innerText({ timeout: 1000 }).catch(() => '');
  console.info(`[e2e:${testInfo.titlePath.join(' > ')}] ${label} ${JSON.stringify({
    url,
    title,
    bodyPreview: bodyText.slice(0, 1000),
  })}`);
}

export const RUNNER_E2E_ENABLED = process.env.RUNNER_E2E === '1';
export const LEGACY_E2E_ENABLED = process.env.RUN_E2E_LEGACY === '1';
export const IDE_E2E_ENABLED = process.env.RUN_IDE_E2E === '1';
