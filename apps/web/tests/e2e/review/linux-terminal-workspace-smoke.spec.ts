import { expect, test, type Page } from "@playwright/test";
import {
    expectTerminalContains,
    expectTerminalVisible,
    explorerPathLocator,
    installMockTerminalWorkspaceBackend,
    sendTerminal,
} from "../utils/mockTerminalWorkspace";

test.use({
    viewport: {
        width: 1440,
        height: 1000,
    },
});

const LINUX_TERMINAL_LAB_URL =
    "/en/dev/e2e/review-module-clone/python/e2e-review-clone/learn/e2e-section/e2e-review-topic/exercise/e2e-print-name";

const LINUX_TERMINAL_FIXTURE = {
    title: "Create the Linux lab folders",
    prompt: "Use the terminal to create linux-lab/notes/today.txt.",
    starterCode: 'echo "Hello from Bash!"\n',
    ideConfig: {
        runnerBackend: "pty",
        layoutMode: "terminal_workspace",
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
                content: "Use the terminal to create linux-lab/notes/today.txt",
                language: "bash",
                isEntry: true,
                entry: true,
            },
        ],
    },
    workspaceExpectations: {
        requiredFolders: ["linux-lab", "linux-lab/notes"],
        requiredFiles: ["linux-lab/notes/today.txt"],
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

async function installPracticeMocks(page: Page) {
    await page.route(
        (url) => url.pathname === "/api/practice",
        async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    key: "practice-key-linux-terminal-lab",
                    sessionId: "practice-session-linux-terminal-lab",
                    exercise: {
                        id: "linux-course-1-terminal-lab",
                        exerciseKey: "linux-course-1-terminal-lab",
                        kind: "code_input",
                        title: LINUX_TERMINAL_FIXTURE.title,
                        prompt: LINUX_TERMINAL_FIXTURE.prompt,
                        language: "bash",
                        ideConfig: LINUX_TERMINAL_FIXTURE.ideConfig,
                        workspace: LINUX_TERMINAL_FIXTURE.workspace,
                        workspaceExpectations:
                            LINUX_TERMINAL_FIXTURE.workspaceExpectations,
                        starterCode: LINUX_TERMINAL_FIXTURE.starterCode,
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
            const ok =
                paths.has("linux-lab") &&
                paths.has("linux-lab/notes") &&
                paths.has("linux-lab/notes/today.txt");

            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    ok,
                    finalized: ok,
                    explanation: ok
                        ? "Correct."
                        : "Missing file: linux-lab/notes/today.txt",
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

test.describe("linux terminal_workspace smoke", () => {
    test.beforeEach(async ({ page }) => {
        await installMockTerminalWorkspaceBackend(page);
        await installPracticeMocks(page);
    });

    test("renders terminal-only bash lab and checks answer from terminal-created workspace", async ({
        page,
    }) => {
        await page.goto(LINUX_TERMINAL_LAB_URL, {
            waitUntil: "domcontentloaded",
            timeout: 45_000,
        });

        await expect(page.getByTestId("interactive-terminal")).toBeVisible({
            timeout: 45_000,
        });
        await expect(page.getByTestId("interactive-terminal")).toBeVisible();
        await expect(explorerPathLocator(page, "README.md")).toHaveCount(0);
        await expect(page.getByTestId("code-editor-e2e-input")).toHaveCount(0);
        await expectTerminalVisible(page);
        await expect(page.getByTestId("code-runner-run-button")).toHaveCount(0);
        await expect(page.getByRole("button", { name: /^Output$/ })).toHaveCount(0);
        await expect(page.getByRole("button", { name: /^Terminal$/ })).toHaveCount(0);
        await expect(page.getByTestId("review-practice-submit-button")).toBeVisible();

        await expectTerminalContains(page, "[starting workspace terminal]");

        await sendTerminal(page, "mkdir -p linux-lab/notes");
        await sendTerminal(page, "touch linux-lab/notes/today.txt");

        await page.getByTestId("review-practice-submit-button").click();

        await expect(page.getByTestId("review-practice-result-correct")).toBeVisible({
            timeout: 15_000,
        });
    });
});
