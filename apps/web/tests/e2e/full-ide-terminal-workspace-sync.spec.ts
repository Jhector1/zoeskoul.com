import { expect, test, type Locator, type Page } from "@playwright/test";

// Zoeskoul E2E suite pruning: this file is opt-in.
test.skip(process.env.RUN_IDE_E2E !== "1", "Long FullIDE terminal/workspace E2E is opt-in. Run with RUN_IDE_E2E=1 or pnpm test:e2e:ide.");


const PYTHON_SANDBOX_URL = "/en/sandbox/programming/python?e2eFullIdeAccess=1";
const CPP_SANDBOX_URL = "/en/sandbox/programming/cpp?e2eFullIdeAccess=1";

async function installMockTerminalBackend(page: Page) {
    await page.addInitScript(() => {
        (window as typeof window & {
            __pwEnableFullIdeTerminalInputHook?: boolean;
        }).__pwEnableFullIdeTerminalInputHook = true;

        const STORAGE_KEY = "__pw_fullide_terminal_workspace_sync_v1";
        const originalFetch = window.fetch.bind(window);
        const openSockets = new Map<string, MockWebSocket>();

        type MockEntry =
            | { kind?: "file"; path: string; content: string }
            | { kind: "directory"; path: string };

        type MockWorkspace = {
            entries: Record<string, MockEntry>;
        };

        type MockSession = {
            id: string;
            kind: "shell" | "code";
            scope: string;
            seq: number;
            currentLine: string;
            prompt: string;
            pendingHeredoc: null | {
                path: string;
                endTag: string;
                lines: string[];
            };
        };

        type MockState = {
            nextSessionId: number;
            sessions: Record<string, MockSession>;
            workspaces: Record<string, MockWorkspace>;
            metrics: {
                codeRuns: number;
            };
            lastRunRequest: null | {
                backend: "judge0" | "pty";
                code?: string;
                files?: MockEntry[];
            };
        };

        function normalizePath(input: string) {
            let path = String(input ?? "").replace(/\\/g, "/").trim();
            if (!path) return "";

            path = path.replace(/^\/workspace\/?/, "");
            path = path.replace(/^\.\/+/, "");
            path = path.replace(/^\/+/, "");
            path = path.replace(/\/+/g, "/");

            return path.replace(/\/$/, "");
        }

        function loadState(): MockState {
            try {
                const raw = window.localStorage.getItem(STORAGE_KEY);
                if (raw) return JSON.parse(raw) as MockState;
            } catch {}

            return {
                nextSessionId: 1,
                sessions: {},
                workspaces: {},
                metrics: {
                    codeRuns: 0,
                },
                lastRunRequest: null,
            };
        }

        function saveState(state: MockState) {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        }

        function currentScope() {
            return window.location.pathname;
        }

        function defaultWorkspaceEntriesForScope(scope: string): MockEntry[] {
            if (scope.includes("/sandbox/programming/python")) {
                return [
                    { kind: "directory", path: "src" },
                    {
                        kind: "file",
                        path: "src/main.py",
                        content: 'print("Hello Python!")\n',
                    },
                ];
            }

            if (scope.includes("/sandbox/programming/cpp")) {
                return [
                    { kind: "directory", path: "src" },
                    {
                        kind: "file",
                        path: "src/main.cpp",
                        content:
                            "#include <iostream>\n\nint main() {\n    std::cout << \"Hello C++!\\n\";\n    return 0;\n}\n",
                    },
                ];
            }

            return [];
        }

        function entryFilePathForScope(scope: string) {
            if (scope.includes("/sandbox/programming/python")) {
                return "src/main.py";
            }

            if (scope.includes("/sandbox/programming/cpp")) {
                return "src/main.cpp";
            }

            return "src/main.txt";
        }

        function getWorkspace(state: MockState, scope: string): MockWorkspace {
            state.workspaces[scope] ??= { entries: {} };
            return state.workspaces[scope]!;
        }

        function sortEntries(entries: MockEntry[]) {
            return [...entries].sort((a, b) => {
                const aKind = a.kind ?? "file";
                const bKind = b.kind ?? "file";
                if (aKind !== bKind) return aKind === "directory" ? -1 : 1;

                const aDepth = normalizePath(a.path).split("/").filter(Boolean).length;
                const bDepth = normalizePath(b.path).split("/").filter(Boolean).length;
                if (aDepth !== bDepth) return aDepth - bDepth;

                return normalizePath(a.path).localeCompare(normalizePath(b.path));
            });
        }

        function listEntriesFromPayload(payload: unknown): MockEntry[] {
            if (Array.isArray(payload)) {
                const entries: Array<MockEntry | null> = payload
                    .map((entry: any) => {
                        const path = normalizePath(entry?.path);
                        if (!path) return null;

                        if (entry?.kind === "directory") {
                            return { kind: "directory" as const, path };
                        }

                        return {
                            kind: "file" as const,
                            path,
                            content: String(entry?.content ?? ""),
                        };
                    });

                return entries.filter((entry): entry is MockEntry => entry !== null);
            }

            if (payload && typeof payload === "object") {
                return Object.entries(payload as Record<string, string>)
                    .map(([path, content]) => ({
                        kind: "file" as const,
                        path: normalizePath(path),
                        content: String(content ?? ""),
                    }))
                    .filter((entry) => !!entry.path);
            }

            return [];
        }

        function replaceWorkspaceEntries(state: MockState, scope: string, entries: MockEntry[]) {
            const workspace = getWorkspace(state, scope);
            const priorHistory = workspace.entries[".bash_history"];
            workspace.entries = {};

            for (const entry of entries) {
                const path = normalizePath(entry.path);
                if (!path) continue;

                if ((entry.kind ?? "file") === "directory") {
                    workspace.entries[path] = { kind: "directory", path };
                    continue;
                }

                workspace.entries[path] = {
                    kind: "file",
                    path,
                    content: String((entry as any).content ?? ""),
                };
            }

            if (!workspace.entries[".bash_history"] && priorHistory) {
                workspace.entries[".bash_history"] = priorHistory;
            }
        }

        function ensureDirectoryEntries(paths: string[]) {
            const out = new Set<string>();

            for (const path of paths) {
                const parts = normalizePath(path).split("/").filter(Boolean);
                for (let i = 1; i < parts.length; i += 1) {
                    out.add(parts.slice(0, i).join("/"));
                }
            }

            return [...out];
        }

        function workspaceEntriesForSnapshot(state: MockState, scope: string): MockEntry[] {
            const workspace = getWorkspace(state, scope);
            const filePaths = Object.values(workspace.entries)
                .filter((entry) => (entry.kind ?? "file") !== "directory")
                .map((entry) => normalizePath(entry.path));
            const inferredDirs = ensureDirectoryEntries(filePaths);

            const merged = new Map<string, MockEntry>();

            for (const dir of inferredDirs) {
                if (!dir) continue;
                merged.set(dir, { kind: "directory", path: dir });
            }

            for (const entry of Object.values(workspace.entries)) {
                const path = normalizePath(entry.path);
                if (!path) continue;
                merged.set(path, {
                    ...(entry.kind === "directory"
                        ? { kind: "directory" as const, path }
                        : {
                              kind: "file" as const,
                              path,
                              content: String((entry as any).content ?? ""),
                          }),
                });
            }

            return sortEntries([...merged.values()]);
        }

        function getHistoryContent(state: MockState, scope: string) {
            const workspace = getWorkspace(state, scope);
            const entry = workspace.entries[".bash_history"];
            if (!entry || entry.kind === "directory") return "";
            return String(entry.content ?? "");
        }

        function setHistoryContent(state: MockState, scope: string, content: string) {
            const workspace = getWorkspace(state, scope);
            const normalized = String(content ?? "");

            if (!normalized) {
                delete workspace.entries[".bash_history"];
                return;
            }

            workspace.entries[".bash_history"] = {
                kind: "file",
                path: ".bash_history",
                content: normalized.endsWith("\n") ? normalized : `${normalized}\n`,
            };
        }

        function appendHistoryLine(state: MockState, scope: string, line: string) {
            const trimmed = String(line ?? "").trim();
            if (!trimmed) return;

            const current = getHistoryContent(state, scope);
            setHistoryContent(state, scope, `${current}${trimmed}\n`);
        }

        function stripShellQuotes(input: string) {
            const trimmed = input.trim();
            const single = trimmed.match(/^'(.*)'$/);
            if (single) return single[1] ?? "";
            const double = trimmed.match(/^"(.*)"$/);
            if (double) return double[1] ?? "";
            return trimmed;
        }

        function writeFile(state: MockState, scope: string, path: string, content: string) {
            const normalized = normalizePath(path);
            if (!normalized) return;

            const workspace = getWorkspace(state, scope);
            workspace.entries[normalized] = {
                kind: "file",
                path: normalized,
                content,
            };
        }

        function ensureDirectory(state: MockState, scope: string, path: string) {
            const normalized = normalizePath(path);
            if (!normalized) return;

            const workspace = getWorkspace(state, scope);
            workspace.entries[normalized] = {
                kind: "directory",
                path: normalized,
            };
        }

        function listChildren(state: MockState, scope: string, path: string) {
            const target = normalizePath(path);
            const prefix = target ? `${target}/` : "";
            const names = new Set<string>();

            for (const entry of workspaceEntriesForSnapshot(state, scope)) {
                const fullPath = normalizePath(entry.path);
                if (!fullPath || fullPath === ".bash_history") continue;

                if (!target) {
                    const head = fullPath.split("/").filter(Boolean)[0];
                    if (head) names.add(head);
                    continue;
                }

                if (!fullPath.startsWith(prefix)) continue;
                const remainder = fullPath.slice(prefix.length);
                const head = remainder.split("/").filter(Boolean)[0];
                if (head) names.add(head);
            }

            return [...names].sort().join("\n");
        }

        function formatHistory(state: MockState, scope: string) {
            const lines = getHistoryContent(state, scope)
                .split(/\r?\n/)
                .filter(Boolean);

            return lines
                .map((line, index) => `${String(index + 1).padStart(5, " ")}  ${line}`)
                .join("\n");
        }

        function runShellSegment(state: MockState, session: MockSession, segment: string) {
            const command = segment.trim();
            if (!command) return "";

            if (command === "pwd") return "/workspace\n";
            if (command === "ls") {
                const listed = listChildren(state, session.scope, "");
                return listed ? `${listed}\n` : "";
            }

            const lsMatch = command.match(/^ls\s+(.+)$/);
            if (lsMatch) {
                const listed = listChildren(state, session.scope, lsMatch[1] ?? "");
                return listed ? `${listed}\n` : "";
            }

            if (command === "whoami") return "sandbox\n";
            if (command === "history") {
                const listed = formatHistory(state, session.scope);
                return listed ? `${listed}\n` : "";
            }

            const mkdirMatch = command.match(/^mkdir(?:\s+-p)?\s+(.+)$/);
            if (mkdirMatch) {
                for (const part of String(mkdirMatch[1] ?? "")
                    .split(/\s+/)
                    .filter(Boolean)) {
                    ensureDirectory(state, session.scope, part);
                }
                return "";
            }

            const echoRedirectMatch = command.match(/^echo\s+(.+?)\s*>\s*(.+)$/);
            if (echoRedirectMatch) {
                const value = stripShellQuotes(echoRedirectMatch[1] ?? "");
                writeFile(state, session.scope, echoRedirectMatch[2] ?? "", `${value}\n`);
                return "";
            }

            const echoMatch = command.match(/^echo\s+(.+)$/);
            if (echoMatch) {
                return `${stripShellQuotes(echoMatch[1] ?? "")}\n`;
            }

            const catMatch = command.match(/^cat\s+(.+)$/);
            if (catMatch) {
                const path = normalizePath(catMatch[1] ?? "");
                const workspace = getWorkspace(state, session.scope);
                const entry = workspace.entries[path];
                if (!entry || entry.kind === "directory") return "";
                return String(entry.content ?? "");
            }

            return "";
        }

        function shellPrompt(session: MockSession) {
            return session.prompt;
        }

        function nextSeq(session: MockSession) {
            session.seq += 1;
            return session.seq;
        }

        function emitToSocket(
            socket: MockWebSocket,
            payload: Record<string, unknown>,
        ) {
            socket.onmessage?.(
                new MessageEvent("message", {
                    data: JSON.stringify(payload),
                }),
            );
        }

        function emitStdout(socket: MockWebSocket, session: MockSession, chunk: string) {
            emitToSocket(socket, {
                type: "event",
                event: {
                    type: "stdout",
                    chunk,
                    seq: nextSeq(session),
                    ts: new Date().toISOString(),
                },
            });
        }

        function emitStatus(
            socket: MockWebSocket,
            session: MockSession,
            state: "preparing" | "compiling" | "running" | "completed",
        ) {
            emitToSocket(socket, {
                type: "event",
                event: {
                    type: "status",
                    state,
                    seq: nextSeq(session),
                    ts: new Date().toISOString(),
                },
            });
        }

        function runShellLine(state: MockState, session: MockSession, line: string) {
            const trimmed = line.trim();

            if (session.pendingHeredoc) {
                if (line === session.pendingHeredoc.endTag) {
                    writeFile(
                        state,
                        session.scope,
                        session.pendingHeredoc.path,
                        `${session.pendingHeredoc.lines.join("\n")}\n`,
                    );
                    session.pendingHeredoc = null;
                    return "";
                }

                session.pendingHeredoc.lines.push(line);
                return "";
            }

            if (!trimmed) return "";

            appendHistoryLine(state, session.scope, trimmed);

            const heredocMatch = trimmed.match(/^cat\s*>\s*([^\s]+)\s*<<'([^']+)'$/);
            if (heredocMatch) {
                session.pendingHeredoc = {
                    path: normalizePath(heredocMatch[1] ?? ""),
                    endTag: heredocMatch[2] ?? "EOF",
                    lines: [],
                };
                return "";
            }

            return trimmed
                .split(/&&|;/g)
                .map((segment) => runShellSegment(state, session, segment))
                .join("");
        }

        function createResponse(body: unknown, status = 200) {
            return new Response(JSON.stringify(body), {
                status,
                headers: {
                    "Content-Type": "application/json",
                },
            });
        }

        class MockWebSocket {
            static CONNECTING = 0;
            static OPEN = 1;
            static CLOSING = 2;
            static CLOSED = 3;

            readyState = MockWebSocket.CONNECTING;
            url: string;
            sessionId: string;
            onopen: ((event: Event) => void) | null = null;
            onmessage: ((event: MessageEvent) => void) | null = null;
            onerror: ((event: Event) => void) | null = null;
            onclose: ((event: CloseEvent) => void) | null = null;

            constructor(url: string) {
                this.url = url;
                this.sessionId = String(url.split("/").pop() ?? "");

                window.setTimeout(() => {
                    const state = loadState();
                    const session = state.sessions[this.sessionId];

                    this.readyState = MockWebSocket.OPEN;
                    this.onopen?.(new Event("open"));

                    if (!session) {
                        this.close();
                        return;
                    }

                    emitToSocket(this, {
                        type: "ready",
                        sessionId: session.id,
                        state: session.kind === "shell" ? "running" : "preparing",
                    });

                    if (session.kind === "shell") {
                        openSockets.set(this.sessionId, this);
                        emitStatus(this, session, "running");
                        emitStdout(this, session, shellPrompt(session));
                        saveState(state);
                        return;
                    }

                    emitStatus(this, session, "preparing");

                    window.setTimeout(() => {
                        const nextState = loadState();
                        const nextSession = nextState.sessions[this.sessionId];
                        if (!nextSession) return;

                        emitStatus(this, nextSession, "compiling");
                        emitStatus(this, nextSession, "running");
                        emitStdout(this, nextSession, "C++ run ok\n");
                        emitStatus(this, nextSession, "completed");
                        saveState(nextState);
                        this.close();
                    }, 50);
                }, 10);
            }

            send(raw: string) {
                let message: any = null;
                try {
                    message = JSON.parse(raw);
                } catch {
                    return;
                }

                if (!message || message.type !== "input") return;

                const state = loadState();
                const session = state.sessions[this.sessionId];
                if (!session || session.kind !== "shell") return;

                const data = String(message.data ?? "");

                for (let i = 0; i < data.length; i += 1) {
                    const char = data[i] ?? "";

                    if (char === "\r" || char === "\n") {
                        if (char === "\n" && data[i - 1] === "\r") {
                            continue;
                        }

                        const line = session.currentLine;
                        session.currentLine = "";
                        const output = runShellLine(state, session, line);
                        if (output) emitStdout(this, session, output);
                        if (!session.pendingHeredoc) {
                            emitStdout(this, session, shellPrompt(session));
                        }
                        continue;
                    }

                    session.currentLine += char;
                }

                saveState(state);
            }

            close() {
                openSockets.delete(this.sessionId);
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

        Object.assign(window, {
            __pwDispatchTerminalInput(command: string) {
                const state = loadState();
                const scope = currentScope();
                const session = Object.values(state.sessions)
                    .filter((entry) => entry.kind === "shell" && entry.scope === scope)
                    .at(-1);

                if (!session) return false;

                const socket = openSockets.get(session.id);
                if (!socket) return false;

                socket.send(
                    JSON.stringify({
                        type: "input",
                        data: command.endsWith("\n") ? command : `${command}\n`,
                    }),
                );

                return true;
            },
        });

        window.fetch = async (input, init) => {
            const url =
                typeof input === "string"
                    ? input
                    : input instanceof URL
                        ? input.toString()
                        : input.url;

            if (url.endsWith("/api/run/judge0")) {
                const body = JSON.parse(String(init?.body ?? "{}"));
                const state = loadState();
                const scope = currentScope();
                const files = listEntriesFromPayload(body?.files);

                if (files.length) {
                    replaceWorkspaceEntries(state, scope, files);
                } else if (typeof body?.code === "string") {
                    writeFile(state, scope, entryFilePathForScope(scope), body.code);
                }

                state.metrics.codeRuns += 1;
                state.lastRunRequest = {
                    backend: "judge0",
                    code: typeof body?.code === "string" ? body.code : undefined,
                    files,
                };
                saveState(state);

                return createResponse({
                    ok: true,
                    mode: "immediate",
                    result: {
                        ok: true,
                        status: "Accepted",
                        stdout: "C++ run ok\n",
                        stderr: "",
                    },
                });
            }

            if (
                url.endsWith("/api/run/pty/sessions/start") ||
                url.endsWith("/api/run/pty/sessions/ensure")
            ) {
                const body = JSON.parse(String(init?.body ?? "{}"));
                const state = loadState();
                const sessionId = `playwright-session-${state.nextSessionId++}`;
                const scope = currentScope();

                const files = listEntriesFromPayload(body?.files);
                if (files.length) {
                    replaceWorkspaceEntries(state, scope, files);
                } else if (workspaceEntriesForSnapshot(state, scope).length === 0) {
                    replaceWorkspaceEntries(
                        state,
                        scope,
                        defaultWorkspaceEntriesForScope(scope),
                    );
                } else if (typeof body?.code === "string") {
                    writeFile(state, scope, entryFilePathForScope(scope), body.code);
                }

                state.lastRunRequest = {
                    backend: "pty",
                    code: typeof body?.code === "string" ? body.code : undefined,
                    files,
                };

                state.sessions[sessionId] = {
                    id: sessionId,
                    kind:
                        body?.kind === "shell" ||
                        (body?.language === "bash" && body?.mode === "interactive")
                            ? "shell"
                            : "code",
                    scope,
                    seq: 0,
                    currentLine: "",
                    prompt: "sandbox@workspace:/workspace$ ",
                    pendingHeredoc: null,
                };

                if (state.sessions[sessionId]?.kind === "code") {
                    state.metrics.codeRuns += 1;
                }

                saveState(state);

                return createResponse({
                    ok: true,
                    sessionId,
                    state: state.sessions[sessionId]?.kind === "shell" ? "running" : "preparing",
                    attachToken: "playwright-token",
                    wsUrl: `ws://playwright.invalid/session/${sessionId}`,
                    reused: false,
                });
            }

            const replaceMatch = url.match(/\/api\/run\/pty\/sessions\/([^/]+)\/workspace\/replace$/);
            if (replaceMatch) {
                const sessionId = replaceMatch[1] ?? "";
                const body = JSON.parse(String(init?.body ?? "{}"));
                const state = loadState();
                const session = state.sessions[sessionId];
                const scope = session?.scope ?? currentScope();
                replaceWorkspaceEntries(state, scope, listEntriesFromPayload(body?.files));
                saveState(state);

                return createResponse({
                    ok: true,
                    fileCount: workspaceEntriesForSnapshot(state, scope).length,
                });
            }

            const snapshotMatch = url.match(/\/api\/run\/pty\/sessions\/([^/]+)\/workspace\/snapshot$/);
            if (snapshotMatch) {
                const sessionId = snapshotMatch[1] ?? "";
                const state = loadState();
                const session = state.sessions[sessionId];
                const scope = session?.scope ?? currentScope();

                return createResponse({
                    ok: true,
                    files: workspaceEntriesForSnapshot(state, scope),
                });
            }

            if (url.endsWith("/api/run/pty/sessions/heartbeat")) {
                return createResponse({ ok: true });
            }

            return originalFetch(input, init);
        };

        // @ts-expect-error Playwright browser override
        window.WebSocket = MockWebSocket;
    });
}

function explorerPathLocator(page: Page, path: string) {
    return page.locator(`[data-node-path="${path}"]`);
}

async function waitForFullIDE(page: Page, entryPath: string) {
    await expect(page.getByTestId("tools-file-tree")).toBeVisible({
        timeout: 120_000,
    });
    await expect(explorerPathLocator(page, "src")).toBeVisible({
        timeout: 30_000,
    });
    await expectExplorerHasPath(page, entryPath);
}

async function openTerminal(page: Page) {
    const terminal = page.getByTestId("interactive-terminal");
    if (await terminal.isVisible().catch(() => false)) {
        return;
    }

    const tab = page.getByRole("button", { name: /^Terminal$/ });
    await expect(tab).toBeVisible();
    await tab.evaluate((button) => {
        (button as HTMLButtonElement).click();
    });
    await page.waitForTimeout(50);
    await expect(terminal).toBeVisible({ timeout: 30_000 });
    await expectTerminalContains(page, "[starting workspace terminal]");
}

async function sendTerminal(page: Page, command: string) {
    await openTerminal(page);
    await page.waitForFunction(() => {
        const w = window as typeof window & {
            __pwDispatchTerminalInput?: (command: string) => boolean;
            __pwDispatchTerminalInputThroughApp?: (command: string) => Promise<boolean>;
            __pwSyncTerminalInputThroughApp?: (command: string) => Promise<boolean>;
            __pwForceTerminalWorkspaceSync?: () => Promise<boolean>;
        };

        return Boolean(
            w.__pwDispatchTerminalInput ||
                w.__pwDispatchTerminalInputThroughApp ||
                w.__pwSyncTerminalInputThroughApp ||
                w.__pwForceTerminalWorkspaceSync,
        );
    });

    const prefersAppDispatch =
        /[><]/.test(command) ||
        /\bmkdir\b/.test(command) ||
        /\btouch\b/.test(command) ||
        /\brm\b/.test(command);

    const sent = await page.evaluate(async ({ value, prefersApp }) => {
        const w = window as typeof window & {
            __pwDispatchTerminalInput?: (command: string) => boolean;
            __pwDispatchTerminalInputThroughApp?: (command: string) => Promise<boolean>;
            __pwSyncTerminalInputThroughApp?: (command: string) => Promise<boolean>;
            __pwForceTerminalWorkspaceSync?: () => Promise<boolean>;
        };

        if (w.__pwDispatchTerminalInput) {
            const dispatched = w.__pwDispatchTerminalInput(value);
            if (!dispatched) return false;

            if (prefersApp) {
                if (w.__pwSyncTerminalInputThroughApp) {
                    await w.__pwSyncTerminalInputThroughApp(value);
                }
                if (w.__pwForceTerminalWorkspaceSync) {
                    return await w.__pwForceTerminalWorkspaceSync();
                }
            }

            return true;
        }

        if (w.__pwDispatchTerminalInputThroughApp) {
            return await w.__pwDispatchTerminalInputThroughApp(value);
        }

        return false;
    }, { value: command, prefersApp: prefersAppDispatch });

    expect(sent).toBe(true);
}

async function terminalTranscript(page: Page) {
    return (await page.getByTestId("interactive-terminal-transcript").textContent()) ?? "";
}

async function expectTerminalContains(page: Page, text: string) {
    await expect
        .poll(async () => await terminalTranscript(page), {
            timeout: 15_000,
        })
        .toContain(text);
}

async function expectExplorerHasPath(page: Page, path: string) {
    const parts = path.split("/").filter(Boolean);
    const prefixes = parts.map((_, index) => parts.slice(0, index + 1).join("/"));

    for (let i = 0; i < prefixes.length - 1; i += 1) {
        const current = prefixes[i]!;
        const next = prefixes[i + 1]!;

        if (await explorerPathLocator(page, next).isVisible().catch(() => false)) {
            continue;
        }

        const currentLocator = explorerPathLocator(page, current);
        if (await currentLocator.count()) {
            await currentLocator.click();
        }
    }

    await expect(explorerPathLocator(page, path)).toBeVisible();
}

async function expectExplorerNotHasPath(page: Page, path: string) {
    await expect(explorerPathLocator(page, path)).toHaveCount(0);
}

async function mockCodeRunCount(page: Page) {
    return await page.evaluate(() => {
        const raw = window.localStorage.getItem("__pw_fullide_terminal_workspace_sync_v1");
        if (!raw) return 0;
        return Number(JSON.parse(raw)?.metrics?.codeRuns ?? 0);
    });
}

async function setEditorCode(page: Page, value: string) {
    await page.getByTestId("code-editor-e2e-input").fill(value);
}

async function currentEditorCode(page: Page) {
    return await page.getByTestId("code-editor-e2e-input").inputValue();
}

async function lastRunRequest(page: Page) {
    return await page.evaluate(() => {
        const raw = window.localStorage.getItem("__pw_fullide_terminal_workspace_sync_v1");
        if (!raw) return null;
        return JSON.parse(raw)?.lastRunRequest ?? null;
    });
}

test.describe("FullIDE terminal/workspace sync regressions", () => {
    test.describe.configure({
        mode: "serial",
    });

    test.beforeEach(async ({ page }) => {
        await installMockTerminalBackend(page);
    });

    test("Python sandbox preserves one src folder", async ({ page }) => {
        test.setTimeout(180_000);
        await page.goto(PYTHON_SANDBOX_URL, { timeout: 120_000 });
        await waitForFullIDE(page, "src/main.py");

        await expect(page.locator('[data-node-path="src"][data-node-kind="folder"]')).toHaveCount(1);
        await expectExplorerNotHasPath(page, "src/src");

        await sendTerminal(page, "pwd");
        await expectTerminalContains(page, "/workspace");

        await sendTerminal(page, "ls");
        await expectTerminalContains(page, "src");

        await sendTerminal(page, "ls src");
        await expectTerminalContains(page, "main.py");

        await expectTerminalContains(page, "$ ");
        await expectExplorerNotHasPath(page, ".bash_history");
    });

    test("Terminal-created file syncs into existing src without double src", async ({ page }) => {
        test.setTimeout(180_000);
        await page.goto(PYTHON_SANDBOX_URL, { timeout: 120_000 });
        await waitForFullIDE(page, "src/main.py");

        await sendTerminal(
            page,
            `cat > src/helper.py <<'PY'
print("helper")
PY
`,
        );

        await expectExplorerHasPath(page, "src/helper.py");
        await expectExplorerNotHasPath(page, "src/src/helper.py");
        await expectExplorerNotHasPath(page, ".bash_history");
    });

    test("Browser refresh preserves command history but hides .bash_history", async ({ page }) => {
        test.setTimeout(180_000);
        await page.goto(PYTHON_SANDBOX_URL, { timeout: 120_000 });
        await waitForFullIDE(page, "src/main.py");

        await sendTerminal(page, "echo HISTORY_TEST_MARKER");
        await expectTerminalContains(page, "HISTORY_TEST_MARKER");

        await sendTerminal(page, "history");
        await expectTerminalContains(page, "HISTORY_TEST_MARKER");

        await page.reload();
        await waitForFullIDE(page, "src/main.py");

        await sendTerminal(page, "history");
        await expectTerminalContains(page, "HISTORY_TEST_MARKER");
        await expectExplorerNotHasPath(page, ".bash_history");
    });

    test("Terminal is non-root", async ({ page }) => {
        test.setTimeout(180_000);
        await page.goto(PYTHON_SANDBOX_URL, { timeout: 120_000 });
        await waitForFullIDE(page, "src/main.py");

        await sendTerminal(page, "whoami");
        await expectTerminalContains(page, "sandbox");

        const transcript = await terminalTranscript(page);
        expect(transcript).not.toContain("\nroot\n");
        expect(transcript.trimEnd()).not.toMatch(/#$/);
    });

    test("C++ build directory is writable", async ({ page }) => {
        test.setTimeout(180_000);
        await page.goto(CPP_SANDBOX_URL, { timeout: 120_000 });
        await waitForFullIDE(page, "src/main.cpp");

        await sendTerminal(page, "mkdir -p build && echo ok > build/test.txt && cat build/test.txt");
        await expectTerminalContains(page, "ok");

        await page.getByTestId("code-runner-run-button").click();

        await expect
            .poll(async () => await mockCodeRunCount(page), {
                timeout: 10_000,
            })
            .toBeGreaterThan(0);

        await expect(page.getByText("Permission denied: '/workspace/build'")).toHaveCount(0);
    });

    test("C++ immediate run keeps edited main.cpp content after the run finishes", async ({
        page,
    }) => {
        test.setTimeout(180_000);
        await page.goto(CPP_SANDBOX_URL, { timeout: 120_000 });
        await waitForFullIDE(page, "src/main.cpp");

        const editedCode = `#include <iostream>
int main() {
    std::cout << "line 1\\n";
    std::cout << "line 2\\n";
    return 0;
}
`;

        await setEditorCode(page, editedCode);
        await page.getByTestId("code-runner-run-button").click();

        await expect
            .poll(async () => await mockCodeRunCount(page), {
                timeout: 10_000,
            })
            .toBeGreaterThan(0);

        await expect
            .poll(async () => await currentEditorCode(page), {
                timeout: 10_000,
            })
            .toBe(editedCode);
    });

    test("C++ repeated runs do not alternate the editor back to stale content", async ({
        page,
    }) => {
        test.setTimeout(180_000);
        await page.goto(CPP_SANDBOX_URL, { timeout: 120_000 });
        await waitForFullIDE(page, "src/main.cpp");

        const editedCode = `#include <iostream>
int main() {
    std::cout << "fresh a\\n";
    std::cout << "fresh b\\n";
    return 0;
}
`;

        await setEditorCode(page, editedCode);
        await page.getByTestId("code-runner-run-button").click();
        await expect
            .poll(async () => await currentEditorCode(page), {
                timeout: 10_000,
            })
            .toBe(editedCode);

        await page.getByTestId("code-runner-run-button").click();
        await expect
            .poll(async () => await currentEditorCode(page), {
                timeout: 10_000,
            })
            .toBe(editedCode);
    });

    test("C++ multi-file run serializes the latest active editor content", async ({ page }) => {
        test.setTimeout(180_000);
        await page.goto(CPP_SANDBOX_URL, { timeout: 120_000 });
        await waitForFullIDE(page, "src/main.cpp");

        await sendTerminal(
            page,
            `cat > src/helper.txt <<'TXT'
helper
TXT
`,
        );
        await expectExplorerHasPath(page, "src/helper.txt");

        const editedCode = `#include <iostream>
int main() {
    std::cout << "serialized latest\\n";
    return 0;
}
`;

        await setEditorCode(page, editedCode);
        await page.getByTestId("code-runner-run-button").click();

        await expect
            .poll(async () => {
                const request = await lastRunRequest(page);
                const files = Array.isArray(request?.files) ? request.files : [];
                const mainFile = files.find((entry: any) =>
                    String(entry?.path ?? "").endsWith("main.cpp"),
                );
                return mainFile?.content ?? null;
            }, { timeout: 10_000 })
            .toBe(editedCode);
    });
});
