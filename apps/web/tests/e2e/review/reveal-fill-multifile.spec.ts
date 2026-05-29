import { expect, test, type Locator, type Page } from "@playwright/test";

test.use({
    viewport: {
        width: 1440,
        height: 1000,
    },
});

const DEV_CLONE_REVEAL_MULTIFILE_URL =
    `/en/dev/e2e/review-module-clone/python/e2e-review-clone` +
    `/learn/e2e-section/e2e-review-topic/project/review-clone-reveal-fill-multifile` +
    `?runnerBackend=judge0`;

const starterFiles = {
    "main.py":
        "from tools.names import clean_name\n" +
        "# TODO: import make_badge from tools.badges\n\n" +
        "raw_name = input()\n" +
        "role = input()\n" +
        "name = clean_name(raw_name)\n" +
        "# TODO: print the badge\n",
    "tools/__init__.py": "",
    "tools/names.py":
        "def clean_name(value):\n" +
        "    return value.strip().title()\n",
};

const solutionFiles = {
    "main.py":
        "from tools.names import clean_name\n" +
        "from tools.badges import make_badge\n\n" +
        "raw_name = input()\n" +
        "role = input()\n" +
        "name = clean_name(raw_name)\n" +
        "print(make_badge(name, role))\n",
    "tools/__init__.py": "",
    "tools/names.py":
        "def clean_name(value):\n" +
        "    return value.strip().title()\n",
    "tools/badges.py":
        "def make_badge(name, role):\n" +
        "    return f\"{role.upper()} badge: {name}\"\n",
};

function toStarterFileArray(files: Record<string, string>) {
    return Object.entries(files).map(([path, content]) => ({
        path,
        content,
        language: path.endsWith(".py") ? "python" : "text",
        isEntry: path === "main.py",
        entry: path === "main.py",
    }));
}

async function installPracticeMocks(page: Page) {
    await page.route(
        (url) => url.pathname === "/api/review/quiz",
        async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    quizKey: "e2e-reveal-fill-multifile-quiz-key",
                    questions: [
                        {
                            kind: "practice",
                            id: "proj:e2e-reveal-fill-multifile:test",
                            title: "Fill answer should create tools/badges.py",
                            fetch: {
                                subject: "python",
                                module: "e2e-review-clone",
                                section: "e2e-section",
                                topic: "e2e-review-topic",
                                difficulty: "easy",
                                allowReveal: true,
                                preferPurpose: "project",
                                preferKind: "code_input",
                                exerciseKey: "e2e-reveal-fill-multifile",
                                seedPolicy: "global",
                            },
                            maxAttempts: 3,
                        },
                    ],
                }),
            });
        },
    );

    await page.route(
        (url) => url.pathname === "/api/practice",
        async (route) => {
            const url = new URL(route.request().url());
            const exerciseKey = url.searchParams.get("exerciseKey");

            if (exerciseKey && exerciseKey !== "e2e-reveal-fill-multifile") {
                await route.fallback();
                return;
            }

            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    exercise: {
                        id: "e2e-reveal-fill-multifile",
                        archetype: "e2e-reveal-fill-multifile",
                        kind: "code_input",
                        purpose: "project",
                        title: "Fill answer should create tools/badges.py",
                        prompt:
                            "Create `tools/badges.py`, import `make_badge` in `main.py`, clean the name, and print the badge.",
                        hint: "The missing helper should live in `tools/badges.py`.",
                        topic: "e2e-review-topic",
                        diff: "easy",
                        language: "python",
                        starterCode: starterFiles["main.py"],
                        starterFiles: toStarterFileArray(starterFiles),
                        workspace: {
                            language: "python",
                            entryFile: "main.py",
                            entryFilePath: "main.py",
                            starterCode: starterFiles["main.py"],
                            starterFiles: toStarterFileArray(starterFiles),
                        },
                        help: {
                            concept:
                                "A multi-file Python program can import helper functions from files inside a package folder.",
                            hint_1:
                                "Import `make_badge` from `tools.badges` in `main.py`.",
                            hint_2:
                                "The new helper file should define `make_badge(name, role)`.",
                        },
                    },
                    key: "e2e-reveal-fill-multifile-key",
                    sessionId: null,
                    run: {
                        allowReveal: true,
                    },
                    meta: {
                        allowReveal: true,
                        source: "e2e-playwright-mock",
                        authored: true,
                        purposeMode: "project",
                        chosenPurpose: "project",
                    },
                }),
            });
        },
    );

    await page.route(
        (url) => url.pathname === "/api/practice/help",
        async (route) => {
            let body: Record<string, unknown> = {};

            try {
                body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
            } catch {
                body = {};
            }

            const stepKey = String(body?.stepKey ?? "");

            if (stepKey === "concept") {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({
                        stepKey,
                        step: {
                            key: "concept",
                            label: "Need a hint?",
                            kind: "concept",
                        },
                        source: "e2e-playwright-mock",
                        content:
                            "Use a helper file when a program needs reusable logic outside `main.py`.",
                        reveal: null,
                    }),
                });
                return;
            }

            if (stepKey === "hint_1") {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({
                        stepKey,
                        step: {
                            key: "hint_1",
                            label: "Still stuck?",
                            kind: "hint",
                        },
                        source: "e2e-playwright-mock",
                        content:
                            "The missing import should be `from tools.badges import make_badge`.",
                        reveal: null,
                    }),
                });
                return;
            }

            if (stepKey === "hint_2") {
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({
                        stepKey,
                        step: {
                            key: "hint_2",
                            label: "Almost there?",
                            kind: "hint",
                        },
                        source: "e2e-playwright-mock",
                        content:
                            "`tools/badges.py` should define `make_badge(name, role)` and return the formatted badge text.",
                        reveal: null,
                    }),
                });
                return;
            }

            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    stepKey: "reveal",
                    step: {
                        key: "reveal",
                        label: "Reveal answer",
                        kind: "reveal",
                    },
                    source: "e2e-playwright-mock",
                    content: null,
                    reveal: {
                        kind: "code_input",
                        language: "python",
                        solutionCode: solutionFiles["main.py"],
                        solutionFiles,
                    },
                }),
            });
        },
    );
}

