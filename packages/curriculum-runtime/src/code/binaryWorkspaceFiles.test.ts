import { describe, expect, it } from "vitest";
import { validateCodeAgainstTests } from "./validateCodeAgainstTests.js";
import { isBinaryRunCodeFile, type RunCodeFiles } from "./runner.js";

describe("binary workspace files", () => {
    it("passes binary assets to the configured runner without converting them to text", async () => {
        const files: RunCodeFiles = [
            {
                path: "main.py",
                content: "print(\"ok\")\n",
            },
            {
                path: "assets/pixel.png",
                encoding: "base64",
                data: "iVBORw0KGgo=",
                mimeType: "image/png",
                sizeBytes: 8,
                checksum: "sha256:test",
            },
        ];

        let receivedFiles: RunCodeFiles | undefined;
        const result = await validateCodeAgainstTests({
            language: "python",
            solutionCode: "print(\"ok\")\n",
            files,
            tests: [{ stdout: "ok\n" }],
            runner: async ({ files: runnerFiles }) => {
                receivedFiles = runnerFiles;
                return {
                    ok: true,
                    stdout: "ok\n",
                    stderr: "",
                    exitCode: 0,
                };
            },
        });

        expect(result).toEqual({ ok: true });
        expect(Array.isArray(receivedFiles)).toBe(true);

        const binary = Array.isArray(receivedFiles)
            ? receivedFiles.find(isBinaryRunCodeFile)
            : undefined;

        expect(binary).toEqual({
            path: "assets/pixel.png",
            encoding: "base64",
            data: "iVBORw0KGgo=",
            mimeType: "image/png",
            sizeBytes: 8,
            checksum: "sha256:test",
        });
    });
});
