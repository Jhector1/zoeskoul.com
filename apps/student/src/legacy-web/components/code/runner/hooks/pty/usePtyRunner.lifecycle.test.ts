import { describe, expect, it, vi } from "vitest";

import {
    canStartPtyRun,
    isFinalPtySessionState,
    resolveAuthoritativeInteractiveStart,
    resolvePtyRunCode,
    resolvePtySnapshotMergeMeta,
    shouldConsumePtyEventStream,
    startPtyRunExactlyOnce,
} from "./usePtyRunner";

describe("isFinalPtySessionState", () => {
    it("recognizes every backend terminal state that must release the Run button", () => {
        expect(isFinalPtySessionState("completed")).toBe(true);
        expect(isFinalPtySessionState("failed")).toBe(true);
        expect(isFinalPtySessionState("canceled")).toBe(true);
        expect(isFinalPtySessionState("timed_out")).toBe(true);
    });

    it("does not finalize active or input-waiting sessions", () => {
        expect(isFinalPtySessionState("queued")).toBe(false);
        expect(isFinalPtySessionState("preparing")).toBe(false);
        expect(isFinalPtySessionState("running")).toBe(false);
        expect(isFinalPtySessionState("waiting_for_input")).toBe(false);
    });
});

describe("authoritative PTY rerun start lifecycle", () => {
    it("classifies explicit start failure as authoritative failure", () => {
        expect(
            resolveAuthoritativeInteractiveStart({
                ok: false,
                error: "Runner start failed.",
            }),
        ).toEqual({
            kind: "failed",
            error: "Runner start failed.",
        });
    });

    it("does not create a second start when authoritative onRun fails", async () => {
        const onRun = vi.fn(async () => ({
            ok: false,
            error: "Runner start failed once.",
        })) as any;
        const fallbackStart = vi.fn(async () => "fallback-session");
        const connect = vi.fn();

        await expect(
            startPtyRunExactlyOnce({
                onRun,
                runArgs: {
                    language: "python",
                    code: "print('hello')",
                    stdin: "",
                } as any,
                fallbackStart,
                connect,
            }),
        ).rejects.toThrow("Runner start failed once.");

        expect(onRun).toHaveBeenCalledTimes(1);
        expect(fallbackStart).not.toHaveBeenCalled();
        expect(connect).not.toHaveBeenCalled();
    });

    it("connects the one authoritative session without fallback", async () => {
        const started = {
            ok: true,
            sessionId: "pty-session-1",
            state: "preparing",
            wsUrl: "ws://runner.example/sessions/pty-session-1/ws",
        } as const;
        const onRun = vi.fn(async () => started) as any;
        const fallbackStart = vi.fn(async () => "fallback-session");
        const connect = vi.fn();

        await startPtyRunExactlyOnce({
            onRun,
            runArgs: {
                language: "python",
                code: "print('hello')",
                stdin: "",
            } as any,
            fallbackStart,
            connect,
        });

        expect(onRun).toHaveBeenCalledTimes(1);
        expect(fallbackStart).not.toHaveBeenCalled();
        expect(connect).toHaveBeenCalledTimes(1);
        expect(connect).toHaveBeenCalledWith(started);
    });

    it("uses fallback only when no authoritative onRun exists", async () => {
        const fallbackStart = vi.fn(async () => "fallback-session");

        await startPtyRunExactlyOnce({
            runArgs: {
                language: "python",
                code: "print('hello')",
                stdin: "",
            } as any,
            fallbackStart,
            connect: vi.fn(),
        });

        expect(fallbackStart).toHaveBeenCalledTimes(1);
    });

    it("does not start fallback when Stop already aborted Preparing", async () => {
        const controller = new AbortController();
        controller.abort();
        const fallbackStart = vi.fn(async () => "fallback-session");

        await startPtyRunExactlyOnce({
            signal: controller.signal,
            runArgs: {
                language: "python",
                code: "print('hello')",
                stdin: "",
                signal: controller.signal,
            } as any,
            fallbackStart,
            connect: vi.fn(),
        });

        expect(fallbackStart).not.toHaveBeenCalled();
    });

    it("does not reconnect an authoritative response after Stop wins", async () => {
        const controller = new AbortController();
        const started = {
            ok: true,
            sessionId: "stale-session",
            state: "preparing",
            wsUrl: "ws://runner.example/sessions/stale-session/ws",
        } as const;
        const onRun = vi.fn(async () => {
            controller.abort();
            return started;
        }) as any;
        const connect = vi.fn();

        await startPtyRunExactlyOnce({
            onRun,
            signal: controller.signal,
            runArgs: {
                language: "python",
                code: "print('hello')",
                stdin: "",
                signal: controller.signal,
            } as any,
            fallbackStart: vi.fn(async () => "fallback-session"),
            connect,
        });

        expect(onRun).toHaveBeenCalledTimes(1);
        expect(connect).not.toHaveBeenCalled();
    });
});

describe("PTY rerun authoritative UI/code/snapshot lifecycle", () => {
    it("accepts the click whenever the visible state is Run", () => {
        expect(
            canStartPtyRun({
                disabled: false,
                allowRun: true,
                runState: "idle",
                startRequestInFlight: false,
            }),
        ).toBe(true);

        expect(
            canStartPtyRun({
                disabled: false,
                allowRun: true,
                runState: "running",
                startRequestInFlight: false,
            }),
        ).toBe(false);

        expect(
            canStartPtyRun({
                disabled: false,
                allowRun: true,
                runState: "idle",
                startRequestInFlight: true,
            }),
        ).toBe(false);
    });

    it("uses live editor code instead of a stale workspace render", () => {
        expect(
            resolvePtyRunCode({
                liveCode: 'print("new")',
                workspaceCode: 'print("old")',
                fallbackCode: 'print("older")',
            }),
        ).toBe('print("new")');
    });

    it("marks edits and deletions after a run baseline as UI-authoritative", () => {
        const baseline = [
            {
                kind: "file" as const,
                path: "src/main.py",
                content: 'print("old")',
            },
            {
                kind: "file" as const,
                path: "src/deleted.py",
                content: 'print("delete me")',
            },
        ];
        const current = [
            {
                kind: "file" as const,
                path: "src/main.py",
                content: 'print("new")',
            },
        ];

        const meta = resolvePtySnapshotMergeMeta({
            current,
            baseline,
        });

        expect(meta.dirtyUiPaths.has("src/main.py")).toBe(true);
        expect(meta.dirtyUiPaths.has("src/deleted.py")).toBe(true);
        expect(meta.baselinePaths.has("src/main.py")).toBe(true);
        expect(meta.baselinePaths.has("src/deleted.py")).toBe(true);
    });

    it("rejects event replay from the previous backend session", () => {
        expect(
            shouldConsumePtyEventStream({
                sessionId: "session-new",
                eventsSessionId: "session-old",
            }),
        ).toBe(false);

        expect(
            shouldConsumePtyEventStream({
                sessionId: "session-new",
                eventsSessionId: "session-new",
            }),
        ).toBe(true);
    });
});
