import { expect, test, type Page } from "@playwright/test";
import {
    expectExplorerHasPath,
    expectTerminalContains,
    expectTerminalVisible,
    installMockTerminalWorkspaceBackend,
    readMockTerminalWorkspaceMetrics,
    sendTerminal,
} from "../utils/mockTerminalWorkspace";

test.use({
    viewport: {
        width: 1440,
        height: 1000,
    },
});

const FIRST_EXERCISE_URL =
    "/en/catalog/linux/subjects/linux-terminal-fundamentals/modules/linux-1-terminal-navigation/learn/linux-terminal-fundamentals-linux-1-orientation/what-the-terminal-is/exercise/ci-create-linux-start?e2eUnlockAll=1";

const SECOND_EXERCISE_URL =
    "/en/catalog/linux/subjects/linux-terminal-fundamentals/modules/linux-1-terminal-navigation/learn/linux-terminal-fundamentals-linux-1-orientation/what-the-terminal-is/exercise/ci-make-command-practice?e2eUnlockAll=1";

const LINUX_TOPIC_SHELL_TASKS = {
    "ci-create-linux-start": {
        title: "Create linux-start",
        prompt: "Use the terminal to create linux-start/hello.txt.",
        starterCode: 'echo "Hello from Bash!"\n',
        ideConfig: {
            runnerBackend: "pty",
            layoutMode: "terminal_workspace",
            terminalSessionScope: "topic",
            requires: {
                files: true,
                multiFile: true,
                terminal: true,
            },
        },
        workspace: {
            language: "bash",
            entryFile: "README.md",
            entryFilePath: "README.md",
            starterFiles: [
                {
                    path: "README.md",
                    content: "Use the terminal to create linux-start/hello.txt",
                    language: "bash",
                    isEntry: true,
                    entry: true,
                },
            ],
        },
        workspaceExpectations: {
            requiredFolders: ["linux-start"],
            requiredFiles: ["linux-start/hello.txt"],
        },
    },
    "ci-make-command-practice": {
        title: "Make command practice",
        prompt: "Use the terminal to create linux-start/command-practice.txt.",
        starterCode: 'echo "Hello from Bash!"\n',
        ideConfig: {
            runnerBackend: "pty",
            layoutMode: "terminal_workspace",
            terminalSessionScope: "topic",
            requires: {
                files: true,
                multiFile: true,
                terminal: true,
            },
        },
        workspace: {
            language: "bash",
            entryFile: "README.md",
            entryFilePath: "README.md",
            starterFiles: [
                {
                    path: "README.md",
                    content: "Use the terminal to create linux-start/command-practice.txt",
                    language: "bash",
                    isEntry: true,
                    entry: true,
                },
            ],
        },
        workspaceExpectations: {
            requiredFolders: ["linux-start"],
            requiredFiles: ["linux-start/command-practice.txt"],
        },
    },
} as const;

type SubmittedEntry = {
    kind?: "file" | "directory";
    path: string;
    content?: string;
};

function collectSubmittedEntries(value: unknown): SubmittedEntry[] {
    const seen = new Set<unknown>();

    function visit(node: unknown): SubmittedEntry[] {
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
                    typeof (file as Record<string, unknown>).path === "string",
            )
        ) {
            return (record.files as Array<Record<string, unknown>>).map((file) => ({
                kind:
                    (file.kind as "file" | "directory" | undefined) ??
                    (typeof file.content === "string" ? "file" : undefined),
                path: String(file.path),
                ...(typeof file.content === "string"
                    ? { content: String(file.content) }
                    : {}),
            }));
        }

        return Object.values(record).flatMap((item) => visit(item));
    }

    return visit(value);
}

function practiceKeyFromRequest(route: Parameters<Page["route"]>[1] extends (
    route: infer T,
) => unknown
    ? T
    : never) {
    const url = new URL(route.request().url());
    const queryExerciseKey = url.searchParams.get("exerciseKey");
    if (queryExerciseKey) {
        return queryExerciseKey;
    }

    const referer = route.request().headers()["referer"] ?? "";
    if (referer.includes("ci-make-command-practice")) {
        return "ci-make-command-practice";
    }
    if (referer.includes("ci-create-linux-start")) {
        return "ci-create-linux-start";
    }

    return "ci-create-linux-start";
}

