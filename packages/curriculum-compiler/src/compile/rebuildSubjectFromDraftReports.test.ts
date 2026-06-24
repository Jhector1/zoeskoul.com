import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const tempDirs: string[] = [];

vi.mock("@zoeskoul/curriculum-core", () => ({
    getDraftReportsRoot: (subjectSlug: string) =>
        path.join(tempDirs.at(-1) ?? os.tmpdir(), "reports", subjectSlug),
    getDraftTopicBundlePath: (
        subjectSlug: string,
        moduleDir: string,
        topicId: string,
    ) =>
        path.join(
            tempDirs.at(-1) ?? os.tmpdir(),
            "subjects",
            subjectSlug,
            "modules",
            moduleDir,
            "topics",
            topicId,
            "topic.bundle.json",
        ),
    getDraftTopicMessagesPath: (
        locale: string,
        subjectSlug: string,
        moduleDir: string,
        topicId: string,
    ) =>
        path.join(
            tempDirs.at(-1) ?? os.tmpdir(),
            "messages",
            locale,
            subjectSlug,
            moduleDir,
            `${topicId}.json`,
        ),
}));

afterEach(async () => {
    vi.resetModules();
    const dir = tempDirs.pop();

    if (dir) {
        await fs.rm(dir, { recursive: true, force: true });
    }
});

describe("readSavedDraftForRebuild", () => {
    async function makeTempDir() {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zoeskoul-rebuild-"));
        tempDirs.push(dir);
        return dir;
    }

    async function writeReportDraft(fileName: string, value: unknown) {
        const dir = await makeTempDir();
        const reportDir = path.join(
            dir,
            "reports",
            "test--course--draft",
            "module1",
            "topic-one",
        );
        await fs.mkdir(reportDir, { recursive: true });
        await fs.writeFile(
            path.join(reportDir, fileName),
            JSON.stringify(value, null, 2),
            "utf8",
        );
    }

    it("prefers repaired drafts over normalized and raw drafts", async () => {
        await writeReportDraft("raw-draft.json", { title: "Raw" });
        const reportDir = path.join(
            tempDirs.at(-1)!,
            "reports",
            "test--course--draft",
            "module1",
            "topic-one",
        );
        await fs.writeFile(
            path.join(reportDir, "normalized-draft.json"),
            JSON.stringify({ title: "Normalized" }),
            "utf8",
        );
        await fs.writeFile(
            path.join(reportDir, "repaired-draft.json"),
            JSON.stringify({ title: "Repaired" }),
            "utf8",
        );

        const { readSavedDraftForRebuild } = await import(
            "./savedDraftForRebuild.js"
        );

        await expect(
            readSavedDraftForRebuild({
                subjectSlug: "test--course--draft",
                moduleOrder: 1,
                topicId: "topic-one",
            }),
        ).resolves.toEqual({
            draft: { title: "Repaired" },
            source: "repaired-draft.json",
        });
    });

    it("falls back to normalized then raw drafts", async () => {
        await writeReportDraft("raw-draft.json", { title: "Raw" });
        const reportDir = path.join(
            tempDirs.at(-1)!,
            "reports",
            "test--course--draft",
            "module1",
            "topic-one",
        );
        await fs.writeFile(
            path.join(reportDir, "normalized-draft.json"),
            JSON.stringify({ title: "Normalized" }),
            "utf8",
        );

        const { readSavedDraftForRebuild } = await import(
            "./savedDraftForRebuild.js"
        );

        await expect(
            readSavedDraftForRebuild({
                subjectSlug: "test--course--draft",
                moduleOrder: 1,
                topicId: "topic-one",
            }),
        ).resolves.toEqual({
            draft: { title: "Normalized" },
            source: "normalized-draft.json",
        });
    });

    it("fails loudly when no saved draft exists", async () => {
        await makeTempDir();
        const { readSavedDraftForRebuild } = await import(
            "./savedDraftForRebuild.js"
        );

        await expect(
            readSavedDraftForRebuild({
                subjectSlug: "test--course--draft",
                moduleOrder: 1,
                topicId: "topic-one",
            }),
        ).rejects.toThrow(/Cannot rebuild topic "topic-one" from saved drafts/);
    });

    it("reads current draft output when manual draft artifacts are the source of truth", async () => {
        const dir = await makeTempDir();
        const bundlePath = path.join(
            dir,
            "subjects",
            "test--course--draft",
            "modules",
            "module1",
            "topics",
            "topic-one",
            "topic.bundle.json",
        );
        const messagesPath = path.join(
            dir,
            "messages",
            "en",
            "test--course--draft",
            "module1",
            "topic-one.json",
        );
        await fs.mkdir(path.dirname(bundlePath), { recursive: true });
        await fs.mkdir(path.dirname(messagesPath), { recursive: true });
        await fs.writeFile(
            bundlePath,
            JSON.stringify({ topicId: "topic-one", manual: true }),
            "utf8",
        );
        await fs.writeFile(
            messagesPath,
            JSON.stringify({ "topics.test.topic-one.label": "Manual" }),
            "utf8",
        );

        const { readCurrentDraftOutputForRebuild } = await import(
            "./savedDraftForRebuild.js"
        );

        await expect(
            readCurrentDraftOutputForRebuild({
                subjectSlug: "test--course--draft",
                moduleOrder: 1,
                topicId: "topic-one",
                sourceLocale: "en",
            }),
        ).resolves.toMatchObject({
            topicBundle: { topicId: "topic-one", manual: true },
            messagesByLocale: {
                en: { "topics.test.topic-one.label": "Manual" },
            },
            source: "current-draft-output",
            sourceBundlePath: bundlePath,
            sourceMessagesPaths: { en: messagesPath },
        });
    });

    it("fails loudly when current draft output is incomplete", async () => {
        await makeTempDir();
        const { readCurrentDraftOutputForRebuild } = await import(
            "./savedDraftForRebuild.js"
        );

        await expect(
            readCurrentDraftOutputForRebuild({
                subjectSlug: "test--course--draft",
                moduleOrder: 1,
                topicId: "topic-one",
                sourceLocale: "en",
            }),
        ).rejects.toThrow(/Cannot rebuild topic "topic-one" from current draft output/);
    });
});

