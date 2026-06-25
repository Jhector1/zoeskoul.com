import { expect, test, type Page, type Route } from "@playwright/test";
import {
    expectTerminalContains,
    expectTerminalVisible,
    installMockTerminalWorkspaceBackend,
    readMockTerminalWorkspaceMetrics,
    sendTerminal,
} from "../utils/mockTerminalWorkspace";

// Zoeskoul E2E suite pruning: this file is opt-in.
test.skip(process.env.RUNNER_E2E !== "1", "Runner/PTY E2E is opt-in. Start the local runner and run with RUNNER_E2E=1 or pnpm test:e2e:runner.");


function practiceKeyFromRequest(route: Route): string | null {
    const request = route.request();
    const url = new URL(request.url());

    const directKey =
        url.searchParams.get("exerciseStateKey") ??
        url.searchParams.get("practiceKey") ??
        url.searchParams.get("key");

    if (directKey) {
        return directKey;
    }

    const referer = request.headers()["referer"] ?? "";

    if (!referer) {
        return null;
    }

    try {
        const refererUrl = new URL(referer);
        return (
            refererUrl.searchParams.get("exerciseStateKey") ??
            refererUrl.searchParams.get("practiceKey") ??
            refererUrl.searchParams.get("key")
        );
    } catch {
        return null;
    }
}
test.use({
    viewport: {
        width: 1440,
        height: 1000,
    },
});

const FIRST_EXERCISE_URL =
    "/en/dev/e2e/review-module-clone/linux/e2e-terminal-review-clone/learn/e2e-terminal-section/e2e-terminal-topic/exercise/e2e-linux-start?e2eUnlockAll=1";

const SECOND_EXERCISE_URL =
    "/en/dev/e2e/review-module-clone/linux/e2e-terminal-review-clone/learn/e2e-terminal-section/e2e-terminal-topic/exercise/e2e-linux-command-practice?e2eUnlockAll=1";

const LINUX_TOPIC_SHELL_TASKS = {
    "e2e-linux-start": {
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
    "e2e-linux-command-practice": {
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



async function installLinuxPracticeMocks(page: Page) {
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

    await page.route(
        (url) => url.pathname === "/api/practice",
        async (route) => {
            const exerciseKey = practiceKeyFromRequest(route );
            const fixture =
                LINUX_TOPIC_SHELL_TASKS[
                    exerciseKey as keyof typeof LINUX_TOPIC_SHELL_TASKS
                ] ?? LINUX_TOPIC_SHELL_TASKS["e2e-linux-start"];

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

            const exerciseKey = rawBody.includes("practice-key-e2e-linux-command-practice")
                ? "e2e-linux-command-practice"
                : rawBody.includes("practice-key-e2e-linux-start")
                  ? "e2e-linux-start"
                  : route.request().headers()["referer"]?.includes("e2e-linux-command-practice")
                    ? "e2e-linux-command-practice"
                    : "e2e-linux-start";

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
                    expected: null,
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

        await expect(page.getByTestId("interactive-terminal")).toBeVisible({
            timeout: 45_000,
        });
        await expect(page.locator("body")).toContainText("Bound to:");
        await expectTerminalVisible(page);
        await expectTerminalContains(page, "[starting workspace terminal]");

        await sendTerminal(page, "mkdir -p linux-start");
        await sendTerminal(page, "touch linux-start/hello.txt");

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

        await expect(page.getByTestId("interactive-terminal")).toBeVisible({
            timeout: 45_000,
        });
        await expectTerminalVisible(page);
        await expect(page.locator("body")).not.toContainText("Too many active sessions");

        await sendTerminal(page, "touch linux-start/command-practice.txt");

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
