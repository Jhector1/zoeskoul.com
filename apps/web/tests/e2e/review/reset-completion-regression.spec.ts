import { expect, test, type Locator, type Page } from "@playwright/test";

// Zoeskoul E2E suite pruning: this file is opt-in.
test.skip(process.env.RUN_E2E_LEGACY !== "1", "Legacy broad E2E suite is opt-in. Run with RUN_E2E_LEGACY=1 or pnpm test:e2e:legacy.");


test.use({
    viewport: {
        width: 1440,
        height: 1000,
    },
});

const LOCALE = "en";
const SUBJECT_SLUG = "python-v2";
const MODULE_SLUG = "e2e-review-clone";
const SECTION_SLUG = "e2e-section";
const TOPIC_ID = "e2e-review-topic";

const FIRST_TOPIC_ROUTE =
    `/${LOCALE}/dev/e2e/review-module-clone/${SUBJECT_SLUG}/${MODULE_SLUG}` +
    `/learn/${SECTION_SLUG}/${TOPIC_ID}/text/e2e-reading`;

const QUIZ_ROUTE =
    `/${LOCALE}/dev/e2e/review-module-clone/${SUBJECT_SLUG}/${MODULE_SLUG}` +
    `/learn/${SECTION_SLUG}/${TOPIC_ID}/quiz/review-clone-practice-quiz`;

const TOPIC_DONE_TEST_ID = `review-sidebar-topic-done-${TOPIC_ID}`;

const CARD_IDS = [
    "e2e-reading",
    "review-clone-practice-quiz",
    "review-clone-project",
    "review-clone-project-b",
    "review-clone-reveal-fill-multifile",
    "review-clone-project-blank",
] as const;

type ProgressState = Record<string, any>;

function emptyProgress(): ProgressState {
    return {
        topics: {},
        quizVersion: 0,
        moduleCompleted: false,
        moduleCompletedAt: undefined,
    };
}

function completedTopicState(completedAt = "2026-05-16T12:00:00.000Z") {
    return {
        quizVersion: 1,
        completed: true,
        completedAt,
        readingDone: {
            "e2e-reading": true,
        },
        cardsDone: Object.fromEntries(CARD_IDS.map((id) => [id, true])),
        quizzesDone: {
            "review-clone-practice-quiz": true,
            "review-clone-project": true,
            "review-clone-project-b": true,
            "review-clone-reveal-fill-multifile": true,
            "review-clone-project-blank": true,
        },
        quizState: {
            "review-clone-practice-quiz": {
                answers: {},
                checkedById: {},
                checked: true,
                correct: true,
                score: 1,
            },
            "review-clone-project": {
                answers: {},
                checkedById: {},
                checked: true,
                correct: true,
                score: 1,
            },
            "review-clone-project-b": {
                answers: {},
                checkedById: {},
                checked: true,
                correct: true,
                score: 1,
            },
            "review-clone-reveal-fill-multifile": {
                answers: {},
                checkedById: {},
                checked: true,
                correct: true,
                score: 1,
            },
            "review-clone-project-blank": {
                answers: {},
                checkedById: {},
                checked: true,
                correct: true,
                score: 1,
            },
        },
        runtimeStateV2: {
            cards: {},
            exercises: {},
        },
    };
}

function completedModuleProgress(): ProgressState {
    return {
        topics: {
            [TOPIC_ID]: completedTopicState(),
        },
        activeTopicId: TOPIC_ID,
        quizVersion: 1,
        moduleCompleted: true,
        moduleCompletedAt: "2026-05-16T12:10:00.000Z",
        __saveRevision: Date.now(),
    };
}

function cloneProgress<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

function isEmptyRecord(value: unknown) {
    return (
        !value ||
        (typeof value === "object" &&
            !Array.isArray(value) &&
            Object.keys(value as Record<string, unknown>).length === 0)
    );
}

function hasNoQuizCompletionState(quizState: unknown) {
    if (isEmptyRecord(quizState)) return true;

    const records = Object.values(
        (quizState ?? {}) as Record<string, Record<string, any>>,
    );

    for (const state of records) {
        if (!state || typeof state !== "object") continue;

        if (state.checked === true) return false;
        if (state.correct === true) return false;
        if (state.completed === true) return false;
        if (state.submitted === true) return false;

        if (typeof state.score === "number" && state.score > 0) return false;

        if (!isEmptyRecord(state.answers)) return false;
        if (!isEmptyRecord(state.checkedById)) return false;

        /**
         * Allowed after reset:
         * Runtime/editor bridge may repopulate practiceItemPatch for workspace
         * restore. That is not quiz completion and must not create green checks.
         */
    }

    return true;
}

function hasNoCompletion(progress: ProgressState) {
    if (progress.moduleCompleted === true) return false;
    if (progress.moduleCompletedAt) return false;

    const topics = progress.topics ?? {};

    for (const topic of Object.values(topics) as Array<Record<string, any>>) {
        if (topic.completed === true) return false;
        if (topic.completedAt) return false;

        if (!isEmptyRecord(topic.readingDone)) return false;
        if (!isEmptyRecord(topic.cardsDone)) return false;
        if (!isEmptyRecord(topic.quizzesDone)) return false;

        if (!hasNoQuizCompletionState(topic.quizState)) return false;
    }

    return true;
}

