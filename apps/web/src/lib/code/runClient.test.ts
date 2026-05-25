import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runViaApi } from "./runClient";
import type { RunReq } from "./types";

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "Content-Type": "application/json",
        },
    });
}

describe("runViaApi", () => {
    const req: RunReq = {
        language: "python",
        code: "print('hello')",
    };

    beforeEach(() => {
        vi.unstubAllGlobals();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("posts to /api/run/judge0 and polls /api/run/judge0/[token] for queued runs", async () => {
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);

            if (url === "/api/run/judge0") {
                expect(init?.method).toBe("POST");
                return jsonResponse({
                    ok: true,
                    mode: "queued",
                    token: "queued-token",
                });
            }

            if (url === "/api/run/judge0/queued-token") {
                expect(init?.method).toBe("GET");
                return jsonResponse({
                    ok: true,
                    done: true,
                    status: "Accepted",
                    stdout: "hello\n",
                    stderr: "",
                });
            }

            throw new Error(`Unexpected fetch URL: ${url}`);
        });

        vi.stubGlobal("fetch", fetchMock);

        const result = await runViaApi(req);

        expect(result).toMatchObject({
            ok: true,
            status: "Accepted",
            stdout: "hello\n",
        });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            "/api/run/judge0",
            expect.objectContaining({
                method: "POST",
            }),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            "/api/run/judge0/queued-token",
            expect.objectContaining({
                method: "GET",
            }),
        );

        const calledUrls = fetchMock.mock.calls.map(([input]) => String(input));
        expect(calledUrls).not.toContain("/api/review/queued-token");
    });

    it("returns immediate results without polling", async () => {
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            expect(url).toBe("/api/run/judge0");
            return jsonResponse({
                ok: true,
                mode: "immediate",
                result: {
                    ok: true,
                    status: "Accepted",
                    stdout: "done\n",
                },
            });
        });

        vi.stubGlobal("fetch", fetchMock);

        const result = await runViaApi(req);

        expect(result).toMatchObject({
            ok: true,
            status: "Accepted",
            stdout: "done\n",
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
