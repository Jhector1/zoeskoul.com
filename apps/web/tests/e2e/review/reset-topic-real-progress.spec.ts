import { expect, test, type APIResponse, type Locator, type Page } from "@playwright/test";

import { currentReviewFullIdeEditor, fillCurrentReviewFullIdeEditor, readCurrentReviewFullIdeEditor, resetReviewScope } from "./support/reviewUi";
const EXERCISE_URL =
  "/en/dev/e2e/review-module-clone/python/e2e-review-clone/learn/e2e-section/e2e-review-topic/exercise/e2e-print-name";

const TOPIC_ID = "e2e-review-topic";
const STARTER_NAME = "name = 'ZoeSkoul learner'";
const STARTER_PRINT = "print('Hello, ' + name)";
const SENTINEL = "__ZOESKOUL_REAL_PROGRESS_RESET_SENTINEL_91c4e7__";
const CODE_INPUT_PATH = "/en/dev/e2e/review-module-clone/python/e2e-review-clone/learn/e2e-section/e2e-review-topic/exercise/e2e-print-name";

async function expectEditorContains(
  page: Page,
  expected: string,
  message: string,
  timeout = 20_000,
) {
  await expect.poll(() => readCurrentReviewFullIdeEditor(page), { timeout, message }).toContain(expected);
}

async function expectEditorExcludes(
  page: Page,
  unexpected: string,
  message: string,
  timeout = 20_000,
) {
  await expect.poll(() => readCurrentReviewFullIdeEditor(page), { timeout, message }).not.toContain(unexpected);
}

async function installDeterministicPracticeOnly(page: Page) {
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
        key: "e2e-real-progress-reset-key",
        sessionId: "e2e-real-progress-reset-session",
        exercise: {
          id: "e2e-print-name",
          exerciseKey: "e2e-print-name",
          kind: "code_input",
          title: "Edit and run starter code",
          prompt: "Edit and run starter code",
          language: "python",
            tools: {
              defaultVisible: true,
              allowOpen: true,
              defaultSurface: "editor",
            },
          runtime: {
            kind: "code",
            language: "python",
          },
          workspace: {
            language: "python",
            entryFile: "main.py",
            starterFiles: {
              "main.py":
                "name = 'ZoeSkoul learner'\nprint('Hello, ' + name)\n",
              "helper.py":
                "def shout(value):\n    return value.upper()\n",
            },
            solutionFiles: {
              "main.py":
                "from helper import shout\nname = 'ZoeSkoul learner'\nprint(shout('Hello, ' + name))\n",
              "helper.py":
                "def shout(value):\n    return value.upper()\n",
            },
          },
          starterCode:
            "name = 'ZoeSkoul learner'\nprint('Hello, ' + name)\n",
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
}

async function assertNoInvalidFallback(page: Page, where: string) {
  await expect(
    page.getByText("Invalid topic/filters", { exact: true }),
    `${where}: deterministic dev exercise must not fall through to real practice filtering`,
  ).toHaveCount(0);
}

async function openExercise(page: Page) {
  const response = await page.goto(EXERCISE_URL, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });

  expect(response?.status() ?? 0).toBeLessThan(400);
  await assertNoInvalidFallback(page, "exercise load");
  await expect(await currentReviewFullIdeEditor(page)).toBeAttached({ timeout: 30_000 });
}