async function setupMockReviewProgressApi(page: Page) {
    let progress: ProgressState = emptyProgress();
    let protectSeededCompletion = false;

    function looksLikeRuntimeOnlyHydrationSave(next: ProgressState) {
        const topic = next?.topics?.[TOPIC_ID];

        return (
            protectSeededCompletion &&
            progress.moduleCompleted === true &&
            next.moduleCompleted !== true &&
            !!topic &&
            isEmptyRecord(topic.cardsDone) &&
            isEmptyRecord(topic.readingDone) &&
            isEmptyRecord(topic.quizzesDone) &&
            isEmptyRecord(topic.quizState) &&
            (!!topic.runtimeStateV2 || !!topic.toolState || !!topic.sketchState)
        );
    }

    await page.route("**/api/review/progress**", async (route) => {
        const request = route.request();
        const method = request.method().toUpperCase();

        if (method === "GET") {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    ok: true,
                    state: cloneProgress(progress),
                    progress: cloneProgress(progress),
                }),
            });
            return;
        }

        if (method === "PUT" || method === "POST") {
            const body = request.postDataJSON() as any;

            const next = cloneProgress(
                body?.state ??
                body?.progress ??
                body?.nextProgress ??
                emptyProgress(),
            );

            if (looksLikeRuntimeOnlyHydrationSave(next)) {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({
                        ok: true,
                        state: cloneProgress(progress),
                        progress: cloneProgress(progress),
                        ignoredHydrationWrite: true,
                        gamification: null,
                    }),
                });
                return;
            }

            progress = cloneProgress(next);

            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    ok: true,
                    state: cloneProgress(progress),
                    progress: cloneProgress(progress),
                    gamification: null,
                }),
            });
            return;
        }

        if (method === "DELETE") {
            progress = emptyProgress();
            protectSeededCompletion = false;

            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    ok: true,
                    state: cloneProgress(progress),
                    progress: cloneProgress(progress),
                }),
            });
            return;
        }

        await route.fulfill({
            status: 405,
            contentType: "application/json",
            body: JSON.stringify({
                ok: false,
                message: `Unsupported mocked method: ${method}`,
            }),
        });
    });

    return {
        clear() {
            progress = emptyProgress();
            protectSeededCompletion = false;
        },

        seed(next: ProgressState) {
            progress = cloneProgress(next);
            protectSeededCompletion = true;
        },

        allowWrites() {
            protectSeededCompletion = false;
        },

        get() {
            return cloneProgress(progress);
        },
    };
}

async function expectOptionalModuleProgress(page: Page, text: string) {
    const progressLabel = page.getByTestId("review-module-progress-label");

    await expect
        .poll(
            async () => {
                if ((await progressLabel.count()) === 0) return false;

                const value = await progressLabel.innerText();

                return value.replace(/\s+/g, "").includes(text);
            },
            {
                timeout: 15_000,
                message: `Expected module progress to contain ${text}`,
            },
        )
        .toBe(true);
}

async function expectNoGreenCheckIfSidebarRendered(page: Page) {
    const check = page.getByTestId(TOPIC_DONE_TEST_ID);

    await expect
        .poll(
            async () => {
                const count = await check.count();

                if (count === 0) return true;

                for (let i = 0; i < count; i += 1) {
                    if (await check.nth(i).isVisible().catch(() => false)) {
                        return false;
                    }
                }

                return true;
            },
            {
                timeout: 15_000,
                message: "Expected no visible stale topic green check",
            },
        )
        .toBe(true);
}

async function expectTopicDoneCheck(page: Page) {
    await expect(page.getByTestId(TOPIC_DONE_TEST_ID)).toBeVisible({
        timeout: 15_000,
    });
}

async function clickVisibleFirst(locator: Locator) {
    const count = await locator.count();

    for (let i = 0; i < count; i += 1) {
        const item = locator.nth(i);

        if (await item.isVisible().catch(() => false)) {
            await item.click();
            return;
        }
    }

    throw new Error("No visible matching locator found.");
}

async function clickResetModule(page: Page) {
    const resetModuleButton = page.getByTestId("review-reset-module-button");

    await expect(resetModuleButton.first()).toBeAttached({
        timeout: 15_000,
    });

    await clickVisibleFirst(resetModuleButton);
}

async function clickResetTopic(page: Page) {
    const resetTopicButton = page.getByTestId("review-reset-topic-button");

    await expect(resetTopicButton.first()).toBeAttached({
        timeout: 15_000,
    });

    await clickVisibleFirst(resetTopicButton);
}

async function confirmReset(page: Page, title: string) {
    const dialog = page.getByRole("dialog");

    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(title)).toBeVisible();

    await dialog.getByRole("button", { name: "Reset" }).click();

    await expect(dialog).toHaveCount(0);
}

