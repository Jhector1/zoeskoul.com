import { expect, test, type Locator, type Page } from "@playwright/test";
import { replaceMonacoText } from "../../utils";

type RenderedExerciseState = {
  exerciseId: string;
  exerciseKey: string;
  code: string;
  language: string;
  ideConfig: Record<string, unknown> | null;
  starterCode?: string;
  starterFiles?: unknown;
  workspace?: unknown;
  recipe?: unknown;
};

const PYTHON_CLONE_BASE =
  "/en/dev/e2e/review-module-clone/python/e2e-review-clone/learn/e2e-section/e2e-review-topic";
const LINUX_CLONE_BASE =
  "/en/dev/e2e/review-module-clone/linux/e2e-terminal-review-clone/learn/e2e-terminal-section/e2e-terminal-topic";

test.describe("dev clone curriculum i18n + workspace runtime regressions", () => {
  test.use({ viewport: { width: 1180, height: 920 } });

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    await context.addInitScript(() => {
      try {
        window.localStorage.clear();
        window.sessionStorage.clear();
      } catch {
        // ignore storage access issues
      }
    });
  });

  test("Python dev clone embedded Try It resolves @: starterCode before QuizBlock binding", async ({ page }) => {
    await page.goto(`${PYTHON_CLONE_BASE}/text/e2e-i18n-tryit-reading?e2eUnlockAll=1`, {
      waitUntil: "domcontentloaded",
    });

    const raw = await page
      .getByTestId("cardrenderer-tryit-spec-e2e-input")
      .first()
      .inputValue({ timeout: 30_000 });
    const contract = JSON.parse(raw) as {
      tryItId: string;
      quizKey: string;
      spec: {
        steps?: Array<Record<string, unknown>>;
      };
      firstStep: Record<string, unknown> | null;
    };

    expect(contract.tryItId).toBe("try-e2e-i18n-starter");
    expect(contract.firstStep?.id).toBe("e2e-i18n-starter");
    expect(contract.firstStep?.exerciseKey).toBe("e2e-i18n-starter");

    const serialized = JSON.stringify(contract);
    expect(serialized).toContain("age = int(input())");
    expect(serialized).toContain("has_id = input().strip()");
    expect(serialized).toContain("TODO: print allowed or denied");
    expect(serialized).not.toContain("@:");

    await expectVisiblePageNotToContainRawTaggedKey(page);
  });

  test("Python dev clone direct project exercise resolves @: starterCode before Tools binding", async ({ page }) => {
    await page.goto(`${PYTHON_CLONE_BASE}/exercise/e2e-i18n-starter?e2eUnlockAll=1`, {
      waitUntil: "domcontentloaded",
    });

    const state = await waitForRenderedExerciseState(page, (item) =>
      item.exerciseId === "e2e-i18n-starter" || item.exerciseKey.includes("e2e-i18n-starter"),
    );

    expectPythonI18nStarterState(state);
    await expectVisiblePageNotToContainRawTaggedKey(page);
  });

  test("Python embedded Try It reset clears persisted learner workspace and restores starter on reload", async ({ page }) => {
    const savedBodies: any[] = [];
    let currentProgress: any = { topics: {} };

    await page.route("**/api/review/progress**", async (route) => {
      const request = route.request();

      if (request.method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            progress: currentProgress,
          }),
        });
        return;
      }

      if (request.method() === "PUT") {
        const body = request.postDataJSON();
        savedBodies.push(body);
        currentProgress = body.state;

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            state: body.state,
          }),
        });
        return;
      }

      await route.fallback();
    });

    const route = `${PYTHON_CLONE_BASE}/text/e2e-i18n-tryit-reading?e2eUnlockAll=1`;
    const learnerMarker = "# embedded try-it learner marker";

    await page.goto(route, {
      waitUntil: "domcontentloaded",
    });

    await openCodeWorkspaceIfPresent(page);
    await expectAnyVisibleEditorToContain(page, "age = int(input())");

    await replaceMonacoText(
      page,
      [
        "age = int(input())",
        "has_id = input().strip()",
        learnerMarker,
        "print('learner saved workspace')",
      ].join("\n"),
    );

    await expect
      .poll(
        () => savedBodies.some((body) => JSON.stringify(body).includes(learnerMarker)),
        {
          timeout: 20_000,
          message: "Expected embedded Try It learner workspace to be persisted before reset",
        },
      )
      .toBe(true);

    await page.getByTestId("review-reset-menu-button").first().click();
    await page.getByRole("button", { name: /This exercise/i }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole("button", { name: /^Reset$/i }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    await expect
      .poll(
        () => JSON.stringify(currentProgress),
        {
          timeout: 20_000,
          message: "Expected reset save to clear the embedded Try It learner workspace from persisted progress",
        },
      )
      .not.toContain(learnerMarker);

    await page.goto(route, {
      waitUntil: "domcontentloaded",
    });

    await openCodeWorkspaceIfPresent(page);
    await expectAnyVisibleEditorToContain(page, "age = int(input())");
    await expectAnyVisibleEditorToContain(page, "TODO: print allowed or denied");
    await expectNoVisibleEditorToContain(page, learnerMarker);
  });

  test("Linux dev clone contract binds terminal_workspace cwd and resolved feedback", async ({ page }) => {
    await page.goto(`${LINUX_CLONE_BASE}/text/e2e-linux-terminal-cwd-reading?e2eUnlockAll=1`, {
      waitUntil: "domcontentloaded",
    });

    const raw = await page
      .getByTestId("dev-clone-linux-terminal-contract-e2e-input")
      .inputValue({ timeout: 30_000 });
    const contract = JSON.parse(raw) as {
      exerciseId: string;
      exerciseKey: string;
      language: string;
      runtimeDefaults: Record<string, unknown>;
      serviceDefaults: {
        runnerBackend?: string;
        layoutMode?: string;
        requires?: Record<string, unknown>;
      };
      ideConfig: Record<string, unknown>;
      recipe: Record<string, unknown>;
      terminalCwd: string;
    };

    expect(contract.exerciseId).toBe("e2e-linux-terminal-cwd");
    expect(contract.exerciseKey).toBe("e2e-linux-terminal-cwd");
    expect(contract.language).toBe("bash");
    expect(contract.serviceDefaults.runnerBackend).toBe("pty");
    expect(contract.serviceDefaults.layoutMode).toBe("terminal_workspace");
    expect(contract.serviceDefaults.requires?.terminal).toBe(true);
    expect(contract.ideConfig.layoutMode).toBe("terminal_workspace");
    expect(contract.ideConfig.runnerBackend).toBe("pty");
    expect(contract.ideConfig.terminalCwd).toBe("/workspace/park-terminal-map");
    expect(contract.terminalCwd).toBe("/workspace/park-terminal-map");

    const serialized = JSON.stringify(contract);
    expect(serialized).not.toContain("@:");
    expect(serialized).toContain("Use ls inside park-terminal-map");

    await expectVisiblePageNotToContainRawTaggedKey(page);
  });

  test("Linux dev clone embedded PTY starts in authored cwd when local runner is healthy", async ({ page }) => {
    test.skip(process.env.RUNNER_E2E !== "1", "Set RUNNER_E2E=1 to run the PTY-backed cwd smoke test.");

    await page.goto(`${LINUX_CLONE_BASE}/text/e2e-linux-terminal-cwd-reading?e2eUnlockAll=1&backend=pty`, {
      waitUntil: "domcontentloaded",
    });

    await openCodeWorkspaceIfPresent(page);

    const terminal = page.getByTestId("interactive-terminal").first();
    const transcript = page.getByTestId("interactive-terminal-transcript").first();

    await expect(terminal).toBeVisible({ timeout: 60_000 });
    await waitForTerminalNotInRunnerError(page, transcript);

    await terminal.click();
    await page.keyboard.type("pwd");
    await page.keyboard.press("Enter");
    await expect(transcript).toContainText("/workspace/park-terminal-map", { timeout: 30_000 });

    await page.keyboard.type("ls");
    await page.keyboard.press("Enter");
    await expect(transcript).toContainText(/\bhandoff\b/, { timeout: 30_000 });
    await expect(transcript).toContainText(/\bmaps\b/, { timeout: 30_000 });
    await expect(transcript).toContainText(/\brequests\b/, { timeout: 30_000 });
  });
});

