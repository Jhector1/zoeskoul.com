import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createJudge0Submission, getJudge0Submission } from "./judge0";

describe("web Judge0 edge headers", () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        globalThis.fetch = vi.fn();
        vi.stubEnv("JUDGE0_EDGE_SECRET", "edge-secret");
        vi.stubEnv("JUDGE0_AUTHN_HEADER", "X-Judge0-Token");
        vi.stubEnv("JUDGE0_AUTHN_TOKEN", "direct-token");
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it("adds Caddy edge secret on submission", async () => {
        vi.mocked(globalThis.fetch).mockResolvedValue({
            ok: true,
            text: async () => JSON.stringify({ token: "abc" }),
        } as Response);

        await createJudge0Submission(
            "http://judge0.local/submissions?base64_encoded=true",
            { language_id: 89 },
        );

        expect(globalThis.fetch).toHaveBeenCalledWith(
            "http://judge0.local/submissions?base64_encoded=true",
            expect.objectContaining({
                method: "POST",
                headers: expect.objectContaining({
                    "Content-Type": "application/json",
                    "X-Judge0-Edge-Secret": "edge-secret",
                }),
            }),
        );
    });

    it("adds Caddy edge secret on polling", async () => {
        vi.mocked(globalThis.fetch).mockResolvedValue({
            ok: true,
            text: async () =>
                JSON.stringify({
                    token: "abc",
                    status: { id: 3, description: "Accepted" },
                    stdout: null,
                }),
        } as Response);

        await getJudge0Submission(
            "http://judge0.local/submissions/abc?base64_encoded=true",
        );

        expect(globalThis.fetch).toHaveBeenCalledWith(
            "http://judge0.local/submissions/abc?base64_encoded=true",
            expect.objectContaining({
                method: "GET",
                headers: expect.objectContaining({
                    "X-Judge0-Edge-Secret": "edge-secret",
                }),
            }),
        );
    });
});