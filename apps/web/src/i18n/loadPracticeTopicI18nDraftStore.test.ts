import {
    afterEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock(
    "server-only",
    () => ({}),
);

describe(
    "loadPracticeTopicI18n canonical draft store",
    () => {
        afterEach(() => {
            vi.restoreAllMocks();
            vi.resetModules();
        });

        it(
            "loads Course 2 fill-blank presentation directly from .curriculum-drafts after a clean app rebuild",
            async () => {
                const repoRoot =
                    await fs.mkdtemp(
                        path.join(
                            os.tmpdir(),
                            "practice-i18n-draft-store-",
                        ),
                    );

                const appRoot =
                    path.join(
                        repoRoot,
                        "apps",
                        "web",
                    );

                await fs.mkdir(
                    path.join(
                        appRoot,
                        "src",
                        "i18n",
                        "messages",
                        "en",
                    ),
                    {
                        recursive: true,
                    },
                );

                const topicFile =
                    path.join(
                        repoRoot,
                        ".curriculum-drafts",
                        "haitian-creole",
                        "messages",
                        "en",
                        "subjects",
                        "haitian-creole--haitian-creole-everyday-grammar--draft",
                        "module1",
                        "use-possessive-pronouns.json",
                    );

                await fs.mkdir(
                    path.dirname(
                        topicFile,
                    ),
                    {
                        recursive: true,
                    },
                );

                await fs.writeFile(
                    topicFile,
                    JSON.stringify(
                        {
                            topics: {
                                "haitian-creole--haitian-creole-everyday-grammar--draft": {
                                    "haitian-creole-everyday-grammar-2-pronouns-and-possession": {
                                        "use-possessive-pronouns": {
                                            practice: {
                                                "possessive-singular-m-fill": {
                                                    title:
                                                        "Complete mine",
                                                    prompt:
                                                        "Complete the contracted singular form.",
                                                    template:
                                                        "pa ___ nan",
                                                    choices: [
                                                        "m",
                                                        "n",
                                                        "l",
                                                    ],
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
                    "utf8",
                );

                vi.spyOn(
                    process,
                    "cwd",
                ).mockReturnValue(
                    appRoot,
                );

                const {
                    loadPracticeTopicI18n,
                } = await import(
                    "./loadPracticeTopicI18n"
                );

                const result =
                    await loadPracticeTopicI18n({
                        locale: "en",
                        subjectSlug:
                            "haitian-creole-everyday-grammar",
                        moduleSlug:
                            "haitian-creole-everyday-grammar-2-pronouns-and-possession",
                        topicSlug:
                            "use-possessive-pronouns",
                    });

                expect(
                    result.quiz?.[
                        "possessive-singular-m-fill"
                    ]?.template,
                ).toBe(
                    "pa ___ nan",
                );

                expect(
                    result.quiz?.[
                        "possessive-singular-m-fill"
                    ]?.choices,
                ).toEqual([
                    "m",
                    "n",
                    "l",
                ]);
            },
        );
    },
);
