import { expect, test, type Page } from "@playwright/test";

const DEV_REVIEW_FILE_IO_URL =
    "/en/dev/e2e/review-module-clone/python/e2e-review-clone/learn/e2e-section/e2e-review-topic/exercise/e2e-file-io";

const CREATE_FILE_CODE = `with open("output.txt", "w") as file:
    file.write("Hello, World!")
`;

const DELETE_FILE_CODE = `import os
os.remove("output.txt")
`;

const OUTPUT_TEXT = "Hello, World!";

function workspaceWithOutput(mainCode: string) {
    return [
        {
            kind: "file",
            path: "main.py",
            content: mainCode,
        },
        {
            kind: "file",
            path: "data.txt",
            content: "Hello, World!\nThis is a test file.",
        },
        {
            kind: "file",
            path: "output.txt",
            content: OUTPUT_TEXT,
        },
    ];
}

function workspaceWithoutOutput(mainCode: string) {
    return [
        {
            kind: "file",
            path: "main.py",
            content: mainCode,
        },
        {
            kind: "file",
            path: "data.txt",
            content: "Hello, World!\nThis is a test file.",
        },
    ];
}

async function waitForReviewEditor(page: Page) {
    const editor = page.getByTestId("code-editor-e2e-input");

    await expect(editor).toBeAttached();
    await expect(page.getByTestId("tools-file-tree")).toBeVisible();
    await expect(page.getByTestId("tools-file-node-main.py")).toBeVisible();

    return editor;
}

async function writeCodeAndRun(page: Page, code: string) {
    const editor = page.getByTestId("code-editor-e2e-input");

    await page.getByTestId("tools-file-node-main.py").click();
    await expect(editor).toBeAttached();
    await editor.fill(code);

    await page.getByTestId("code-runner-run-button").click();
}

async function expectMainFileStillHasCode(page: Page, code: string) {
    const editor = page.getByTestId("code-editor-e2e-input");

    await page.getByTestId("tools-file-node-main.py").click();
    await expect(editor).toHaveValue(code);

    await page.waitForTimeout(1500);
    await expect(editor).toHaveValue(code);
}

async function expectOutputFileWithContent(page: Page) {
    const outputNode = page.getByTestId("tools-file-node-output.txt");
    const editor = page.getByTestId("code-editor-e2e-input");

    await expect(outputNode).toBeVisible();
    await outputNode.click();

    await expect(editor).toHaveValue(OUTPUT_TEXT);
}

async function expectOutputFileStillHasContent(page: Page) {
    const outputNode = page.getByTestId("tools-file-node-output.txt");
    const editor = page.getByTestId("code-editor-e2e-input");

    await expect(outputNode).toBeVisible();
    await outputNode.click();

    await expect(editor).toHaveValue(OUTPUT_TEXT);

    await page.waitForTimeout(1500);
    await expect(editor).toHaveValue(OUTPUT_TEXT);
}

async function expectNoCrossFileOverwriteAfterSwitching(page: Page) {
    await expectOutputFileStillHasContent(page);
    await expectMainFileStillHasCode(page, CREATE_FILE_CODE);
    await expectOutputFileStillHasContent(page);
    await expectMainFileStillHasCode(page, CREATE_FILE_CODE);
}

async function expectOutputFileGone(page: Page) {
    await expect(page.getByTestId("tools-file-node-output.txt")).toHaveCount(0);
}

async function mockJudge0WorkspaceRuns(page: Page) {
    let runCount = 0;

    await page.route("**/api/run/judge0", async (route) => {
        runCount += 1;

        const body = route.request().postDataJSON();

        expect(body).toEqual(
            expect.objectContaining({
                kind: "code",
                language: "python",
                captureWorkspace: true,
                entry: "main.py",
            }),
        );

        expect(body.files).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    path: "main.py",
                }),
            ]),
        );

        const workspaceFiles =
            runCount === 1
                ? workspaceWithOutput(CREATE_FILE_CODE)
                : workspaceWithoutOutput(DELETE_FILE_CODE);

        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                ok: true,
                mode: "immediate",
                result: {
                    ok: true,
                    status: "Accepted",
                    stdout: "",
                    stderr: "",
                    workspaceFiles,
                },
            }),
        });
    });
}

