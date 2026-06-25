import { expect, test, type Page } from "@playwright/test";

// Zoeskoul E2E suite pruning: this file is opt-in.
test.skip(process.env.RUN_E2E_LEGACY !== "1", "Legacy broad E2E suite is opt-in. Run with RUN_E2E_LEGACY=1 or pnpm test:e2e:legacy.");


test.use({
    viewport: {
        width: 1440,
        height: 1000,
    },
});

const FILE_IO_EXERCISE_URL =
    "/en/catalog/python/subjects/python-data-functions/modules/python-7-files-exceptions-and-data-cleaning/learn/python--python-data-functions--draft-python-7-file-io/reading-text-files/exercise/quiz9?e2eUnlockAll=1";

const SOLUTION_CODE = [
    'with open("data/message.txt", "r") as file:',
    "    text = file.read()",
    "    print(text)",
].join("\n");

const FIXTURE_PATH = "data/message.txt";
const FIXTURE_NODE_TEST_ID = "tools-file-node-message.txt";
const FIXTURE_CONTENT = "Hello, World!\nThis is a test file.";
const FIXTURE_OUTPUT = `${FIXTURE_CONTENT}\n`;
const PRACTICE_FIXTURES = {
    quiz9: {
        title: "Read the file contents",
        starterCode: "# Write your answer below\n",
        solutionCode: `${SOLUTION_CODE}\n`,
        workspace: {
            language: "python",
            entryFilePath: "main.py",
            starterCode: "# Write your answer below\n",
            starterFiles: [
                {
                    path: "main.py",
                    content: "# Write your answer below\n",
                    language: "python",
                    isEntry: true,
                    entry: true,
                },
            ],
            files: [
                {
                    path: FIXTURE_PATH,
                    content: FIXTURE_CONTENT,
                },
            ],
        },
    },
    quiz10: {
        title: "Placeholder project step 2",
        starterCode: "# step 2\n",
        solutionCode: "print('step 2')\n",
        workspace: {
            language: "python",
            entryFilePath: "main.py",
            starterCode: "# step 2\n",
            starterFiles: [
                {
                    path: "main.py",
                    content: "# step 2\n",
                    language: "python",
                    isEntry: true,
                    entry: true,
                },
            ],
        },
    },
    quiz11: {
        title: "Placeholder project step 3",
        starterCode: "# step 3\n",
        solutionCode: "print('step 3')\n",
        workspace: {
            language: "python",
            entryFilePath: "main.py",
            starterCode: "# step 3\n",
            starterFiles: [
                {
                    path: "main.py",
                    content: "# step 3\n",
                    language: "python",
                    isEntry: true,
                    entry: true,
                },
            ],
        },
    },
} as const;

type SubmittedFile = {
    path: string;
    content: string;
};

function collectSubmittedFiles(value: unknown): SubmittedFile[] {
    const seen = new Set<unknown>();

    function visit(node: unknown): SubmittedFile[] {
        if (!node || typeof node !== "object") return [];
        if (seen.has(node)) return [];
        seen.add(node);

        if (Array.isArray(node)) {
            return node.flatMap((item) => visit(item));
        }

        const record = node as Record<string, unknown>;

        if (
            Array.isArray(record.files) &&
            record.files.every(
                (file) =>
                    file &&
                    typeof file === "object" &&
                    typeof (file as Record<string, unknown>).path === "string" &&
                    typeof (file as Record<string, unknown>).content === "string",
            )
        ) {
            return (record.files as Array<Record<string, unknown>>).map((file) => ({
                path: String(file.path),
                content: String(file.content),
            }));
        }

        return Object.values(record).flatMap((item) => visit(item));
    }

    return visit(value);
}

function hasWorkspaceFixture(files: SubmittedFile[]) {
    return files.some(
        (file) => file.path === FIXTURE_PATH && file.content === FIXTURE_CONTENT,
    );
}

function hasWorkspaceEntry(files: SubmittedFile[]) {
    return files.some(
        (file) => file.path === "main.py" && file.content.includes('open("data/message.txt"'),
    );
}

async function ensureFixtureFileVisible(page: Page) {
    const fixtureNode = page.getByTestId(FIXTURE_NODE_TEST_ID);
    if (await fixtureNode.count()) {
        return fixtureNode;
    }

    const dataFolderNode = page.getByTestId("tools-file-node-data");
    if (await dataFolderNode.count()) {
        await dataFolderNode.click();
    }

    await expect(fixtureNode).toBeVisible({ timeout: 30_000 });
    return fixtureNode;
}

