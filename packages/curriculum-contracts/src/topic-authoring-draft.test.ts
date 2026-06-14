import { describe, expect, it } from "vitest";
import {
    assertTopicAuthoringDraft,
    validateTopicAuthoringDraft,
} from "./topic-authoring-draft.js";
import type { TopicAuthoringDraft } from "./topic-authoring-draft.js";
function makeValidMinimalDraft() {
    return {
        title: "Topic",
        summary: "Summary",
        minutes: 15,
        sketchBlocks: [],
        quizDraft: [
            {
                id: "fill-1",
                kind: "fill_blank_choice" as const,
                title: "Fill blank",
                prompt: "Choose the right term.",
                hint: "Focus on the missing concept.",
                help: {
                    concept: "The blank needs the right term.",
                    hint_1: "Think about what the blank does.",
                    hint_2: "Choose the term that completes the statement.",
                },
                template: "A table uses a [blank1] to name a field.",
                choices: ["column", "row"],
                correctValue: "column",
            },
        ],
    };
}






function validDraftWithPath(path: string): TopicAuthoringDraft {
    return {
        title: "Files",
        summary: "Use files.",
        minutes: 10,
        sketchBlocks: [
            {
                id: "s1",
                title: "Sketch",
                bodyMarkdown: "Read files.",
            },
        ],
        quizDraft: [
            {
                id: "q1",
                kind: "code_input",
                title: "Read file",
                prompt: "Read a file.",
                hint: "Use open().",
                help: {
                    concept: "Relative paths identify files.",
                    hint_1: "Use the provided path.",
                    hint_2: "Print the file contents.",
                },
                starterCode: "# Write your answer below\n",
                entryFilePath: "src/main.py",
                starterFiles: [
                    {
                        path: "src/main.py",
                        content: "# Write your answer below\n",
                        isEntry: true,
                    },
                ],
                solutionCode: `print(open("${path}").read())`,
                recipeType: "fixed_tests",
                files: [
                    {
                        path,
                        content: "hello\n",
                        readOnly: true,
                    },
                ],
                tests: [
                    {
                        stdout: "hello\n",
                        files: [
                            {
                                path,
                                content: "hello\n",
                            },
                        ],
                    },
                    {
                        stdout: "hello\n",
                        files: [
                            {
                                path,
                                content: "hello\n",
                            },
                        ],
                    },
                ],
            },
        ],
    };
}