async function isVisible(locator: Locator, timeout = 1500): Promise<boolean> {
    try {
        await locator.waitFor({ state: "visible", timeout });
        return true;
    } catch {
        return false;
    }
}

function toolsTree(page: Page): Locator {
    return page.getByTestId("tools-file-tree");
}

function explorerTextNode(page: Page, label: string): Locator {
    return toolsTree(page).getByText(label, { exact: true }).first();
}

async function resetTopicIfPossible(page: Page) {
    const resetButton = page.getByTestId("review-reset-topic-button").first();

    if (!(await isVisible(resetButton))) {
        return;
    }

    await resetButton.click();

    const dialog = page.getByRole("dialog");

    if (await isVisible(dialog, 3000)) {
        const resetConfirm = dialog.getByRole("button", { name: /^Reset$/i }).last();
        await expect(resetConfirm).toBeVisible({ timeout: 10_000 });
        await resetConfirm.click();
        await expect(dialog).toBeHidden({ timeout: 10_000 });
        return;
    }

    const resetConfirm = page.getByRole("button", { name: /^Reset$/i }).last();

    if (await isVisible(resetConfirm, 3000)) {
        await resetConfirm.click();
    }
}

async function waitForRevealMultiFileProject(page: Page) {
    await expect(
        page
            .getByText(
                /Reveal Fill Multi-File|Fill answer should create tools\/badges\.py|Reveal fill creates helper files/i,
            )
            .first(),
    ).toBeVisible({ timeout: 30_000 });
}

async function bindActiveExerciseToTools(page: Page) {
    const tree = toolsTree(page);

    const openInTools = page
        .getByRole("button", {
            name: /Open in Tools|Bind this question|Bound ✓|Bound/i,
        })
        .last();

    if (await isVisible(openInTools, 30_000)) {
        await openInTools.click();
    }

    await expect(tree).toBeVisible({ timeout: 30_000 });
}

async function expandToolsFolderIfPresent(page: Page) {
    const tree = toolsTree(page);
    await expect(tree).toBeVisible({ timeout: 30_000 });

    const toolsFolder = explorerTextNode(page, "tools");

    if (await isVisible(toolsFolder, 1500)) {
        const badgesVisible = await isVisible(explorerTextNode(page, "badges.py"), 500);
        const namesVisible = await isVisible(explorerTextNode(page, "names.py"), 500);

        if (!badgesVisible && !namesVisible) {
            await toolsFolder.click();
        }
    }
}