async function jsonOf(response: APIResponse): Promise<any> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Expected JSON from ${response.url()} but received: ${text.slice(0, 500)}`,
    );
  }
}

function topicVersion(payload: any): number {
  const progress = payload?.progress ?? payload?.state ?? payload ?? {};
  const raw = progress?.topics?.[TOPIC_ID]?.quizVersion;
  return Number.isFinite(Number(raw)) ? Number(raw) : 0;
}

test.describe("Review Reset Topic with real progress persistence", () => {
  test("real code_input server progress cannot resurrect pre-reset learner code", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await page.addInitScript(() => {
      localStorage.setItem("learnoir.quiz.autoAdvance", "0");
      localStorage.setItem("zoe:debug:review-save", "1");
    });

    await installDeterministicPracticeOnly(page);

    let latestProgressGetUrl: string | null = null;
    const progressPutBodies: string[] = [];
    const progressStatuses: Array<{
      method: string;
      status: number;
      url: string;
    }> = [];

    page.on("request", (request) => {
      const url = request.url();
      if (!/\/api\/review\/progress(?:\?|$)/.test(url)) return;

      if (request.method() === "GET") {
        latestProgressGetUrl = url;
      }

      if (request.method() === "PUT") {
        progressPutBodies.push(request.postData() ?? "");
      }
    });

    page.on("response", (response) => {
      if (!/\/api\/review\/progress(?:\?|$)/.test(response.url())) return;
      progressStatuses.push({
        method: response.request().method(),
        status: response.status(),
        url: response.url(),
      });
    });

    await openExercise(page);

    await expect
      .poll(() => latestProgressGetUrl, {
        timeout: 20_000,
        message: "Expected Review to perform a real progress GET",
      })
      .not.toBeNull();

    await fillCurrentReviewFullIdeEditor(page, SENTINEL);

    await expect
      .poll(
        () => progressPutBodies.some((body) => body.includes(SENTINEL)),
        {
          timeout: 25_000,
          message:
            "Expected learner sentinel to be persisted through the REAL /api/review/progress PUT",
        },
      )
      .toBe(true);

    const getUrlBeforeReset = latestProgressGetUrl!;
    const preResetResponse = await page.request.get(getUrlBeforeReset);
    expect(
      preResetResponse.ok(),
      `Real progress GET before reset failed: ${preResetResponse.status()}`,
    ).toBe(true);

    const preResetJson = await jsonOf(preResetResponse);
    expect(
      JSON.stringify(preResetJson),
      "Real server progress should contain the learner sentinel before reset",
    ).toContain(SENTINEL);

    // V86A_CODE_INPUT_PRE_RESET_CONTRACT
    expect(
      new URL(page.url()).pathname,
      "Real Reset Topic persistence regression must start on e2e-print-name code_input",
    ).toBe(CODE_INPUT_PATH);
    const v86aPreResetEditor = await currentReviewFullIdeEditor(page);
    await expect(v86aPreResetEditor).toBeAttached({ timeout: 30_000 });
    await expect(v86aPreResetEditor).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(async () => await v86aPreResetEditor.inputValue(), {
        timeout: 15_000,
        message: "The actual code_input editor must contain the learner sentinel before Reset Topic",
      })
      .toContain(SENTINEL);

    const preResetVersion = topicVersion(preResetJson);

    await resetReviewScope(page, "topic");

    await assertNoInvalidFallback(page, "after Reset Topic");

    let postResetJson: any = null;
    await expect
      .poll(
        async () => {
          const response = await page.request.get(latestProgressGetUrl ?? getUrlBeforeReset);
          if (!response.ok()) {
            return `HTTP_${response.status()}`;
          }
          postResetJson = await jsonOf(response);
          return JSON.stringify(postResetJson).includes(SENTINEL)
            ? "STALE_SENTINEL_PRESENT"
            : "STALE_SENTINEL_ABSENT";
        },
        {
          timeout: 30_000,
          message:
            "Reset Topic must remove the sentinel from the REAL server progress document",
        },
      )
      .toBe("STALE_SENTINEL_ABSENT");

    const postResetVersion = topicVersion(postResetJson);
    expect(
      postResetVersion,
      "Reset Topic must advance the durable topic reset version",
    ).toBeGreaterThan(preResetVersion);

    if (await await (await currentReviewFullIdeEditor(page)).isVisible().catch(() => false)) {
      await expectEditorExcludes(
        page,
        SENTINEL,
        "Mounted editor must not retain pre-reset learner code",
      );
    }

    await openExercise(page);

    await expectEditorExcludes(
      page,
      SENTINEL,
      "Real progress hydration must not resurrect the pre-reset workspace",
    );
    await expectEditorContains(
      page,
      STARTER_NAME,
      "Canonical starter must win after real reset persistence",
    );
    await expectEditorContains(
      page,
      STARTER_PRINT,
      "Complete authored starter must be restored after real reset persistence",
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await assertNoInvalidFallback(page, "after durability reload");

    await expectEditorExcludes(
      page,
      SENTINEL,
      "Pre-reset learner code must stay gone after reload",
    );
    await expectEditorContains(
      page,
      STARTER_PRINT,
      "Canonical starter must remain authoritative after reload",
    );

    const badStatus = progressStatuses.find(
      (entry) => entry.status < 200 || entry.status >= 300,
    );
    expect(
      badStatus,
      `All observed real progress requests should succeed: ${JSON.stringify(progressStatuses)}`,
    ).toBeUndefined();

    // V86A_CODE_INPUT_POST_RESET_REOPEN_CONTRACT
    // Reset Topic may legitimately return navigation to lesson 1.
    // Reopen the exact exercise so the test verifies the same code_input
    // workspace rather than treating the post-reset reading page as its target.
    await page.goto(CODE_INPUT_PATH, { waitUntil: "domcontentloaded" });
    expect(
      new URL(page.url()).pathname,
      "Post-reset verification must reopen e2e-print-name code_input",
    ).toBe(CODE_INPUT_PATH);
    const v86aPostResetEditor = await currentReviewFullIdeEditor(page);
    await expect(v86aPostResetEditor).toBeAttached({ timeout: 30_000 });
    await expect(v86aPostResetEditor).toBeVisible({ timeout: 30_000 });
    const reopenedCodeInput = await v86aPostResetEditor.inputValue();
    expect(
      reopenedCodeInput,
      "Reopened real code_input must not resurrect the pre-reset learner sentinel",
    ).not.toContain(SENTINEL);
    expect(
      reopenedCodeInput,
      "Reset code_input should restore its canonical starter name",
    ).toContain(STARTER_NAME);

    expect(
      reopenedCodeInput,
      "Reset code_input should restore its canonical starter print",
    ).toContain(STARTER_PRINT);
});
});