async function installReviewChromeMocks(page: Page) {
    await page.route("**/api/review/progress**", async (route) => {
        const request = route.request();

        if (request.method() === "GET") {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    progress: {
                        activeTopicId: "reading-text-files",
                        quizVersion: 1,
                        viewTopicId: "reading-text-files",
                        topics: {
                            "reading-text-files": {
                                readingDone: {
                                    sketch0: true,
                                    sketch1: true,
                                },
                                cardsDone: {},
                                quizzesDone: {
                                    project: true,
                                },
                                completed: false,
                                quizState: {
                                    project: {
                                        answers: {},
                                        checkedById: {},
                                        excusedById: {},
                                        practiceMeta: {
                                            quiz9: { attempts: 1, ok: true },
                                            quiz10: { attempts: 1, ok: true },
                                            quiz11: { attempts: 1, ok: true },
                                        },
                                    },
                                },
                            },
                        },
                    },
                }),
            });
            return;
        }

        if (request.method() === "PUT") {
            const body = request.postDataJSON();
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

    await page.route("**/api/review/module-nav**", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                prevModuleId: null,
                nextModuleId: null,
                nextLocked: false,
                nextBillingHref: null,
                index: 1,
                total: 1,
            }),
        });
    });

    await page.route("**/api/review/subject-finish**", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                status: "in_progress",
                certificateReady: false,
                certificateIssued: false,
            }),
        });
    });

    await page.route("**/api/gamification/me**", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                summary: {
                    totalXp: 0,
                    level: 1,
                    currentStreak: 0,
                    levelProgressPct: 0,
                },
            }),
        });
    });

    await page.route("**/api/tools/doc**", async (route) => {
        const request = route.request();

        if (request.method() === "GET") {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ doc: null }),
            });
            return;
        }

        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true }),
        });
    });

    await page.route(
        (url) => url.pathname === "/api/review/quiz",
        async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    quizKey: "python-file-io-review-quiz",
                    questions: [
                        {
                            kind: "practice",
                            id: "proj:quiz9:e2e",
                            title: PRACTICE_FIXTURES.quiz9.title,
                            fetch: {
                                subject: "python",
                                module: "python-7-files-exceptions-and-data-cleaning",
                                section: "python--python-data-functions--draft-python-7-file-io",
                                topic: "reading-text-files",
                                difficulty: "easy",
                                allowReveal: true,
                                preferPurpose: "project",
                                preferKind: "code_input",
                                exerciseKey: "quiz9",
                                seedPolicy: "global",
                            },
                            maxAttempts: 10,
                        },
                        {
                            kind: "practice",
                            id: "proj:quiz10:e2e",
                            title: PRACTICE_FIXTURES.quiz10.title,
                            fetch: {
                                subject: "python",
                                module: "python-7-files-exceptions-and-data-cleaning",
                                section: "python--python-data-functions--draft-python-7-file-io",
                                topic: "reading-text-files",
                                difficulty: "easy",
                                allowReveal: true,
                                preferPurpose: "project",
                                preferKind: "code_input",
                                exerciseKey: "quiz10",
                                seedPolicy: "global",
                            },
                            maxAttempts: 10,
                        },
                        {
                            kind: "practice",
                            id: "proj:quiz11:e2e",
                            title: PRACTICE_FIXTURES.quiz11.title,
                            fetch: {
                                subject: "python",
                                module: "python-7-files-exceptions-and-data-cleaning",
                                section: "python--python-data-functions--draft-python-7-file-io",
                                topic: "reading-text-files",
                                difficulty: "easy",
                                allowReveal: true,
                                preferPurpose: "project",
                                preferKind: "code_input",
                                exerciseKey: "quiz11",
                                seedPolicy: "global",
                            },
                            maxAttempts: 10,
                        },
                    ],
                }),
            });
        },
    );

    await page.route(
        (url) => url.pathname === "/api/practice",
        async (route) => {
            const exerciseKey =
                new URL(route.request().url()).searchParams.get("exerciseKey") ?? "quiz9";
            const fixture =
                PRACTICE_FIXTURES[exerciseKey as keyof typeof PRACTICE_FIXTURES] ??
                PRACTICE_FIXTURES.quiz9;

            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    key: `practice-${exerciseKey}`,
                    sessionId: `practice-session-${exerciseKey}`,
                    exercise: {
                        id: exerciseKey,
                        exerciseKey,
                        kind: "code_input",
                        title: fixture.title,
                        prompt: fixture.title,
                        language: "python",
                        runtime: {
                            kind: "code",
                            language: "python",
                        },
                        workspace: fixture.workspace,
                        starterCode: fixture.starterCode,
                        solutionCode: fixture.solutionCode,
                    },
                    run: {
                        maxAttempts: 10,
                        allowReveal: true,
                        help: {
                            stepKeys: ["concept", "hint_1", "hint_2", "reveal"],
                        },
                    },
                }),
            });
        },
    );
}