function expectPythonI18nStarterState(state: RenderedExerciseState) {
  expect(state.language).toBe("python");
  expect(state.code).toMatch(/age\s*=\s*int\(input\(\)\)/);
  expect(state.code).toMatch(/has_id\s*=\s*input\(\)\.strip\(\)/);
  expect(state.code).toMatch(/TODO: print allowed or denied/);
  expect(state.code.trim()).not.toBe("");

  const serialized = JSON.stringify(state);
  expect(serialized).not.toContain("@:");
}

async function waitForRenderedExerciseState(
  page: Page,
  predicate: (item: RenderedExerciseState) => boolean,
  timeoutMs = 60_000,
): Promise<RenderedExerciseState> {
  const deadline = Date.now() + timeoutMs;
  let lastStates: RenderedExerciseState[] = [];

  while (Date.now() < deadline) {
    const inputs = page.getByTestId("exercise-renderer-state-e2e-input");
    const count = await inputs.count().catch(() => 0);
    lastStates = [];

    for (let index = 0; index < count; index += 1) {
      const raw = await inputs.nth(index).inputValue().catch(() => "");
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw) as RenderedExerciseState;
        lastStates.push(parsed);
        if (predicate(parsed)) return parsed;
      } catch {
        // ignore malformed transient values
      }
    }

    await page.waitForTimeout(250);
  }

  throw new Error(
    "Timed out waiting for rendered exercise state. Last states: " +
      JSON.stringify(lastStates.slice(0, 5), null, 2),
  );
}