describe("normalizeCurrentDraftOutputForSeed", () => {
    it("normalizes stale current-output identity fields and message keys to the resolved seed", async () => {
        const { normalizeCurrentDraftOutputForSeed } = await import(
            "./rebuildSubjectFromDraftReports.js"
        );

        const normalized = normalizeCurrentDraftOutputForSeed({
            seed: {
                subjectSlug: "linux--linux-terminal-fundamentals--draft",
                moduleSlug: "linux-module-1-terminal-navigation",
                sectionSlug: "linux-module-1-orientation",
                topicId: "what-the-terminal-is",
                modulePrefix: "linux_module_1",
                minutes: 22,
            } as unknown as ReturnType<
                typeof import("../seeds/buildTopicSeedFromPlanNode.js").buildTopicSeedFromPlanNode
            >,
            topicBundle: {
                topicId: "what-the-terminal-is",
                subjectSlug: "linux-terminal-fundamentals",
                moduleSlug: "linux-module-1-terminal-navigation",
                sectionSlug: "linux-terminal-fundamentals-linux-module-1-orientation",
                prefix: "linux_1",
                minutes: 18,
                topic: {
                    labelKey:
                        "topics.linux-terminal-fundamentals.linux-module-1-terminal-navigation.what-the-terminal-is.label",
                },
            } as never,
            messagesByLocale: {
                en: {
                    topics: {
                        "linux-terminal-fundamentals": {
                            "linux-module-1-terminal-navigation": {
                                "what-the-terminal-is": {
                                    label: "What the terminal is",
                                },
                            },
                        },
                    },
                    sketches: {
                        "linux-terminal-fundamentals": {
                            "linux-module-1-terminal-navigation": {
                                "what-the-terminal-is": {
                                    intro: "Use the terminal to talk to the computer.",
                                },
                            },
                        },
                    },
                },
            },
        });

        expect(normalized.topicBundle).toMatchObject({
            topicId: "what-the-terminal-is",
            subjectSlug: "linux--linux-terminal-fundamentals--draft",
            moduleSlug: "linux-module-1-terminal-navigation",
            sectionSlug:
                "linux--linux-terminal-fundamentals--draft-linux-module-1-orientation",
            prefix: "linux_module_1",
            minutes: 22,
        });
        expect(
            (normalized.topicBundle as { topic: { labelKey: string } }).topic.labelKey,
        ).toBe(
            "topics.linux--linux-terminal-fundamentals--draft.linux-module-1-terminal-navigation.what-the-terminal-is.label",
        );
        expect(normalized.messagesByLocale.en).toMatchObject({
            topics: {
                "linux--linux-terminal-fundamentals--draft": {
                    "linux-module-1-terminal-navigation": {
                        "what-the-terminal-is": {
                            label: "What the terminal is",
                        },
                    },
                },
            },
            sketches: {
                "linux--linux-terminal-fundamentals--draft": {
                    "linux-module-1-terminal-navigation": {
                        "what-the-terminal-is": {
                            intro: "Use the terminal to talk to the computer.",
                        },
                    },
                },
            },
        });
        expect(normalized.replacements).toContainEqual([
            "linux-terminal-fundamentals-linux-module-1-orientation",
            "linux--linux-terminal-fundamentals--draft-linux-module-1-orientation",
        ]);
    });
});