async function installMockPtyWebSocket(page: Page) {
    await page.addInitScript(() => {
        class MockWebSocket {
            static CONNECTING = 0;
            static OPEN = 1;
            static CLOSING = 2;
            static CLOSED = 3;

            readyState = MockWebSocket.CONNECTING;
            url: string;
            onopen: ((event: Event) => void) | null = null;
            onmessage: ((event: MessageEvent) => void) | null = null;
            onerror: ((event: Event) => void) | null = null;
            onclose: ((event: CloseEvent) => void) | null = null;

            constructor(url: string) {
                this.url = url;

                setTimeout(() => {
                    this.readyState = MockWebSocket.OPEN;
                    this.onopen?.(new Event("open"));

                    this.emit({
                        type: "ready",
                        sessionId: "playwright-pty-session",
                        state: "running",
                    });

                    this.emit({
                        type: "event",
                        event: {
                            type: "status",
                            state: "running",
                            seq: 1,
                            ts: new Date().toISOString(),
                        },
                    });

                    this.emit({
                        type: "event",
                        event: {
                            type: "stdout",
                            chunk: "",
                            seq: 2,
                            ts: new Date().toISOString(),
                        },
                    });

                    this.emit({
                        type: "event",
                        event: {
                            type: "exit",
                            code: 0,
                            seq: 3,
                            ts: new Date().toISOString(),
                        },
                    });

                    this.emit({
                        type: "event",
                        event: {
                            type: "status",
                            state: "completed",
                            seq: 4,
                            ts: new Date().toISOString(),
                        },
                    });

                    this.readyState = MockWebSocket.CLOSED;
                    this.onclose?.(new CloseEvent("close"));
                }, 25);
            }

            emit(payload: unknown) {
                this.onmessage?.(
                    new MessageEvent("message", {
                        data: JSON.stringify(payload),
                    }),
                );
            }

            send(_data: string) {}

            close() {
                this.readyState = MockWebSocket.CLOSED;
                this.onclose?.(new CloseEvent("close"));
            }

            addEventListener(type: string, listener: EventListener) {
                if (type === "open") this.onopen = listener as any;
                if (type === "message") this.onmessage = listener as any;
                if (type === "error") this.onerror = listener as any;
                if (type === "close") this.onclose = listener as any;
            }

            removeEventListener() {}
        }

        Object.assign(MockWebSocket, {
            CONNECTING: 0,
            OPEN: 1,
            CLOSING: 2,
            CLOSED: 3,
        });

        // @ts-expect-error Playwright browser override
        window.WebSocket = MockWebSocket;
    });
}

async function mockPtyWorkspaceRuns(page: Page) {
    let snapshotCount = 0;

    await installMockPtyWebSocket(page);

    await page.route("**/api/run/pty/sessions/start", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                ok: true,
                sessionId: "playwright-pty-session",
                state: "running",
                attachToken: "playwright-token",
                wsUrl: "ws://playwright.invalid/session",
            }),
        });
    });

    await page.route(
        "**/api/run/pty/sessions/*/workspace/snapshot",
        async (route) => {
            snapshotCount += 1;

            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    ok: true,
                    files:
                        snapshotCount === 1
                            ? workspaceWithOutput(CREATE_FILE_CODE)
                            : workspaceWithoutOutput(DELETE_FILE_CODE),
                }),
            });
        },
    );
}

async function runCreateDeleteWorkspaceFlow(
    page: Page,
    runnerBackend: "judge0" | "pty",
) {
    await page.goto(`${DEV_REVIEW_FILE_IO_URL}?runnerBackend=${runnerBackend}`);

    await waitForReviewEditor(page);

    await writeCodeAndRun(page, CREATE_FILE_CODE);
    await expectOutputFileWithContent(page);

    await expectNoCrossFileOverwriteAfterSwitching(page);

    await writeCodeAndRun(page, DELETE_FILE_CODE);
    await expectOutputFileGone(page);

    await expectMainFileStillHasCode(page, DELETE_FILE_CODE);
}

test.describe("dev review module workspace sync", () => {
    test("Judge0 run creates and deletes files in the Explorer without cross-file overwrite", async ({
                                                                                                         page,
                                                                                                     }) => {
        await mockJudge0WorkspaceRuns(page);
        await runCreateDeleteWorkspaceFlow(page, "judge0");
    });

    test("PTY run creates and deletes files in the Explorer without cross-file overwrite", async ({
                                                                                                      page,
                                                                                                  }) => {
        await mockPtyWorkspaceRuns(page);
        await runCreateDeleteWorkspaceFlow(page, "pty");
    });
});