async function expectExplorerFile(page: Page, fileName: string) {
    await expandToolsFolderIfPresent(page);

    const file = explorerTextNode(page, fileName);

    if (!(await isVisible(file, 1500))) {
        const toolsFolder = explorerTextNode(page, "tools");

        if (await isVisible(toolsFolder, 1500)) {
            await toolsFolder.click();
        }
    }

    await expect(file).toBeVisible({ timeout: 30_000 });
}

async function expectExplorerFileMissing(page: Page, fileName: string) {
    await expandToolsFolderIfPresent(page);

    await expect(toolsTree(page).getByText(fileName, { exact: true })).toHaveCount(0, {
        timeout: 3000,
    });
}

async function openExplorerFile(page: Page, fileName: string) {
    await expectExplorerFile(page, fileName);
    await explorerTextNode(page, fileName).click();
}

async function expectEditorContains(page: Page, text: string | RegExp) {
    const editor = page.locator(".monaco-editor").last();
    await expect(editor).toBeVisible({ timeout: 30_000 });
    await expect(editor).toContainText(text, { timeout: 30_000 });
}

async function openNextHelpStep(page: Page, name: RegExp): Promise<boolean> {
    const button = page.getByRole("button", { name }).last();

    if (!(await isVisible(button, 10_000))) {
        return false;
    }

    await button.click();
    return true;
}

async function openRevealAnswer(page: Page) {
    const fillAnswer = page.getByRole("button", { name: /^Fill answer$/i }).first();

    if (await isVisible(fillAnswer, 1000)) {
        return;
    }

    const sequence = [
        /^Need a hint\?$/i,
        /^Still stuck\?$/i,
        /^Almost there\?$/i,
        /^Reveal answer$/i,
        /^Reveal$/i,
    ];

    for (const label of sequence) {
        if (await isVisible(fillAnswer, 1000)) {
            return;
        }

        await openNextHelpStep(page, label);

        if (await isVisible(fillAnswer, 8000)) {
            return;
        }
    }

    await expect(fillAnswer).toBeVisible({ timeout: 30_000 });
}

test.describe("dev clone Reveal answer multi-file Fill answer", () => {
    test.beforeEach(async ({ context }) => {
        await context.clearCookies();
    });

    test("Fill answer creates missing helper files from solutionFiles", async ({ page }) => {
        test.setTimeout(150_000);

        await installPracticeMocks(page);

        await page.goto(DEV_CLONE_REVEAL_MULTIFILE_URL, {
            waitUntil: "domcontentloaded",
        });

        await waitForRevealMultiFileProject(page);

        await resetTopicIfPossible(page);

        await page.goto(DEV_CLONE_REVEAL_MULTIFILE_URL, {
            waitUntil: "domcontentloaded",
        });

        await waitForRevealMultiFileProject(page);

        await bindActiveExerciseToTools(page);

        await expectExplorerFile(page, "main.py");

        // The missing-file regression: this helper should not be present before Fill answer.
        await expectExplorerFileMissing(page, "badges.py");

        await openRevealAnswer(page);

        await expect(page.getByText(/Files included/i).first()).toBeVisible({
            timeout: 30_000,
        });

        await expect(
            page.getByText("tools/badges.py", { exact: true }).first(),
        ).toBeVisible({ timeout: 30_000 });

        await page.getByRole("button", { name: /^Fill answer$/i }).first().click();

        await expect(page.getByRole("button", { name: /Filled/i }).first()).toBeVisible({
            timeout: 15_000,
        });

        // Core regression: Fill answer must create the missing helper files from solutionFiles.
        await expectExplorerFile(page, "badges.py");
        await expectExplorerFile(page, "names.py");

        await openExplorerFile(page, "badges.py");
        await expectEditorContains(page, "def make_badge(name, role):");
        await expectEditorContains(page, /role\.upper\(\).*badge/);

        await openExplorerFile(page, "names.py");
        await expectEditorContains(page, "def clean_name(value):");

        await openExplorerFile(page, "main.py");
        await expectEditorContains(page, "from tools.names import clean_name");
        await expectEditorContains(page, "from tools.badges import make_badge");
        await expectEditorContains(page, "print(make_badge(name, role))");
    });
});
