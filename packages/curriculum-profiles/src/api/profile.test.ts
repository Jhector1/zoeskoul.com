import { describe, expect, it } from "vitest";
import { apiProfile, apiProfileAdapter } from "./index.js";

type ApiCodeInputCapability = NonNullable<typeof apiProfile.codeInput>;
type RepairDraftArgs = Parameters<
    NonNullable<ApiCodeInputCapability["repairDraft"]>
>[0];
type BuildManifestArgs = Parameters<
    NonNullable<ApiCodeInputCapability["buildManifest"]>
>[0];

describe("api curriculum profile", () => {
    it("owns Node.js terminal-first runtime defaults", () => {
        expect(apiProfile.id).toBe("api");
        expect(apiProfile.defaultLanguage).toBe("javascript");
        expect(apiProfile.defaultEntryFileName).toBe("server.js");

        expect(apiProfile.buildModuleRuntimeDefaults()).toMatchObject({
            kind: "code",
            language: "javascript",
            supportsTerminal: true,
            supportsMultiFile: true,
            supportsFileSystem: true,
            supportsPackageInstall: false,
        });

        expect(apiProfile.buildModuleServiceDefaults?.()).toMatchObject({
            preset: "runner",
            runnerBackend: "pty",
            layoutMode: "terminal_workspace",
        });
    });

    it("has a distinct registered adapter identity", () => {
        expect(apiProfileAdapter.id).toBe("api");
    });

    it("repairs code input toward JavaScript source checks", () => {
        const repaired = apiProfile.codeInput?.repairDraft?.({
            exercise: {
                id: "api-test",
                kind: "code_input",
                title: "Create a route",
                prompt: "Create GET /api/events.",
                fixedLanguage: "web",
                recipeType: "fixed_tests",
            } as RepairDraftArgs["exercise"],
            seed: {} as RepairDraftArgs["seed"],
        });

        expect(repaired).toMatchObject({
            fixedLanguage: "javascript",
            recipeType: "source_checks",
            entryFilePath: "server.js",
        });
    });

    it("keeps authored output examples on source-check manifests", () => {
        const manifest = apiProfile.codeInput!.buildManifest({
            exercise: {
                id: "api-output",
                kind: "code_input",
                title: "Create a response",
                prompt: "Log a response.",
                hint: "Use status 200.",
                help: {
                    concept: "Responses carry a status.",
                    hint_1: "Create an object.",
                    hint_2: "Log the object.",
                },
                starterCode: "const response = {};\n",
                solutionCode: "console.log({ status: 200 });\n",
                fixedLanguage: "javascript",
                entryFilePath: "main.js",
                sourceChecks: [
                    {
                        type: "source_regex",
                        pattern: "status\\s*:\\s*200",
                        message: "Use status 200.",
                    },
                ],
                tests: [
                    {
                        stdout: "{ status: 200 }\n",
                        match: "exact",
                    },
                ],
                recipeType: "source_checks",
            } as BuildManifestArgs["exercise"],
            seed: {
                topicId: "api-output",
            } as BuildManifestArgs["seed"],
            messageBase: "topics.api_output.quiz.api_output",
        });

        expect(manifest.showExpectedExample).toBe(true);
        expect(manifest.recipe).toMatchObject({
            type: "source_checks",
            tests: [
                {
                    stdout: "{ status: 200 }\n",
                    match: "exact",
                },
            ],
        });
    });
});
