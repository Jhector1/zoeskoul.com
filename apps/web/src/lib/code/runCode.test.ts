import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
    createJudge0SubmissionMock,
    zipProjectMock,
} = vi.hoisted(() => ({
    createJudge0SubmissionMock: vi.fn(),
    zipProjectMock: vi.fn(),
}));

vi.mock("./judge0", () => ({
    createJudge0Submission: createJudge0SubmissionMock,
    getJudge0Submission: vi.fn(),
}));

vi.mock("./projectZip", () => ({
    zipProject: zipProjectMock,
}));

vi.mock("./langIds", () => ({
    getSingleFileLanguageId: vi.fn(() => 71),
}));

vi.mock("./sql/executeSql", () => ({
    executeSqlRun: vi.fn(),
}));

import { submitRun } from "./runCode";

describe("submitRun", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv("JUDGE0_URL", "http://judge0.test");
        createJudge0SubmissionMock.mockResolvedValue({
            ok: true,
            mode: "queued",
            token: "token-123",
        });
        zipProjectMock.mockResolvedValue("zip-b64");
    });

    it("forces enable_network to false for multi-file code runs", async () => {
        await submitRun({
            language: "python",
            entry: "main.py",
            files: [{ path: "main.py", content: "print('hello')" }],
            limits: {
                enable_network: true,
            },
        });

        expect(createJudge0SubmissionMock).toHaveBeenCalledTimes(1);
        expect(createJudge0SubmissionMock).toHaveBeenCalledWith(
            "http://judge0.test/submissions?base64_encoded=true",
            expect.objectContaining({
                language_id: 89,
                additional_files: "zip-b64",
                enable_network: false,
            }),
        );
    });



    it("forces enable_network to false for single-file code runs", async () => {
        await submitRun({
            language: "python",
            code: "print('hello')",
            limits: {
                enable_network: true,
            },
        });

        expect(createJudge0SubmissionMock).toHaveBeenCalledTimes(1);
        expect(createJudge0SubmissionMock).toHaveBeenCalledWith(
            "http://judge0.test/submissions?base64_encoded=true",
            expect.objectContaining({
                language_id: 71,
                source_code: expect.any(String),
                enable_network: false,
            }),
        );
    });

    it("still forces enable_network false when limits are omitted", async () => {
        await submitRun({
            language: "python",
            code: "print('hello')",
        });

        expect(createJudge0SubmissionMock).toHaveBeenCalledWith(
            "http://judge0.test/submissions?base64_encoded=true",
            expect.objectContaining({
                enable_network: false,
            }),
        );
    });
});
