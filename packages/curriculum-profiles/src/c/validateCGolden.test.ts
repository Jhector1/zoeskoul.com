import { afterEach, describe, expect, it } from "vitest";
import { clearCodeRunner, setCodeRunner } from "@zoeskoul/curriculum-runtime";
import { validateCGolden } from "./validateCGolden.js";

describe("validateCGolden", () => {
    afterEach(() => {
        clearCodeRunner();
    });

    it("executes the complete official multi-file C solution", async () => {
        let receivedLanguage = "";
        let receivedCode = "";
        let receivedFiles: Array<{ path: string; content: string }> = [];

        setCodeRunner(async ({ language, code, files }) => {
            receivedLanguage = String(language ?? "");
            receivedCode = String(code ?? "");
            receivedFiles = (Array.isArray(files) ? files : [])
                .filter((file): file is { path: string; content: string } =>
                    typeof (file as { content?: unknown }).content === "string",
                );

            return {
                ok: true,
                stdout: "minimum=2\n",
                stderr: "",
                exitCode: 0,
            };
        });

        const report = await validateCGolden({
            seed: {
                profileId: "c",
                subjectSlug: "c-data-structures",
                courseSlug: "c-data-structures",
                topicId: "priority-queue-with-stacks",
                moduleSlug: "c-data-structures-module-1-algorithm-lab",
                sectionSlug: "c-data-structures-section-4-priority-queue-stacks",
                order: 1,
                title: "Priority Queue with Stacks",
                summary: "Implement extract-min with stack operations.",
                minutes: 30,
                moduleTitle: "Algorithm Lab",
                moduleObjectives: [],
                guidedExercises: [],
                quizFocus: [],
                sectionTitle: "Priority Queue from Stacks",
                sourceLocale: "en",
                targetLocales: [],
                modulePrefix: "c_data_structures_module_1",
                moduleOrder: 1,
                sectionOrder: 4,
                learningGoals: [],
            } as any,
            draft: {} as any,
            topicBundle: {
                topicId: "priority-queue-with-stacks",
                subjectSlug: "c-data-structures",
                profileId: "c",
                moduleSlug: "c-data-structures-module-1-algorithm-lab",
                sectionSlug: "c-data-structures-section-4-priority-queue-stacks",
                prefix: "topics.c-data-structures.algorithm-lab.priority-queue-with-stacks",
                minutes: 30,
                topic: { labelKey: "label", summaryKey: "summary" },
                runtimeDefaults: {
                    kind: "code",
                    language: "c",
                    supportsMultiFile: true,
                    supportsFileSystem: true,
                },
                cards: [],
                sketches: [],
                exercises: [
                    {
                        id: "implement-priority-queue",
                        kind: "code_input",
                        purpose: "project",
                        weight: 1,
                        messageBase: "topics.c.priorityQueue.exercise",
                        language: "c",
                        starterCode: "#include \"priority_queue.h\"\n",
                        starterFiles: [
                            {
                                path: "main.c",
                                content: "#include <stdio.h>\n#include \"priority_queue.h\"\nint main(void) { printf(\"minimum=%d\\n\", pq_extract_min()); return 0; }\n",
                                language: "c",
                                isEntry: true,
                            },
                            {
                                path: "priority_queue.h",
                                content: "int pq_extract_min(void);\n",
                                language: "c",
                            },
                            {
                                path: "priority_queue.c",
                                content: "#include \"priority_queue.h\"\nint pq_extract_min(void) { return 0; }\n",
                                language: "c",
                            },
                        ],
                        solutionFiles: [
                            {
                                path: "main.c",
                                content: "#include <stdio.h>\n#include \"priority_queue.h\"\nint main(void) { printf(\"minimum=%d\\n\", pq_extract_min()); return 0; }\n",
                                language: "c",
                                isEntry: true,
                            },
                            {
                                path: "priority_queue.h",
                                content: "int pq_extract_min(void);\n",
                                language: "c",
                            },
                            {
                                path: "priority_queue.c",
                                content: "#include \"priority_queue.h\"\nint pq_extract_min(void) { return 2; }\n",
                                language: "c",
                            },
                        ],
                        workspace: {
                            language: "c",
                            entryFilePath: "main.c",
                            starterFiles: [
                                {
                                    path: "main.c",
                                    content: "#include <stdio.h>\n#include \"priority_queue.h\"\nint main(void) { printf(\"minimum=%d\\n\", pq_extract_min()); return 0; }\n",
                                    language: "c",
                                    isEntry: true,
                                },
                                {
                                    path: "priority_queue.h",
                                    content: "int pq_extract_min(void);\n",
                                    language: "c",
                                },
                                {
                                    path: "priority_queue.c",
                                    content: "#include \"priority_queue.h\"\nint pq_extract_min(void) { return 0; }\n",
                                    language: "c",
                                },
                            ],
                        },
                        recipe: {
                            type: "fixed_tests",
                            solutionCode: "#include <stdio.h>\n#include \"priority_queue.h\"\nint main(void) { printf(\"minimum=%d\\n\", pq_extract_min()); return 0; }\n",
                            solutionFiles: [
                                {
                                    path: "main.c",
                                    content: "#include <stdio.h>\n#include \"priority_queue.h\"\nint main(void) { printf(\"minimum=%d\\n\", pq_extract_min()); return 0; }\n",
                                    language: "c",
                                    isEntry: true,
                                },
                                {
                                    path: "priority_queue.h",
                                    content: "int pq_extract_min(void);\n",
                                    language: "c",
                                },
                                {
                                    path: "priority_queue.c",
                                    content: "#include \"priority_queue.h\"\nint pq_extract_min(void) { return 2; }\n",
                                    language: "c",
                                },
                            ],
                            tests: [
                                { stdin: "", stdout: "minimum=2\n", match: "exact" },
                            ],
                        },
                    },
                ],
            } as any,
        });

        expect(report.ok).toBe(true);
        expect(report.issues).toEqual([]);
        expect(receivedLanguage).toBe("c");
        expect(receivedCode).toContain("pq_extract_min");
        expect(receivedFiles.map((file) => file.path).sort()).toEqual([
            "main.c",
            "priority_queue.c",
            "priority_queue.h",
        ]);
        expect(receivedFiles.find((file) => file.path === "priority_queue.c")?.content)
            .toContain("return 2");
    });

    it("rejects an incomplete C reveal workspace before publish", async () => {
        const report = await validateCGolden({
            seed: { topicId: "linked-heap", profileId: "c", subjectSlug: "c-data-structures" } as any,
            draft: {} as any,
            topicBundle: {
                topicId: "linked-heap",
                subjectSlug: "c-data-structures",
                moduleSlug: "c-1",
                sectionSlug: "c-1-1",
                prefix: "topics.c.linked-heap",
                minutes: 20,
                topic: { labelKey: "label", summaryKey: "summary" },
                runtimeDefaults: { kind: "code", language: "c" },
                cards: [],
                sketches: [],
                exercises: [
                    {
                        id: "insert-heap",
                        kind: "code_input",
                        messageBase: "topics.c.linkedHeap.exercise",
                        language: "c",
                        starterFiles: [
                            { path: "main.c", content: "int main(void) { return 0; }", isEntry: true },
                            { path: "heap.c", content: "void insert(void) {}" },
                            { path: "heap.h", content: "void insert(void);" },
                        ],
                        solutionFiles: [
                            { path: "main.c", content: "int main(void) { return 0; }", isEntry: true },
                            { path: "heap.c", content: "void insert(void) {}" },
                        ],
                        recipe: {
                            type: "fixed_tests",
                            solutionCode: "int main(void) { return 0; }",
                            tests: [{ stdout: "ok\n", match: "exact" }],
                        },
                    },
                ],
            } as any,
        });

        expect(report.ok).toBe(false);
        expect(report.issues.map((issue) => issue.code)).toContain(
            "CODE_PROFILE_MULTI_FILE_SOLUTION_INCOMPLETE",
        );
    });
});
