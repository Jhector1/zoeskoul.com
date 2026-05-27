import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getJudge0Submission } from "./judge0";

function b64(value: unknown) {
    return Buffer.from(String(value ?? ""), "utf8").toString("base64");
}

function makeSnapshotMarker(entries: unknown[]) {
    return `__ZOE_WORKSPACE_SNAPSHOT_B64__${b64(JSON.stringify(entries))}__END_ZOE_WORKSPACE_SNAPSHOT_B64__`;
}

describe("Judge0 workspace snapshot parsing", () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        globalThis.fetch = vi.fn();
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    it("strips the hidden workspace marker from stdout and returns workspaceFiles", async () => {
        const marker = makeSnapshotMarker([
            {
                kind: "file",
                path: "main.py",
                content: "print('hello')\n",
            },
            {
                kind: "file",
                path: "output.txt",
                content: "Hello, World!",
            },
            {
                kind: "directory",
                path: "data",
            },
            {
                kind: "file",
                path: "data/result.csv",
                content: "name,score\nAlice,95\n",
            },
        ]);

        vi.mocked(globalThis.fetch).mockResolvedValue({
            ok: true,
            text: async () =>
                JSON.stringify({
                    token: "abc",
                    status: {
                        id: 3,
                        description: "Accepted",
                    },
                    stdout: b64(`visible stdout\n${marker}\n`),
                    stderr: null,
                    compile_output: null,
                    message: null,
                    time: "0.01",
                    memory: 1234,
                }),
        } as Response);

        const result = await getJudge0Submission(
            "https://judge0.example/submissions/abc?base64_encoded=true",
        );

        expect(result.ok).toBe(true);
        expect(result.done).toBe(true);
        expect(result.stdout).toBe("visible stdout");
        expect(result.workspaceFiles).toEqual([
            {
                kind: "file",
                path: "main.py",
                content: "print('hello')\n",
            },
            {
                kind: "file",
                path: "output.txt",
                content: "Hello, World!",
            },
            {
                kind: "directory",
                path: "data",
            },
            {
                kind: "file",
                path: "data/result.csv",
                content: "name,score\nAlice,95\n",
            },
        ]);
    });

    it("supports an empty workspace snapshot so deletes can sync", async () => {
        const marker = makeSnapshotMarker([]);

        vi.mocked(globalThis.fetch).mockResolvedValue({
            ok: true,
            text: async () =>
                JSON.stringify({
                    token: "abc",
                    status: {
                        id: 3,
                        description: "Accepted",
                    },
                    stdout: b64(marker),
                    stderr: null,
                    compile_output: null,
                    message: null,
                }),
        } as Response);

        const result = await getJudge0Submission(
            "https://judge0.example/submissions/abc?base64_encoded=true",
        );

        expect(result.ok).toBe(true);
        expect(result.stdout).toBe("");
        expect(result.workspaceFiles).toEqual([]);
    });

    it("ignores unsafe snapshot paths", async () => {
        const marker = makeSnapshotMarker([
            {
                kind: "file",
                path: "../secret.txt",
                content: "bad",
            },
            {
                kind: "file",
                path: "/absolute.txt",
                content: "bad",
            },
            {
                kind: "file",
                path: "safe.txt",
                content: "good",
            },
        ]);

        vi.mocked(globalThis.fetch).mockResolvedValue({
            ok: true,
            text: async () =>
                JSON.stringify({
                    token: "abc",
                    status: {
                        id: 3,
                        description: "Accepted",
                    },
                    stdout: b64(marker),
                }),
        } as Response);

        const result = await getJudge0Submission(
            "https://judge0.example/submissions/abc?base64_encoded=true",
        );

        expect(result.workspaceFiles).toEqual([
            {
                kind: "file",
                path: "safe.txt",
                content: "good",
            },
        ]);
    });

    it("leaves normal stdout alone when no marker exists", async () => {
        vi.mocked(globalThis.fetch).mockResolvedValue({
            ok: true,
            text: async () =>
                JSON.stringify({
                    token: "abc",
                    status: {
                        id: 3,
                        description: "Accepted",
                    },
                    stdout: b64("normal output\n"),
                }),
        } as Response);

        const result = await getJudge0Submission(
            "https://judge0.example/submissions/abc?base64_encoded=true",
        );

        expect(result.ok).toBe(true);
        expect(result.stdout).toBe("normal output\n");
        expect(result.workspaceFiles).toBeUndefined();
    });
});