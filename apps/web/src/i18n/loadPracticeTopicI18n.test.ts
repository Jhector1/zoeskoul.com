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


    it("loads the exact catalog course root before legacy subjects with the same topic basename", async () => {
        const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "practice-i18n-sql-v2-"));
        const messagesRoot = path.join(tmpRoot, "src", "i18n", "messages", "en");
        const legacyTopicFile = path.join(
            messagesRoot,
            "subjects",
            "sql",
            "sql",
            "module0",
            "database_thinking.json",
        );
        const sqlV2TopicFile = path.join(
            messagesRoot,
            "subjects",
            "sql",
            "sql-v2",
            "module0",
            "database_thinking.json",
        );

        await fs.mkdir(path.dirname(legacyTopicFile), { recursive: true });
        await fs.mkdir(path.dirname(sqlV2TopicFile), { recursive: true });
        await fs.writeFile(path.join(messagesRoot, "common.json"), JSON.stringify({}, null, 2));
        await fs.writeFile(
            legacyTopicFile,
            JSON.stringify(
                {
                    topics: {
                        sql: {
                            "sql-0": {
                                database_thinking: {
                                    practice: {
                                        duplicate: {
                                            starterCode: "-- legacy sql starter\n",
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
        await fs.writeFile(
            sqlV2TopicFile,
            JSON.stringify(
                {
                    topics: {
                        "sql-v2": {
                            "sql-v2-0": {
                                database_thinking: {
                                    practice: {
                                        duplicate: {
                                            starterCode: "-- sql-v2 starter\n",
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
            subjectSlug: "sql-v2",
            moduleSlug: "sql-v2-0",
            topicSlug: "database_thinking",
        });

        expect(result.quiz?.duplicate?.starterCode).toBe("-- sql-v2 starter\n");
    });
});