async function openCodeWorkspaceIfPresent(page: Page) {
  const openButton = page
    .getByRole("button", { name: /open code|jump to code|open in tools/i })
    .first();

  if (await openButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await openButton.click();
  }

  const codeTab = page.getByRole("tab", { name: /^Code$/i }).first();
  if (await codeTab.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await codeTab.click();
  }

  await Promise.race([
    page.getByTestId("fullide-editor-e2e-input").first().waitFor({ state: "attached", timeout: 15_000 }).catch(() => null),
    page.getByTestId("code-editor-e2e-input").first().waitFor({ state: "attached", timeout: 15_000 }).catch(() => null),
    page.getByTestId("interactive-terminal").first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => null),
  ]);
}

async function getVisibleEditorValues(page: Page): Promise<string[]> {
  const selectors = ["fullide-editor-e2e-input", "code-editor-e2e-input"] as const;
  const values: string[] = [];

  for (const testId of selectors) {
    const inputs = page.getByTestId(testId);
    const count = await inputs.count().catch(() => 0);

    for (let index = 0; index < count; index += 1) {
      const value = await inputs
        .nth(index)
        .evaluate((node) => {
          const el = node as HTMLTextAreaElement;
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);

          const visible =
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== "none" &&
            style.visibility !== "hidden";

          return visible ? el.value : null;
        })
        .catch(() => null);

      if (typeof value === "string") values.push(value);
    }
  }

  return values;
}

async function expectAnyVisibleEditorToContain(page: Page, text: string | RegExp) {
  await expect
    .poll(
      async () => {
        const values = await getVisibleEditorValues(page);

        return values.some((value) =>
          typeof text === "string" ? value.includes(text) : text.test(value),
        );
      },
      {
        timeout: 20_000,
      },
    )
    .toBe(true);
}

async function expectNoVisibleEditorToContain(page: Page, text: string) {
  await expect
    .poll(
      async () => {
        const values = await getVisibleEditorValues(page);
        return values.every((value) => !value.includes(text));
      },
      {
        timeout: 20_000,
      },
    )
    .toBe(true);
}

async function waitForTerminalNotInRunnerError(page: Page, transcript: Locator) {
  await expect(transcript).toBeAttached({ timeout: 60_000 });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.waitForTimeout(attempt === 0 ? 3_000 : 6_000);
    const text = await transcript.textContent().catch(() => "");

    if (!/Runner fetch failed|ECONNRESET|sessions\/start/i.test(text ?? "")) {
      return;
    }

    const restart = page.getByRole("button", { name: /restart terminal/i }).first();
    if (await restart.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await restart.click();
    } else {
      await page.reload({ waitUntil: "domcontentloaded" });
      await openCodeWorkspaceIfPresent(page);
    }
  }

  const finalText = await transcript.textContent().catch(() => "");
  throw new Error(
    "Workspace terminal could not start. This is runner availability, not curriculum i18n/cwd logic. Transcript:\n" +
      finalText,
  );
}

async function expectVisiblePageNotToContainRawTaggedKey(page: Page) {
  await expect(page.locator("body")).not.toContainText("@:topics", { timeout: 2_000 });
  await expect(page.locator("body")).not.toContainText("@:sketches", { timeout: 2_000 });
}
