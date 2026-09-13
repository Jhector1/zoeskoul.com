import { expect, test, type Locator, type Page } from "@playwright/test";

import { currentReviewFullIdeEditor, fillCurrentReviewFullIdeEditor, readCurrentReviewFullIdeEditor, resetReviewScope } from "./support/reviewUi";
const EXERCISE_URL =
  "/en/dev/e2e/review-module-clone/python/e2e-review-clone/learn/e2e-section/e2e-review-topic/exercise/e2e-print-name";

const STARTER_MAIN =
  "name = 'ZoeSkoul learner'\nprint('Hello, ' + name)\n";
const STARTER_HELPER =
  "def shout(value):\n    return value.upper()\n";
const SENTINEL = "__ZOESKOUL_RESET_TOPIC_SENTINEL_7f9d2c__";

type ProgressHarness = {
  savedBodies: any[];
  getSavedProgress: () => any;
};

async function expectEditorContains(
  page: Page,
  text: string,
  message: string,
  timeout = 20_000,
) {
  await expect.poll(() => readCurrentReviewFullIdeEditor(page), { timeout, message }).toContain(text);
}

async function expectEditorExcludes(
  page: Page,
  text: string,
  message: string,
  timeout = 20_000,
) {
  await expect.poll(() => readCurrentReviewFullIdeEditor(page), { timeout, message }).not.toContain(text);
}

async function assertNoInvalidPracticeFallback(page: Page, where: string) {
  await expect(
    page.getByText("Invalid topic/filters", { exact: true }),
    `${where}: dev Review clone must use deterministic E2E practice instead of the real curriculum filter path`,
  ).toHaveCount(0);
}

async function installDeterministicReviewHarness(
  page: Page,
): Promise<ProgressHarness> {
  let savedProgress: any = null;
  const savedBodies: any[] = [];

  await page.route("**/api/review/progress**", async (route) => {
    const request = route.request();

    if (request.method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ progress: savedProgress }),
      });
    }

    if (request.method() === "PUT") {
      const body = request.postDataJSON() as any;
      savedBodies.push(body);
      savedProgress = body?.state ?? null;

      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, state: savedProgress }),
      });
    }

    return route.fallback();
  });

  await page.route("**/api/practice**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === "/api/practice/validate") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          correct: true,
          feedback: null,
        }),
      });
    }

    if (url.pathname !== "/api/practice") {
      return route.fallback();
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        key: "e2e-reset-topic-practice-key",
        sessionId: "e2e-reset-topic-practice-session",
        exercise: {
          id: "e2e-print-name",
          exerciseKey: "e2e-print-name",
          kind: "code_input",
          title: "Edit and run starter code",
          prompt: "Edit and run starter code",
          language: "python",
          runtime: {
            kind: "code",
            language: "python",
          },
          workspace: {
            language: "python",
            entryFile: "main.py",
            starterFiles: {
              "main.py": STARTER_MAIN,
              "helper.py": STARTER_HELPER,
            },
            solutionFiles: {
              "main.py":
                "from helper import shout\nname = 'ZoeSkoul learner'\nprint(shout('Hello, ' + name))\n",
              "helper.py": STARTER_HELPER,
            },
          },
          starterCode: STARTER_MAIN,
          solutionCode:
            "from helper import shout\nname = 'ZoeSkoul learner'\nprint(shout('Hello, ' + name))\n",
        },
        run: {
          maxAttempts: 3,
          allowReveal: true,
          help: {
            stepKeys: ["concept", "hint_1", "hint_2", "reveal"],
          },
        },
      }),
    });
  });

  return {
    savedBodies,
    getSavedProgress: () => savedProgress,
  };
}

async function openExercise(page: Page) {
  const response = await page.goto(EXERCISE_URL, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });

  expect(response?.status() ?? 0).toBeLessThan(400);
  await assertNoInvalidPracticeFallback(page, "initial exercise load");

  await expectEditorContains(
    page,
    "name = 'ZoeSkoul learner'",
    "Dev Review clone should mount the canonical starter",
  );
  await expectEditorContains(
    page,
    "print('Hello, ' + name)",
    "Dev Review clone should mount the complete canonical starter",
  );
}

async function writeSentinel(page: Page) {
  await fillCurrentReviewFullIdeEditor(page, SENTINEL);

  await expect
    .poll(() => readCurrentReviewFullIdeEditor(page), {
      timeout: 10_000,
      message: "Expected learner sentinel in the shared mounted editor",
    })
    .toBe(SENTINEL);
}

async function waitForSentinelSave(harness: ProgressHarness) {
  await expect
    .poll(
      () =>
        harness.savedBodies.some((body) =>
          JSON.stringify(body).includes(SENTINEL),
        ),
      {
        timeout: 20_000,
        message:
          "Expected sentinel to reach server-backed Review progress before reset",
      },
    )
    .toBe(true);
}

test.describe("Review current Reset Topic contract", () => {
  test("Reset Topic discards saved learner code and restores the canonical starter without Invalid topic/filters", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await page.addInitScript(() => {
      localStorage.setItem("learnoir.quiz.autoAdvance", "0");
    });

    const harness = await installDeterministicReviewHarness(page);

    await openExercise(page);
    await writeSentinel(page);
    await waitForSentinelSave(harness);

    await resetReviewScope(page, "topic");

    await assertNoInvalidPracticeFallback(page, "after Reset Topic");

    if (await await (await currentReviewFullIdeEditor(page)).isVisible().catch(() => false)) {
      await expectEditorExcludes(
        page,
        SENTINEL,
        "A still-mounted editor must not retain pre-reset learner code",
      );
    }

    await openExercise(page);

    await expectEditorExcludes(
      page,
      SENTINEL,
      "Reset Topic must prevent pre-reset learner code from returning",
    );
    await expectEditorContains(
      page,
      "name = 'ZoeSkoul learner'",
      "Reset Topic must restore canonical main.py starter",
    );
    await expectEditorContains(
      page,
      "print('Hello, ' + name)",
      "Reset Topic must restore the complete authored starter",
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await assertNoInvalidPracticeFallback(page, "after reset durability reload");

    await expectEditorExcludes(
      page,
      SENTINEL,
      "Pre-reset learner code must not resurrect after reload",
    );
    await expectEditorContains(
      page,
      "print('Hello, ' + name)",
      "Canonical starter must remain authoritative after reload",
    );
  });
});