async function expectStoredProgress(
    progressApi: Awaited<ReturnType<typeof setupMockReviewProgressApi>>,
    predicate: (progress: ProgressState) => boolean,
    message: string,
) {
    await expect
        .poll(() => predicate(progressApi.get()), {
            timeout: 15_000,
            message,
        })
        .toBe(true);
}

test.describe("review reset completion regression using dev clone", () => {
    let progressApi: Awaited<ReturnType<typeof setupMockReviewProgressApi>>;

    test.beforeEach(async ({ page }) => {
        progressApi = await setupMockReviewProgressApi(page);
        progressApi.clear();

        await page.goto(FIRST_TOPIC_ROUTE);

        await expectOptionalModuleProgress(page, "0/1");
        await expectNoGreenCheckIfSidebarRendered(page);
    });

    test("reset module clears stale sidebar green check and it does not return after navigation/reload", async ({
                                                                                                                    page,
                                                                                                                }) => {
        progressApi.seed(completedModuleProgress());

        await page.goto(FIRST_TOPIC_ROUTE);

        await expectOptionalModuleProgress(page, "1/1");
        await expectTopicDoneCheck(page);

        await clickResetModule(page);
        progressApi.allowWrites();
        await confirmReset(page, "Reset the entire module?");

        await expectNoGreenCheckIfSidebarRendered(page);

        await expectStoredProgress(
            progressApi,
            hasNoCompletion,
            "Reset module progress should not contain completion after reset",
        );

        await page.goto(QUIZ_ROUTE);
        await expectNoGreenCheckIfSidebarRendered(page);

        await page.goBack();
        await expectNoGreenCheckIfSidebarRendered(page);

        await page.reload();
        await expectNoGreenCheckIfSidebarRendered(page);

        await expectStoredProgress(
            progressApi,
            hasNoCompletion,
            "Reset module progress should not contain completion after reset/navigation/reload",
        );
    });

    test("reset topic clears the topic check and it does not return after navigation/reload", async ({
                                                                                                         page,
                                                                                                     }) => {
        progressApi.seed(completedModuleProgress());

        await page.goto(FIRST_TOPIC_ROUTE);

        await expectOptionalModuleProgress(page, "1/1");
        await expectTopicDoneCheck(page);

        await clickResetTopic(page);
        progressApi.allowWrites();
        await confirmReset(page, "Reset this topic?");

        await expectNoGreenCheckIfSidebarRendered(page);

        await expectStoredProgress(
            progressApi,
            hasNoCompletion,
            "Reset topic progress should not contain completion after reset",
        );

        await page.goto(QUIZ_ROUTE);
        await expectNoGreenCheckIfSidebarRendered(page);

        await page.goBack();
        await expectNoGreenCheckIfSidebarRendered(page);

        await page.reload();
        await expectNoGreenCheckIfSidebarRendered(page);

        await expectStoredProgress(
            progressApi,
            hasNoCompletion,
            "Reset topic progress should not contain completion after reset/navigation/reload",
        );
    });

    test("canceling reset module keeps completed progress state", async ({
                                                                             page,
                                                                         }) => {
        progressApi.seed(completedModuleProgress());

        await page.goto(FIRST_TOPIC_ROUTE);

        await expectOptionalModuleProgress(page, "1/1");
        await expectTopicDoneCheck(page);

        await clickResetModule(page);

        const dialog = page.getByRole("dialog");

        await expect(dialog).toBeVisible();
        await expect(dialog.getByText("Reset the entire module?")).toBeVisible();

        await dialog.getByRole("button", { name: "Cancel" }).click();

        await expect(dialog).toHaveCount(0);

        const savedBeforeReload = progressApi.get();

        expect(savedBeforeReload.moduleCompleted).toBe(true);
        expect(savedBeforeReload.topics?.[TOPIC_ID]?.completed).toBe(true);
        expect(savedBeforeReload.topics?.[TOPIC_ID]?.cardsDone).toMatchObject(
            Object.fromEntries(CARD_IDS.map((id) => [id, true])),
        );
        expect(savedBeforeReload.topics?.[TOPIC_ID]?.quizzesDone).toMatchObject({
            "review-clone-practice-quiz": true,
            "review-clone-project": true,
            "review-clone-project-b": true,
            "review-clone-reveal-fill-multifile": true,
            "review-clone-project-blank": true,
        });

        await page.reload();

        const savedAfterReload = progressApi.get();

        expect(savedAfterReload.moduleCompleted).toBe(true);
        expect(savedAfterReload.topics?.[TOPIC_ID]?.completed).toBe(true);
        expect(savedAfterReload.topics?.[TOPIC_ID]?.cardsDone).toMatchObject(
            Object.fromEntries(CARD_IDS.map((id) => [id, true])),
        );
        expect(savedAfterReload.topics?.[TOPIC_ID]?.quizzesDone).toMatchObject({
            "review-clone-practice-quiz": true,
            "review-clone-project": true,
            "review-clone-project-b": true,
            "review-clone-reveal-fill-multifile": true,
            "review-clone-project-blank": true,
        });
    });
});