describe("TopicAuthoringDraft workspace file paths", () => {
    it("allows nested workspace-relative file paths", () => {
        expect(() =>
            assertTopicAuthoringDraft(validDraftWithPath("data/input.txt")),
        ).not.toThrow();

        expect(() =>
            assertTopicAuthoringDraft(validDraftWithPath("fixtures/case-1/input.txt")),
        ).not.toThrow();
    });
    it("does not count Python dunder method names as fill blanks", () => {
        const draft = makeValidMinimalDraft();

        draft.quizDraft[0] = {
            id: "fill-dunder",
            kind: "fill_blank_choice" as const,
            title: "Initialize an attribute",
            prompt: "Complete the __init__ method by choosing the missing attribute name.",
            hint: "The blank is the instance attribute after self.",
            help: {
                concept: "The __init__ method initializes instance attributes.",
                hint_1: "Look after self.",
                hint_2: "Choose the attribute name.",
            },
            template: "class Person:\n    def __init__(self, name):\n        self.[blank1] = name",
            choices: ["name", "age"],
            correctValue: "name",
        };

        expect(validateTopicAuthoringDraft(draft).ok).toBe(true);
        expect(() => assertTopicAuthoringDraft(draft)).not.toThrow();
    });
    it("rejects unsafe workspace paths", () => {
        for (const badPath of [
            "../secret.txt",
            "/absolute/path.txt",
            "C:\\Users\\admin\\secret.txt",
            "data//input.txt",
            "./input.txt",
        ]) {
            expect(() =>
                assertTopicAuthoringDraft(validDraftWithPath(badPath)),
            ).toThrow(/workspace|path|unsafe|invalid/i);
        }
    });

    it("accepts workspaceExpectations with safe required files and folders", () => {
        expect(() =>
            assertTopicAuthoringDraft({
                ...makeValidMinimalDraft(),
                quizDraft: [
                    {
                        id: "code-1",
                        kind: "code_input" as const,
                        title: "Workspace contract",
                        prompt: "Create the helper file.",
                        hint: "Use the required path.",
                        help: {
                            concept: "Project-style exercises can require exact workspace paths.",
                            hint_1: "Match the required helper file path exactly.",
                            hint_2: "Place the helper file inside the required folder.",
                        },
                        starterCode: "# start\n",
                        solutionCode: "print('ok')\n",
                        recipeType: "fixed_tests" as const,
                        workspaceExpectations: {
                            requiredFiles: ["helpers/formatting.py"],
                            requiredFolders: ["helpers"],
                        },
                        tests: [
                            { stdout: "ok\n" },
                        ],
                    },
                ],
            }),
        ).not.toThrow();
    });
});
describe("TopicAuthoringDraft canonical validation", () => {
    it("accepts a valid minimal draft", () => {
        const draft = makeValidMinimalDraft();
        expect(validateTopicAuthoringDraft(draft).ok).toBe(true);
        expect(() => assertTopicAuthoringDraft(draft)).not.toThrow();
    });

    it("accepts shell_task code_input without tests or semantic checks", () => {
        const draft = {
            ...makeValidMinimalDraft(),
            quizDraft: [
                {
                    id: "shell-1",
                    kind: "code_input" as const,
                    title: "Inspect the workspace",
                    prompt: "Use the terminal to inspect the workspace.",
                    hint: "Start with pwd and ls.",
                    help: {
                        concept: "Terminal-first tasks can rely on the workspace shell.",
                        hint_1: "Run a simple shell command first.",
                        hint_2: "Inspect the workspace before editing files.",
                    },
                    starterCode: "#!/usr/bin/env bash\n",
                    solutionCode: "pwd\nls\n",
                    fixedLanguage: "bash" as const,
                    recipeType: "shell_task" as const,
                    mode: "terminal_workspace" as const,
                    instructions: "Inspect the workspace and run shell commands.",
                },
            ],
        };

        expect(validateTopicAuthoringDraft(draft).ok).toBe(true);
        expect(() => assertTopicAuthoringDraft(draft)).not.toThrow();
    });

    it("rejects unknown top-level fields", () => {
        const result = validateTopicAuthoringDraft({
            ...makeValidMinimalDraft(),
            extraTopLevelField: true,
        });

        expect(result.ok).toBe(false);
        expect(result.errors[0]).toMatch(/unknown field\(s\): extraTopLevelField/);
    });

    it("rejects unknown nested exercise fields", () => {
        const result = validateTopicAuthoringDraft({
            ...makeValidMinimalDraft(),
            quizDraft: [
                {
                    ...makeValidMinimalDraft().quizDraft[0],
                    unexpectedNestedField: true,
                },
            ],
        });

        expect(result.ok).toBe(false);
        expect(result.errors[0]).toMatch(/unknown field\(s\): unexpectedNestedField/);
    });

    it("rejects unknown nested test fields", () => {
        const result = validateTopicAuthoringDraft({
            ...makeValidMinimalDraft(),
            quizDraft: [
                {
                    id: "code-1",
                    kind: "code_input" as const,
                    title: "Code",
                    prompt: "Prompt",
                    hint: "Hint",
                    help: {
                        concept: "Concept",
                        hint_1: "Hint 1",
                        hint_2: "Hint 2",
                    },
                    starterCode: "# start\n",
                    solutionCode: "print(1)\n",
                    recipeType: "fixed_tests" as const,
                    tests: [
                        {
                            stdout: "1\n",
                            unexpectedField: true,
                        },
                    ],
                },
            ],
        });

        expect(result.ok).toBe(false);
        expect(result.errors[0]).toMatch(/unknown field\(s\): unexpectedField/);
    });

    it("accepts code_input fixture files", () => {
        const result = validateTopicAuthoringDraft({
            ...makeValidMinimalDraft(),
            quizDraft: [
                {
                    id: "code-1",
                    kind: "code_input" as const,
                    title: "Read a file",
                    prompt: "Read names.txt and print the first line.",
                    hint: "Use the provided file.",
                    help: {
                        concept: "File I/O exercises can include provided fixture files.",
                        hint_1: "Open the provided file path exactly as written.",
                        hint_2: "Print the requested value.",
                    },
                    starterCode: "# start\n",
                    solutionCode: "with open('names.txt') as f:\n    print(f.readline().strip())\n",
                    recipeType: "fixed_tests" as const,
                    tests: [
                        {
                            stdout: "Ada\n",
                        },
                    ],
                    files: [
                        {
                            path: "names.txt",
                            content: "Ada\nGrace\n",
                            readOnly: true,
                        },
                    ],
                },
            ],
        });

        expect(result.ok).toBe(true);
    });

    it("accepts code_input solutionFiles and sourceChecks", () => {
        const result = validateTopicAuthoringDraft({
            ...makeValidMinimalDraft(),
            quizDraft: [
                {
                    id: "code-1",
                    kind: "code_input" as const,
                    title: "Build a helper project",
                    prompt: "Import the helper and print the cleaned name.",
                    hint: "Create the helper module first.",
                    help: {
                        concept: "Multi-file exercises can require exact helper files and import lines.",
                        hint_1: "Put the helper in its own file.",
                        hint_2: "Import it into main.py.",
                    },
                    starterCode: "# start\n",
                    solutionCode: "from tools.names import clean_name\nprint(clean_name(' ava '))\n",
                    solutionFiles: [
                        {
                            path: "main.py",
                            content: "from tools.names import clean_name\nprint(clean_name(' ava '))\n",
                            isEntry: true,
                        },
                        {
                            path: "tools/names.py",
                            content: "def clean_name(text):\n    return text.strip().title()\n",
                        },
                    ],
                    sourceChecks: [
                        {
                            type: "source_contains",
                            pattern: "from tools.names import clean_name",
                            message: "Import clean_name from tools.names.",
                        },
                    ],
                    recipeType: "fixed_tests" as const,
                    tests: [
                        { stdout: "Ava\n" },
                        { stdout: "Ava\n" },
                    ],
                },
            ],
        });

        expect(result.ok).toBe(true);
    });

    it("accepts per-test file fixtures for code_input", () => {
        const result = validateTopicAuthoringDraft({
            ...makeValidMinimalDraft(),
            quizDraft: [
                {
                    id: "code-1",
                    kind: "code_input" as const,
                    title: "Read different files",
                    prompt: "Read message.txt and print its contents.",
                    hint: "Use the provided file fixture for each test.",
                    help: {
                        concept: "File I/O fixed tests can vary file contents per test.",
                        hint_1: "Use the same file path each time.",
                        hint_2: "Match the expected output to the matching test fixture.",
                    },
                    starterCode: "# start\n",
                    solutionCode: "with open('message.txt') as f:\n    print(f.read(), end='')\n",
                    recipeType: "fixed_tests" as const,
                    tests: [
                        {
                            stdout: "Hello\n",
                            files: [
                                {
                                    path: "message.txt",
                                    content: "Hello\n",
                                    readOnly: true,
                                },
                            ],
                        },
                        {
                            stdout: "Bye\n",
                            files: [
                                {
                                    path: "message.txt",
                                    content: "Bye\n",
                                    readOnly: true,
                                },
                            ],
                        },
                    ],
                },
            ],
        });

        expect(result.ok).toBe(true);
    });

    it("rejects missing required fields", () => {
        const result = validateTopicAuthoringDraft({
            summary: "Summary",
            minutes: 15,
            sketchBlocks: [],
            quizDraft: [],
        });

        expect(result.ok).toBe(false);
        expect(result.errors[0]).toMatch(/title must be a non-empty string/);
    });

    it("rejects invalid code_input shape", () => {
        const result = validateTopicAuthoringDraft({
            ...makeValidMinimalDraft(),
            quizDraft: [
                {
                    id: "code-1",
                    kind: "code_input" as const,
                    title: "Code",
                    prompt: "Prompt",
                    hint: "Hint",
                    help: {
                        concept: "Concept",
                        hint_1: "Hint 1",
                        hint_2: "Hint 2",
                    },
                    starterCode: "# start\n",
                    solutionCode: "print(1)\n",
                    recipeType: "fixed_tests" as const,
                    tests: "not-an-array",
                },
            ],
        });

        expect(result.ok).toBe(false);
        expect(result.errors[0]).toMatch(/code_input tests must be an array/);
    });

    it("rejects variant-specific fields that do not match the declared kind", () => {
        const result = validateTopicAuthoringDraft({
            ...makeValidMinimalDraft(),
            quizDraft: [
                {
                    ...makeValidMinimalDraft().quizDraft[0],
                    kind: "single_choice" as const,
                },
            ],
        });

        expect(result.ok).toBe(false);
        expect(result.errors.join("\n")).toMatch(
            /unknown field\(s\): template, choices, correctValue/,
        );
    });
});
