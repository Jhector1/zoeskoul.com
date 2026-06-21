import { expect, type Page } from "@playwright/test";

export async function installMockTerminalWorkspaceBackend(page: Page) {
    await page.addInitScript(() => {
        const STORAGE_KEY = "__pw_terminal_workspace_smoke_v1";
        const originalFetch = window.fetch.bind(window);

        type MockEntry =
            | { kind?: "file"; path: string; content: string }
            | { kind: "directory"; path: string };

        type MockWorkspace = {
            entries: Record<string, MockEntry>;
        };

        type MockSession = {
            id: string;
            scope: string;
            workspaceKey: string;
            closed?: boolean;
            seq: number;
            prompt: string;
        };

        type MockState = {
            nextSessionId: number;
            sessions: Record<string, MockSession>;
            workspaces: Record<string, MockWorkspace>;
            metrics: {
                ensureCalls: number;
                reusedEnsureCalls: number;
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
                    ensureCalls: 0,
                    reusedEnsureCalls: 0,
                },
            };
        }

        function saveState(state: MockState) {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        }

        function currentScope() {
            return window.location.pathname;
        }

        function currentWorkspaceKey() {
            return `scope:${currentScope()}`;
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
                const entries: Array<MockEntry | null> = payload.map((entry: any) => {
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

        function nextSeq(session: MockSession) {
            session.seq += 1;
            return session.seq;
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
            onopen: ((event: Event) => void) | null = null;
            onmessage: ((event: MessageEvent) => void) | null = null;
            onerror: ((event: Event) => void) | null = null;
            onclose: ((event: CloseEvent) => void) | null = null;

            constructor(url: string) {
                this.url = url;

                setTimeout(() => {
                    const sessionId = new URL(url, window.location.origin).searchParams.get("sessionId") ?? "";
                    const state = loadState();
                    const session = state.sessions[sessionId];

                    this.readyState = MockWebSocket.OPEN;
                    this.onopen?.(new Event("open"));

                    this.emit({
                        type: "ready",
                        sessionId,
                        state: "running",
                    });

                    this.emit({
                        type: "event",
                        event: {
                            type: "status",
                            state: "running",
                            seq: nextSeq(session),
                            ts: new Date().toISOString(),
                        },
                    });
                }, 10);
            }

            emit(payload: unknown) {
                this.onmessage?.(
                    new MessageEvent("message", {
                        data: JSON.stringify(payload),
                    }),
                );
            }

            send(data: string) {
                const payload = JSON.parse(String(data ?? "{}")) as {
                    type?: string;
                    input?: string;
                };
                const sessionId = new URL(this.url, window.location.origin).searchParams.get("sessionId") ?? "";
                const state = loadState();
                const session = state.sessions[sessionId];
                if (!session) return;

                if (payload.type === "cancel") {
                    session.closed = true;
                    saveState(state);
                    this.close();
                    return;
                }

                if (payload.type !== "input") return;

                const command = String(payload.input ?? "").trim();
                if (!command) return;

                for (const segment of command.split("&&").map((part) => part.trim()).filter(Boolean)) {
                    const mkdirMatch = segment.match(/^mkdir(?:\s+-p)?\s+(.+)$/);
                    if (mkdirMatch) {
                        for (const part of String(mkdirMatch[1] ?? "").split(/\s+/).filter(Boolean)) {
                            const pieces = normalizePath(part).split("/").filter(Boolean);
                            for (let i = 1; i <= pieces.length; i += 1) {
                                ensureDirectory(state, session.scope, pieces.slice(0, i).join("/"));
                            }
                        }
                        continue;
                    }

                    const touchMatch = segment.match(/^touch\s+(.+)$/);
                    if (touchMatch) {
                        for (const part of String(touchMatch[1] ?? "").split(/\s+/).filter(Boolean)) {
                            const normalized = normalizePath(part);
                            const folder = normalized.split("/").slice(0, -1).join("/");
                            if (folder) {
                                const pieces = folder.split("/").filter(Boolean);
                                for (let i = 1; i <= pieces.length; i += 1) {
                                    ensureDirectory(state, session.scope, pieces.slice(0, i).join("/"));
                                }
                            }
                            writeFile(state, session.scope, normalized, "");
                        }
                    }
                }

                saveState(state);

                this.emit({
                    type: "event",
                    event: {
                        type: "stdout",
                        chunk: `${command}\r\n`,
                        seq: nextSeq(session),
                        ts: new Date().toISOString(),
                    },
                });
            }

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

        window.fetch = async (input, init) => {
            const url =
                typeof input === "string"
                    ? input
                    : input instanceof Request
                      ? input.url
                      : String(input);
            const method = String(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();

            if (
                url.includes("/api/run/pty/sessions") &&
                method === "POST" &&
                (/\/api\/run\/pty\/sessions$/.test(url) || /\/api\/run\/pty\/sessions\/ensure$/.test(url))
            ) {
                const rawBody =
                    typeof init?.body === "string"
                        ? init.body
                          : input instanceof Request
                          ? await input.text()
                          : "{}";
                const body = JSON.parse(rawBody || "{}");
                const state = loadState();
                const workspaceKey =
                    typeof body?.workspaceKey === "string" && body.workspaceKey.trim()
                        ? body.workspaceKey.trim()
                        : currentWorkspaceKey();
                const scope = workspaceKey;

                state.metrics.ensureCalls += 1;

                const reusableSession = Object.values(state.sessions).find(
                    (session) => session.workspaceKey === workspaceKey && session.closed !== true,
                );

                if (reusableSession) {
                    state.metrics.reusedEnsureCalls += 1;

                    if (Array.isArray(body?.files) || (body?.files && typeof body.files === "object")) {
                        replaceWorkspaceEntries(state, scope, listEntriesFromPayload(body.files));
                    }

                    saveState(state);

                    return createResponse({
                        ok: true,
                        reused: true,
                        sessionId: reusableSession.id,
                        state: "running",
                        wsUrl: `ws://mock-terminal?sessionId=${encodeURIComponent(reusableSession.id)}`,
                    });
                }

                const sessionId = `mock-session-${state.nextSessionId++}`;

                state.sessions[sessionId] = {
                    id: sessionId,
                    scope,
                    workspaceKey,
                    seq: 0,
                    prompt: "$ ",
                };

                if (Array.isArray(body?.files) || (body?.files && typeof body.files === "object")) {
                    replaceWorkspaceEntries(state, scope, listEntriesFromPayload(body.files));
                }

                saveState(state);

                return createResponse({
                    ok: true,
                    reused: false,
                    sessionId,
                    state: "running",
                    wsUrl: `ws://mock-terminal?sessionId=${encodeURIComponent(sessionId)}`,
                });
            }

            const cancelMatch = url.match(/\/api\/run\/pty\/sessions\/([^/]+)\/cancel$/);
            if (cancelMatch && method === "POST") {
                const sessionId = cancelMatch[1] ?? "";
                const state = loadState();
                if (state.sessions[sessionId]) {
                    state.sessions[sessionId]!.closed = true;
                }
                saveState(state);
                return createResponse({ ok: true });
            }

            const replaceMatch = url.match(/\/api\/run\/pty\/sessions\/([^/]+)\/workspace\/replace$/);
            if (replaceMatch && method === "POST") {
                const rawBody =
                    typeof init?.body === "string"
                        ? init.body
                        : input instanceof Request
                          ? await input.text()
                          : "{}";
                const body = JSON.parse(rawBody || "{}");
                const sessionId = replaceMatch[1] ?? "";
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
            if (snapshotMatch && method === "POST") {
                const sessionId = snapshotMatch[1] ?? "";
                const state = loadState();
                const session = state.sessions[sessionId];
                const scope = session?.scope ?? currentScope();

                return createResponse({
                    ok: true,
                    files: workspaceEntriesForSnapshot(state, scope),
                });
            }

            return originalFetch(input as any, init);
        };

        // @ts-expect-error Playwright browser override
        window.WebSocket = MockWebSocket;
    });
}

export function explorerPathLocator(page: Page, path: string) {
    return page.locator(`[data-node-path="${path}"]`);
}

export async function expectExplorerHasPath(page: Page, path: string) {
    await expect(explorerPathLocator(page, path)).toBeVisible({
        timeout: 15_000,
    });
}

async function terminalTranscript(page: Page) {
    return (await page.getByTestId("interactive-terminal-transcript").textContent()) ?? "";
}

export async function expectTerminalVisible(page: Page) {
    await expect(page.getByTestId("interactive-terminal")).toBeVisible({
        timeout: 30_000,
    });
}

export async function expectTerminalContains(page: Page, text: string) {
    await expect
        .poll(async () => await terminalTranscript(page), {
            timeout: 15_000,
        })
        .toContain(text);
}


async function forceTerminalWorkspaceSyncForE2E(page: Page) {
    /**
     * Sending input through xterm only means the command reached the PTY. The
     * shell can create/remove files shortly after that. Before returning from
     * sendTerminal, force the same terminal workspace sync path used by Check.
     */
    await page.waitForTimeout(200);

    await page
        .evaluate(async () => {
            const win = window as typeof window & {
                __pwForceTerminalWorkspaceSync?: () => Promise<boolean>;
                __zoeFlushAnyTerminalBeforeSubmit?: () => Promise<boolean | void>;
            };

            for (let i = 0; i < 5; i += 1) {
                const forced =
                    typeof win.__pwForceTerminalWorkspaceSync === "function"
                        ? await win.__pwForceTerminalWorkspaceSync()
                        : false;

                if (typeof win.__zoeFlushAnyTerminalBeforeSubmit === "function") {
                    await win.__zoeFlushAnyTerminalBeforeSubmit();
                }

                if (forced) return true;
                await new Promise((resolve) => window.setTimeout(resolve, 150));
            }

            return false;
        })
        .catch(() => false);
}

export async function sendTerminal(page: Page, command: string) {
    await expectTerminalVisible(page);

    const sentThroughHook = await page
        .evaluate(async (rawCommand) => {
            const win = window as typeof window & {
                __pwDispatchTerminalInputThroughApp?: (data: string) => Promise<boolean>;
            };

            const send = win.__pwDispatchTerminalInputThroughApp;
            if (typeof send !== "function") return false;

            const normalized = String(rawCommand ?? "").replace(/\r?\n/g, "\r");
            const data = normalized.endsWith("\r") ? normalized : `${normalized}\r`;
            return send(data);
        }, command)
        .catch(() => false);

    if (sentThroughHook) {
        await forceTerminalWorkspaceSyncForE2E(page);
        return;
    }

    await page.getByTestId("interactive-terminal").click({ force: true });
    await page.keyboard.insertText(command);

    if (!command.endsWith("\n")) {
        await page.keyboard.press("Enter");
    }

    await forceTerminalWorkspaceSyncForE2E(page);
}

export async function readMockTerminalWorkspaceMetrics(page: Page) {
    return await page.evaluate(() => {
        const raw = window.localStorage.getItem("__pw_terminal_workspace_smoke_v1");
        if (!raw) {
            return {
                ensureCalls: 0,
                reusedEnsureCalls: 0,
                sessionIds: [] as string[],
            };
        }

        const state = JSON.parse(raw) as {
            sessions?: Record<string, unknown>;
            metrics?: {
                ensureCalls?: number;
                reusedEnsureCalls?: number;
            };
        };

        return {
            ensureCalls: Number(state.metrics?.ensureCalls ?? 0),
            reusedEnsureCalls: Number(state.metrics?.reusedEnsureCalls ?? 0),
            sessionIds: Object.keys(state.sessions ?? {}),
        };
    });
}
