import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("server-only", () => ({}));

describe("loadPracticeTopicI18n", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.resetModules();
    });

    it("preserves nested topic messages and exposes practice as legacy quiz data", async () => {
        const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "practice-i18n-"));
        const messagesRoot = path.join(tmpRoot, "src", "i18n", "messages", "en");
        const topicFile = path.join(
            messagesRoot,
            "subjects",
            "linux",
            "linux-terminal-fundamentals",
            "module1",
            "what-the-terminal-is.json",
        );

        await fs.mkdir(path.dirname(topicFile), { recursive: true });
        await fs.writeFile(
            path.join(messagesRoot, "common.json"),
            JSON.stringify({ terminalInputLabel: "input" }, null, 2),
        );
        await fs.writeFile(
            topicFile,
            JSON.stringify(
                {
                    topics: {
                        "linux-terminal-fundamentals": {
                            "linux-module-1-terminal-navigation": {
                                "what-the-terminal-is": {
                                    practice: {
                                        "fb-ls-purpose": {
                                            prompt: "Prompt text",
                                            template: "Run [blank1].",
                                            choices: ["pwd", "ls"],
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                null,
                2,
            ),
        );

        vi.spyOn(process, "cwd").mockReturnValue(tmpRoot);

        const { loadPracticeTopicI18n } = await import("./loadPracticeTopicI18n");
        const result = await loadPracticeTopicI18n({
            locale: "en",
            subjectSlug: "linux-terminal-fundamentals",
            moduleSlug: "linux-module-1-terminal-navigation",
            topicSlug: "what-the-terminal-is",
        });

        expect(
            result.topics?.["linux-terminal-fundamentals"]?.[
                "linux-module-1-terminal-navigation"
            ]?.["what-the-terminal-is"]?.practice?.["fb-ls-purpose"]?.prompt,
        ).toBe("Prompt text");
        expect(result.quiz?.["fb-ls-purpose"]?.template).toBe("Run [blank1].");
        expect(result.common?.terminalInputLabel).toBe("input");
    });
});
