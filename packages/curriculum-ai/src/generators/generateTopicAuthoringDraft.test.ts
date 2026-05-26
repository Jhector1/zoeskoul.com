import { describe, expect, it } from "vitest";
import { pythonShape } from "@zoeskoul/curriculum-profiles";
import { generateTopicAuthoringDraftAttempt } from "./generateTopicAuthoringDraft.js";
import { validateTopicAuthoringDraft } from "@zoeskoul/curriculum-contracts";
describe("generateTopicAuthoringDraftAttempt", () => {
    it("requires generateJsonDetailed for auditable TopicAuthoringDraft generation", async () => {
        await expect(
            generateTopicAuthoringDraftAttempt(
                {
                    async generateJson<T>() {
                        return {} as T;
                    },
                },
                {
                    seed: {
                        profileId: "python",
                        subjectSlug: "python-for-beginners",
                        courseSlug: "python-course",
                        moduleSlug: "python-1",
                        modulePrefix: "py1",
                        moduleOrder: 1,
                        sectionSlug: "python-1-section-1",
                        sectionOrder: 1,
                        topicId: "read-and-add",
                        order: 1,
                        title: "Read and Add",
                        summary: "Read input and add one.",
                        minutes: 15,
                        sourceLocale: "en",
                        targetLocales: [],
                    } as any,
                    locale: "en",
                    shape: pythonShape,
                },
            ),
        ).rejects.toThrow(
            "TopicAuthoringDraft generation requires an auditable provider with generateJsonDetailed().",
        );
    });


    it("sanitizes empty-stdout generated code_input tests before validation", async () => {
        const result = await generateTopicAuthoringDraftAttempt(
            {
                async generateJson<T>() {
                    throw new Error("generateJson should not be called in this test");
                },

                async generateJsonDetailed<T>() {
                    return {
                        provider: "test",
                        model: "test",
                        temperature: 0,
                        schemaName: "TopicAuthoringDraft",
                        strictSchema: false,
                        rawText: "{}",
                        parsedJson: {},
                        value: {
                            title: "Writing text files",
                            summary: "Practice writing text to files.",
                            minutes: 15,
                            sketchBlocks: [
                                {
                                    id: "worked-example",
                                    title: "Worked example",
                                    bodyMarkdown:
                                        "```python\nwith open('note.txt', 'w') as file:\n    file.write('Hello')\n```\nTry it yourself: change the message and run the code.",
                                },
                            ],
                            quizDraft: [
                                {
                                    id: "quiz1",
                                    kind: "code_input",
                                    title: "Write a file",
                                    prompt:
                                        "Complete the program so it writes text to a file.",
                                    hint:
                                        "Use open() with write mode and call write().",
                                    help: {
                                        concept:
                                            "Python can write text to files using open() with write mode.",
                                        hint_1:
                                            "Use mode 'w' when opening the file.",
                                        hint_2:
                                            "Call write() with the text you want to save.",
                                    },
                                    starterCode:
                                        "with open('note.txt', 'w') as file:\n    # write text here\n",
                                    solutionCode:
                                        "with open('note.txt', 'w') as file:\n    file.write('Hello')\n",
                                    recipeType: "fixed_tests",
                                    tests: [
                                        {
                                            stdin: "",
                                            stdout: "",
                                            match: "exact",
                                        },
                                    ],
                                },
                            ],
                        },
                    } as any;
                },
            },
            {
                seed: {
                    profileId: "python",
                    subjectSlug: "python",
                    courseSlug: "python-data-functions",
                    moduleSlug: "python-7-files-exceptions-and-data-cleaning",
                    modulePrefix: "python-7",
                    moduleOrder: 7,
                    sectionSlug: "python-7-file-io",
                    sectionOrder: 1,
                    topicId: "writing-text-files",
                    order: 2,
                    title: "Writing Text Files",
                    summary: "Practice writing text files.",
                    minutes: 15,
                    sourceLocale: "en",
                    targetLocales: [],
                } as any,
                locale: "en",
                shape: pythonShape,
            },
        );

        const exercise = result.generation.value.quizDraft[0] as any;

        expect(exercise.kind).toBe("fill_blank_choice");
        expect(exercise.template).toContain("____");
        expect(exercise.choices).toContain("print an observable result");
        expect(exercise.correctValue).toBe("print an observable result");

        expect(validateTopicAuthoringDraft(result.generation.value).ok).toBe(true);
    });

    it("sanitizes generated Python file fixtures before draft validation", async () => {
        const result = await generateTopicAuthoringDraftAttempt(
            {
                async generateJson<T>() {
                    throw new Error("generateJson should not be called in this test");
                },

                async generateJsonDetailed<T>() {
                    return {
                        provider: "test",
                        model: "test",
                        temperature: 0,
                        schemaName: "TopicAuthoringDraft",
                        strictSchema: false,
                        rawText: "{}",
                        parsedJson: {},
                        value: {
                            title: "Working With Paths",
                            summary: "Practice reading files with pathlib.",
                            minutes: 15,
                            sketchBlocks: [],
                            quizDraft: [
                                {
                                    id: "quiz9",
                                    kind: "code_input",
                                    title: "Read a nested file",
                                    prompt: "Read data/input.txt and print it.",
                                    hint: "Use pathlib.",
                                    help: {
                                        concept: "Read the file from a relative path.",
                                        hint_1: "Create a Path object.",
                                        hint_2: "Print the contents you read.",
                                    },
                                    starterCode: "from pathlib import Path\n",
                                    solutionCode:
                                        "from pathlib import Path\npath = Path('data/input.txt')\nprint(path.read_text())\n",
                                    recipeType: "fixed_tests",
                                    files: [
                                        {
                                            path: "data/input.txt",
                                            content: `Hello\n\n\n\n\nWorld\n${"x".repeat(700)}`,
                                        },
                                        {
                                            path: "/tmp/bad.txt",
                                            content: "ignore me",
                                        },
                                    ],
                                    tests: [
                                        {
                                            stdout: "Hello\nWorld\n",
                                            match: "exact",
                                            files: [
                                                {
                                                    path: "data/input.txt",
                                                    content: "First line\n\n\n\n\nSecond line\n\n\n",
                                                },
                                                {
                                                    path: "../outside.txt",
                                                    content: "bad",
                                                },
                                            ],
                                        },
                                    ],
                                },
                            ],
                        },
                    } as any;
                },
            },
            {
                seed: {
                    profileId: "python",
                    subjectSlug: "python",
                    courseSlug: "python-data-functions",
                    moduleSlug: "python-7-files-exceptions-and-data-cleaning",
                    modulePrefix: "python-7",
                    moduleOrder: 7,
                    sectionSlug: "python-7-file-io",
                    sectionOrder: 1,
                    topicId: "working-with-paths",
                    order: 3,
                    title: "Working With Paths",
                    summary: "Practice reading nested files.",
                    minutes: 15,
                    sourceLocale: "en",
                    targetLocales: [],
                } as any,
                locale: "en",
                shape: pythonShape,
            },
        );

        const exercise = result.generation.value.quizDraft[0] as any;

        expect(exercise.files).toEqual([
            {
                path: "data/input.txt",
                content: "Hello\n\n\nWorld",
            },
        ]);
        expect(exercise.tests[0].files).toEqual([
            {
                path: "data/input.txt",
                content: "First line\n\n\nSecond line",
            },
        ]);
        expect(validateTopicAuthoringDraft(result.generation.value).ok).toBe(true);
    });


});