async function installLinuxPracticeMocks(page: Page) {
    await page.route(
        (url) => url.pathname === "/api/practice",
        async (route) => {
            const exerciseKey = practiceKeyFromRequest(route as any);
            const fixture =
                LINUX_TOPIC_SHELL_TASKS[
                    exerciseKey as keyof typeof LINUX_TOPIC_SHELL_TASKS
                ] ?? LINUX_TOPIC_SHELL_TASKS["ci-create-linux-start"];

            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    key: `practice-key-${exerciseKey}`,
                    sessionId: `practice-session-${exerciseKey}`,
                    exercise: {
                        id: exerciseKey,
                        exerciseKey,
                        kind: "code_input",
                        title: fixture.title,
                        prompt: fixture.prompt,
                        language: "bash",
                        ideConfig: fixture.ideConfig,
                        workspace: fixture.workspace,
                        workspaceExpectations: fixture.workspaceExpectations,
                        starterCode: fixture.starterCode,
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
        },
    );

    await page.route(
        (url) => url.pathname === "/api/practice/validate",
        async (route) => {
            const body = route.request().postDataJSON();
            const entries = collectSubmittedEntries(body);
            const paths = new Set(entries.map((entry) => entry.path));
            const rawBody = JSON.stringify(body);

            const exerciseKey = rawBody.includes("practice-key-ci-make-command-practice")
                ? "ci-make-command-practice"
                : rawBody.includes("practice-key-ci-create-linux-start")
                  ? "ci-create-linux-start"
                  : route.request().headers()["referer"]?.includes("ci-make-command-practice")
                    ? "ci-make-command-practice"
                    : "ci-create-linux-start";

            const requiredFiles =
                LINUX_TOPIC_SHELL_TASKS[
                    exerciseKey as keyof typeof LINUX_TOPIC_SHELL_TASKS
                ].workspaceExpectations.requiredFiles;

            const ok = requiredFiles.every((path) => paths.has(path));

            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    ok,
                    finalized: ok,
                    explanation: ok
                        ? "Correct."
                        : `Missing file: ${requiredFiles[0]}`,
                    attempts: {
                        used: 1,
                        max: 3,
                        left: ok ? 2 : 0,
                    },
                }),
            });
        },
    );
}

test.describe("linux terminal session reuse", () => {
    test.beforeEach(async ({ page }) => {
        await installMockTerminalWorkspaceBackend(page);
        await installLinuxPracticeMocks(page);
    });

    test("reuses one terminal session across same-topic Linux try-it cards and validates each card separately", async ({
        page,
    }) => {
        await page.goto(FIRST_EXERCISE_URL, {
            waitUntil: "domcontentloaded",
            timeout: 45_000,
        });

        await expect(page.getByTestId("code-input-exercise")).toBeVisible({
            timeout: 45_000,
        });
        await expect(page.locator("body")).toContainText("Bound to:");
        await expectTerminalVisible(page);
        await expectTerminalContains(page, "[starting workspace terminal]");

        await sendTerminal(page, "mkdir -p linux-start");
        await sendTerminal(page, "touch linux-start/hello.txt");

        await expectExplorerHasPath(page, "linux-start");
        await expectExplorerHasPath(page, "linux-start/hello.txt");

        await page.getByTestId("review-practice-submit-button").click();
        await expect(page.getByTestId("review-practice-result-correct")).toBeVisible({
            timeout: 15_000,
        });

        const afterFirstMetrics = await readMockTerminalWorkspaceMetrics(page);
        expect(afterFirstMetrics.sessionIds).toHaveLength(1);

        await page.goto(SECOND_EXERCISE_URL, {
            waitUntil: "domcontentloaded",
            timeout: 45_000,
        });

        await expect(page.getByTestId("code-input-exercise")).toBeVisible({
            timeout: 45_000,
        });
        await expectTerminalVisible(page);
        await expect(page.locator("body")).not.toContainText("Too many active sessions");
        await expectExplorerHasPath(page, "linux-start");
        await expectExplorerHasPath(page, "linux-start/hello.txt");

        await sendTerminal(page, "touch linux-start/command-practice.txt");

        await expectExplorerHasPath(page, "linux-start/command-practice.txt");

        await page.getByTestId("review-practice-submit-button").click();
        await expect(page.getByTestId("review-practice-result-correct")).toBeVisible({
            timeout: 15_000,
        });

        const finalMetrics = await readMockTerminalWorkspaceMetrics(page);
        expect(finalMetrics.sessionIds).toHaveLength(1);
        expect(finalMetrics.ensureCalls).toBeGreaterThanOrEqual(1);
        expect(finalMetrics.ensureCalls).toBeLessThanOrEqual(2);
        if (finalMetrics.ensureCalls > 1) {
            expect(finalMetrics.reusedEnsureCalls).toBeGreaterThanOrEqual(1);
        }
    });
});