async function installWorkspacePayloadMocks(page: Page) {
    const runPayloads: unknown[] = [];
    const validatePayloads: unknown[] = [];
    const queuedRunResults = new Map<
        string,
        {
            ok: boolean;
            status: string;
            stdout: string;
            stderr: string;
            output: string;
        }
    >();

    await page.route("**/api/run/judge0", async (route) => {
        const request = route.request();

        if (request.method() !== "POST") {
            await route.fallback();
            return;
        }

        const body = request.postDataJSON();
        runPayloads.push(body);

        const files = collectSubmittedFiles(body);
        const hasExpectedWorkspace = hasWorkspaceEntry(files) && hasWorkspaceFixture(files);
        const token = `queued-run-${runPayloads.length}`;

        queuedRunResults.set(token, {
            ok: hasExpectedWorkspace,
            status: hasExpectedWorkspace ? "Accepted" : "Error",
            stdout: hasExpectedWorkspace ? FIXTURE_OUTPUT : "",
            stderr: hasExpectedWorkspace
                ? ""
                : `FileNotFoundError: [Errno 2] No such file or directory: '${FIXTURE_PATH}'\n`,
            output: hasExpectedWorkspace
                ? FIXTURE_OUTPUT
                : `FileNotFoundError: [Errno 2] No such file or directory: '${FIXTURE_PATH}'\n`,
        });

        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                ok: true,
                mode: "queued",
                token,
            }),
        });
    });

    await page.route("**/api/run/judge0/*", async (route) => {
        const request = route.request();

        if (request.method() !== "GET") {
            await route.fallback();
            return;
        }

        const url = new URL(request.url());
        const token = decodeURIComponent(url.pathname.split("/").pop() ?? "");
        const result = queuedRunResults.get(token);

        if (!result) {
            await route.fulfill({
                status: 404,
                contentType: "application/json",
                body: JSON.stringify({
                    ok: false,
                    done: true,
                    status: "Error",
                    error: "Unknown queued run token",
                }),
            });
            return;
        }

        await route.fulfill({
            status: result.ok ? 200 : 502,
            contentType: "application/json",
            body: JSON.stringify({
                done: true,
                ...result,
            }),
        });
    });

    await page.route("**/api/practice/validate", async (route) => {
        const request = route.request();

        if (request.method() !== "POST") {
            await route.fallback();
            return;
        }

        const body = request.postDataJSON();
        validatePayloads.push(body);

        const files = collectSubmittedFiles(body);
        const hasExpectedWorkspace = hasWorkspaceEntry(files) && hasWorkspaceFixture(files);

        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                ok: hasExpectedWorkspace,
                expected: null,
                finalized: hasExpectedWorkspace,
                explanation: hasExpectedWorkspace
                    ? "Correct."
                    : 'FileNotFoundError: [Errno 2] No such file or directory: "data/message.txt"',
                attempts: {
                    used: 1,
                    max: 3,
                    left: hasExpectedWorkspace ? 2 : 0,
                },
            }),
        });
    });

    return {
        runPayloads,
        validatePayloads,
    };
}

async function gotoFileIoExercise(page: Page) {
    const response = await page.goto(FILE_IO_EXERCISE_URL, {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
    });

    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/exercise\/quiz9(?:\?.*)?$/, { timeout: 30_000 });

    await expect(page.getByTestId("tools-file-tree")).toBeVisible({
        timeout: 30_000,
    });

    await expect(page.getByTestId("code-editor-e2e-input").last()).toBeAttached({
        timeout: 30_000,
    });
}

