import { expect, test } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { prisma } from "@zoeskoul/db";
import { currentReviewFullIdeEditor } from "./support/reviewUi";

const route = "/en/catalog/python/subjects/python-data-functions/modules/python-5-lists-tuples-and-dictionaries/learn/python-data-functions-python-5-list-basics/creating-and-indexing-lists/sketch/list-creation-basics";
const starter = "club1 = input()\nclub2 = input()\nclub3 = input()\n\n# Create a list named clubs containing the three inputs.\n# Print the whole list.\n";

for (const scope of ["topic", "exercise", "module"] as const) {
test(`real course ${scope} reset replaces the visible persistent Monaco workspace`, async ({ page, context }, testInfo) => {
  await page.addLocatorHandler(page.getByRole("button", { name: "Close announcement", exact: true }), async button => { await button.click(); });
  const debug: string[] = [];
  page.on("console", message => { if (message.text().includes("reset") || message.text().includes("replacement")) debug.push(message.text()); });
  let runtimeModuleUrl = "";
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "playwright.student.runtime@zoeskoul.local" } });
  const cookieName = "authjs.session-token";
  const token = await encode({ secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET!, salt: cookieName, maxAge: 3600, token: { uid: user.id, sub: user.id, email: user.email, name: user.name, provider: "playwright" } });
  await context.addCookies([{ name: cookieName, value: token, domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  await page.addInitScript(() => {
    localStorage.setItem("zoe:debug:review-save", "1");
    localStorage.setItem("learnoir.quiz.autoAdvance", "0");
  });
  let progressUrl = "";
  page.on("request", request => {
    if (request.method() === "GET" && request.url().includes("/api/review/progress?")) progressUrl = request.url();
    if (request.url().includes("/reviewRuntimeStore.ts")) runtimeModuleUrl = request.url();
  });
  // This spec mutates REAL server-backed Review progress. Topic/Module reset
  // intentionally return the learner to Lesson 1, so every test primes its own
  // deterministic Lesson-2 prerequisite state before opening the route.
  //
  // Use the production authoritative reset transport instead of DELETE. The
  // progress API owns destructive replacement through resetIntent.
  const seededProgress = await page.request.put(
    "http://localhost:3000/api/review/progress",
    {
      data: {
        subjectSlug: "python-data-functions",
        moduleSlug: "python-5-lists-tuples-and-dictionaries",
        locale: "en",
        resetIntent: {
          kind: "topic",
          topicId: "creating-and-indexing-lists",
        },
        state: {
          activeTopicId: "creating-and-indexing-lists",
          moduleCompleted: false,
          topics: {
            "creating-and-indexing-lists": {
              completed: false,
              readingDone: {
                "creating-and-indexing-lists_s0": true,
              },
              cardsDone: {
                "creating-and-indexing-lists_s0": true,
              },
              quizzesDone: {},
            },
          },
          __saveRevision: Date.now(),
        },
      },
    },
  );
  expect(
    seededProgress.ok(),
    `Expected authoritative Review progress PUT to prime Lesson 2 before ${scope} reset test`,
  ).toBeTruthy();

  const seededResponseText = await seededProgress.text();

  const primeReadUrl =
    "http://localhost:3000/api/review/progress?" +
    new URLSearchParams({
      subjectSlug: "python-data-functions",
      moduleSlug: "python-5-lists-tuples-and-dictionaries",
      locale: "en",
    }).toString();

  const primeRead = await page.request.get(primeReadUrl);
  expect(
    primeRead.ok(),
    `Expected Review progress GET to verify Lesson 2 prime before ${scope} reset test`,
  ).toBeTruthy();

  const primeReadText = await primeRead.text();

  await page.goto(route, { waitUntil: "domcontentloaded", timeout: 90_000 });
  console.log("[mounted-reset] loaded", page.url());

  const postLoadPrimeRead = await page.request.get(primeReadUrl);
  expect(
    postLoadPrimeRead.ok(),
    `Expected Review progress GET after route load before ${scope} reset test`,
  ).toBeTruthy();

  const postLoadPrimeText = await postLoadPrimeRead.text();
  await expect(page.getByRole("progressbar", { name: "Lesson 2 of 5" })).toBeVisible();
  const exerciseUrl = page.url();
  const editor = await currentReviewFullIdeEditor(page);
  await expect(editor).toBeVisible();
  console.log("[mounted-reset] initial", await editor.inputValue());
  const monaco = page.locator(".monaco-editor").first();
  await monaco.getByRole("textbox", { name: "Editor content" }).focus({ timeout: 15_000 });
  console.log("[mounted-reset] Monaco focused");
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Meta+ArrowDown");
  await page.keyboard.insertText("\nffggggfff\n");
  await expect(monaco.locator(".view-lines")).toContainText("ffggggfff");
  await expect.poll(async () => progressUrl ? JSON.stringify(await (await page.request.get(progressUrl)).json()) : "").toContain("ffggggfff");
  console.log("[mounted-reset] pre-reset persisted");
  async function confirmReset() {
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await page.getByRole("menuitem", { name: new RegExp(`This ${scope}`) }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Reset", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  }
  await confirmReset();
  if (runtimeModuleUrl) {
    const state = await page.evaluate(async url => {
      const { useReviewRuntimeStore } = await import(/* @vite-ignore */ url);
      const s = useReviewRuntimeStore.getState();
      return { resetRevision: s.resetRevision, activeExerciseKey: s.activeExerciseKey, tool: s.tool, editors: s.editorRuntimes, pane: (window as any).__ZOE_REVIEW_WORKSPACE_DEBUG__ };
    }, runtimeModuleUrl);
    await testInfo.attach("after-reset-runtime", { body: JSON.stringify(state, null, 2), contentType: "application/json" });
    console.log("[mounted-reset] after reset", JSON.stringify(state));
  }
  await testInfo.attach("reset-debug", { body: debug.join("\n"), contentType: "text/plain" });
  await expect(page.getByRole("progressbar", { name: scope === "exercise" ? "Lesson 2 of 5" : "Lesson 1 of 5" })).toBeVisible();
  const collapsedTools = page.getByRole("button", { name: /Tools.*▶/ });
  if (await collapsedTools.isVisible()) await collapsedTools.click();
  await expect(monaco).toBeInViewport();
  await expect(monaco.locator(".view-lines")).not.toContainText("ffggggfff");
  await expect(editor).toBeVisible();
  await expect(editor).toHaveValue(starter);
  await expect(page.locator(".monaco-editor .view-lines")).not.toContainText("ffggggfff");
  await expect.poll(async () => JSON.stringify(await (await page.request.get(progressUrl)).json())).not.toContain("ffggggfff");
  // Exercise the same mounted editor before navigating/reloading: the reset
  // acknowledgement must release the barrier so legitimate edits can persist.
  await monaco.getByRole("textbox", { name: "Editor content" }).focus();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Meta+ArrowDown");
  await page.keyboard.insertText("\n# legitimate_after_reset\n");
  await expect(monaco.locator(".view-lines")).toContainText("legitimate_after_reset");
  await expect.poll(() => editor.inputValue()).toContain("legitimate_after_reset");
  await expect.poll(async () => JSON.stringify(await (await page.request.get(progressUrl)).json())).toContain("legitimate_after_reset");
  await confirmReset();
  if (await collapsedTools.isVisible()) await collapsedTools.click();
  await expect(editor).toHaveValue(starter);
  await expect(monaco.locator(".view-lines")).not.toContainText("legitimate_after_reset");
  await expect.poll(async () => (await monaco.locator(".view-lines").innerText()).replace(/\s+/g, "")).toBe(starter.replace(/\s+/g, ""));
  await expect.poll(async () => JSON.stringify(await (await page.request.get(progressUrl)).json())).not.toContain("legitimate_after_reset");
  await page.goto(exerciseUrl, { waitUntil: "domcontentloaded" });
  await expect(await currentReviewFullIdeEditor(page)).toHaveValue(starter);

  await page.reload({ waitUntil: "domcontentloaded" });

  if (scope === "exercise") {
    // Exercise Reset keeps the learner on the exercise, so a full reload must
    // restore the authored starter from server-backed progress.
    await expect(await currentReviewFullIdeEditor(page)).toHaveValue(starter);
  } else {
    // Topic/Module Reset already proved the soft-navigation contract above:
    // the learner is returned to Lesson 1 while the mounted editor is retained
    // in-memory with canonical starter state.
    //
    // A hard reload of an explicitly-entered deep exercise URL is not itself a
    // routing contract. What must survive the reload is the authoritative reset:
    // stale learner code stays absent from server progress, and re-entering the
    // exercise produces the authored starter without browser-local restoration.
    await expect.poll(
      async () => JSON.stringify(await (await page.request.get(progressUrl)).json()),
    ).not.toContain("ffggggfff");

    await expect.poll(
      async () => JSON.stringify(await (await page.request.get(progressUrl)).json()),
    ).not.toContain("legitimate_after_reset");

    await page.goto(exerciseUrl, { waitUntil: "domcontentloaded" });
    await expect(await currentReviewFullIdeEditor(page)).toHaveValue(starter);
  }

  await expect(page.locator(".monaco-editor .view-lines")).not.toContainText("ffggggfff");
  await expect.poll(async () => JSON.stringify(await (await page.request.get(progressUrl)).json())).not.toContain("ffggggfff");
});
}