test("python file I/O exercise check uses the visible editor workspace and fixture files without requiring Run first", async ({
                                                                                                                                  page,
                                                                                                                              }) => {
    /**
     * This test needs to verify Check first, then Run on the SAME exercise.
     * If auto-advance is enabled, a correct Check moves from quiz9 to quiz10
     * before Run, and the test starts running the next exercise's workspace.
     */
    await page.addInitScript(() => {
        window.localStorage.setItem("learnoir.quiz.autoAdvance", "0");
    });

    await installReviewChromeMocks(page);
    const { runPayloads, validatePayloads } = await installWorkspacePayloadMocks(page);

    await gotoFileIoExercise(page);

    const editor = page.getByTestId("code-editor-e2e-input").last();
    const mainNode = page.getByTestId("tools-file-node-main.py");
    const dataNode = await ensureFixtureFileVisible(page);
    const runButton = page.getByTestId("code-runner-run-button").first();

    await expect(mainNode).toBeVisible({ timeout: 30_000 });
    await expect(dataNode).toBeVisible({ timeout: 30_000 });
    await expect(mainNode).toHaveAttribute("data-node-active", "true");
    await expect(mainNode).toHaveAttribute("data-node-entry", "true");
    await expect(dataNode).toHaveAttribute("data-node-kind", "file");

    /**
     * Defensive UI-level disable too, in case another test/user state caused
     * the mounted toggle to ignore the init-script value.
     */
    const autoAdvanceToggle = page.getByLabel(/auto-advance/i).first();
    if (await autoAdvanceToggle.count()) {
        try {
            if (await autoAdvanceToggle.isChecked()) {
                await autoAdvanceToggle.uncheck();
            }
        } catch {
            // Some implementations expose the label text but not a native checkbox.
            // The init-script above is the source of truth for this test.
        }
    }

    await editor.fill(SOLUTION_CODE);

    await expect
        .poll(() => editor.inputValue(), { timeout: 10_000 })
        .toContain('open("data/message.txt"');

    await expect(mainNode).toHaveAttribute("data-node-active", "true");
    await expect(dataNode).not.toHaveAttribute("data-node-active", "true");

    const checkButton = page.getByTestId("review-practice-submit-button");
    await expect(checkButton).toBeVisible({ timeout: 20_000 });
    await expect(checkButton).toBeEnabled({ timeout: 20_000 });

    /**
     * Check must use the visible editor workspace directly, without requiring
     * Run first.
     */
    await checkButton.click();

    await expect(page.getByTestId("review-practice-result-correct")).toBeVisible({
        timeout: 20_000,
    });

    await expect(page.locator("body")).not.toContainText("FileNotFoundError", {
        timeout: 10_000,
    });
    await expect(page.locator("body")).not.toContainText("Logic or formula issue", {
        timeout: 10_000,
    });

    await expect
        .poll(() => validatePayloads.length, { timeout: 20_000 })
        .toBeGreaterThan(0);

    const lastValidatePayload = validatePayloads.at(-1);
    const validateFiles = collectSubmittedFiles(lastValidatePayload);

    expect(validateFiles).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                path: "main.py",
                content: expect.stringContaining('open("data/message.txt"'),
            }),
            expect.objectContaining({
                path: FIXTURE_PATH,
                content: FIXTURE_CONTENT,
            }),
        ]),
    );
    expect(JSON.stringify(lastValidatePayload)).not.toContain("stale code");

    /**
     * Critical regression assertion:
     * after a correct Check, this test must still be on quiz9.
     * Otherwise Run would execute quiz10 and the expected file output
     * would be invalid.
     */
    await expect(page).toHaveURL(/\/exercise\/quiz9(?:\?.*)?$/, {
        timeout: 10_000,
    });
    await expect(page.getByTestId(FIXTURE_NODE_TEST_ID)).toBeVisible({
        timeout: 10_000,
    });
    await expect(page.getByTestId("tools-file-node-main.py")).toHaveAttribute(
        "data-node-active",
        "true",
    );

    await expect(runButton).toBeVisible({ timeout: 20_000 });
    await expect(runButton).toBeEnabled({ timeout: 20_000 });
    await runButton.click();

    await expect(page.locator("body")).toContainText("Hello, World!", {
        timeout: 20_000,
    });
    await expect(page.locator("body")).toContainText("This is a test file.", {
        timeout: 20_000,
    });
    await expect(page.locator("body")).not.toContainText("FileNotFoundError", {
        timeout: 10_000,
    });

    await expect
        .poll(() => runPayloads.length, { timeout: 20_000 })
        .toBeGreaterThan(0);

    const lastRunPayload = runPayloads.at(-1);
    const runFiles = collectSubmittedFiles(lastRunPayload);

    expect(runFiles).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                path: "main.py",
                content: expect.stringContaining('open("data/message.txt"'),
            }),
            expect.objectContaining({
                path: FIXTURE_PATH,
                content: FIXTURE_CONTENT,
            }),
        ]),
    );
});
