import { describe, expect, it } from "vitest";
import {
    doesPracticeStateMatchQuestion,
    getPracticeQuestionIdentity,
    getPracticeStateIdentity,
    sanitizeSavedPracticePatch,
} from "@/components/review/quiz/hooks/useQuizPracticeBank";
import { collectTerminalWorkspaceCommands } from "@/lib/practice/terminalWorkspaceHints";
import { normalizeVisibleTerminalTranscriptText } from "@/lib/practice/visibleTerminalTranscript";

describe("useQuizPracticeBank practice identity guards", () => {
    const subjectSlug = "python-data-functions";
    const moduleSlug = "python-6-functions-and-modularity";
    const sectionSlug = "python-data-functions-python-6-function-design";
    const topicId = "py6.using-imports-and-helper-files";
    const exerciseId = "using-imports-create-name-module";
    const stableKey = [
        subjectSlug,
        moduleSlug,
        sectionSlug,
        topicId,
        exerciseId,
    ].join(":");

    it("treats matching question and practice state as reusable", () => {
        const question = {
            id: stableKey,
            kind: "practice",
            fetch: {
                subject: subjectSlug,
                module: moduleSlug,
                section: sectionSlug,
                topic: topicId,
                exerciseKey: exerciseId,
            },
        } as any;

        const state = {
            exercise: {
                id: exerciseId,
                exerciseKey: exerciseId,
                topic: topicId,
                subjectSlug,
                moduleSlug,
                sectionSlug,
            },
            item: {
                id: exerciseId,
                exerciseKey: exerciseId,
                topicId,
                subjectSlug,
                moduleSlug,
                sectionSlug,
            },
        } as any;

        expect(getPracticeQuestionIdentity(question)).toEqual({
            stableKey,
            exerciseKey: exerciseId,
            topicId,
            subjectSlug,
            moduleSlug,
            sectionSlug,
        });
        expect(getPracticeStateIdentity(state)).toEqual({
            exerciseKey: exerciseId,
            topicId,
            subjectSlug,
            moduleSlug,
            sectionSlug,
        });
        expect(doesPracticeStateMatchQuestion(state, question)).toBe(true);
    });

    it("reuses freshly loaded generated exercises when the state is stamped with the requested step identity", () => {
        const question = {
            id: stableKey,
            kind: "practice",
            fetch: {
                subject: subjectSlug,
                module: moduleSlug,
                section: sectionSlug,
                topic: topicId,
                exerciseKey: exerciseId,
            },
        } as any;

        const state = {
            exerciseKey: exerciseId,
            topicId,
            subjectSlug,
            moduleSlug,
            sectionSlug,
            exercise: {
                id: "python_part1_b18b3e5e7933",
                kind: "code_input",
            },
            item: {
                key: "signed-practice-key",
                exercise: {
                    id: "python_part1_b18b3e5e7933",
                    kind: "code_input",
                },
            },
        } as any;

        expect(getPracticeStateIdentity(state)).toEqual({
            exerciseKey: exerciseId,
            topicId,
            subjectSlug,
            moduleSlug,
            sectionSlug,
        });
        expect(doesPracticeStateMatchQuestion(state, question)).toBe(true);
    });

    it("rejects stale practice state from another topic even when the exercise key matches", () => {
        const question = {
            id: stableKey,
            kind: "practice",
            fetch: {
                subject: subjectSlug,
                module: moduleSlug,
                section: sectionSlug,
                topic: topicId,
                exerciseKey: exerciseId,
            },
        } as any;

        const staleState = {
            exercise: {
                id: exerciseId,
                exerciseKey: exerciseId,
                topic: "py5.function-design-and-return-values",
                subjectSlug,
                moduleSlug: "python-5-function-design",
                sectionSlug: "python-data-functions-python-5-function-design",
            },
            item: {
                id: exerciseId,
                exerciseKey: exerciseId,
                topicId: "py5.function-design-and-return-values",
                subjectSlug,
                moduleSlug: "python-5-function-design",
                sectionSlug: "python-data-functions-python-5-function-design",
            },
        } as any;

        expect(doesPracticeStateMatchQuestion(staleState, question)).toBe(false);
    });

    it("sanitizes saved practice patches without stripping learner workspace fields", () => {
        const sanitized = sanitizeSavedPracticePatch({
            key: "stale-signed-key",
            title: "stale title",
            prompt: "stale prompt",
            starterCode: "print('old starter')\n",
            starterFiles: [{ path: "main.py", content: "print('old starter')\n" }],
            workspaceExpectations: { requiredFiles: ["main.py"] },
            recipe: { starterCode: "print('old starter')\n" },
            help: { activeStepKey: "hint" },
            messageBase: "quiz.old_key",
            workspace: {
                version: 2,
                language: "python",
                entryFileId: "main.py",
                activeFileId: "main.py",
                nodes: [
                    {
                        id: "main.py",
                        kind: "file",
                        name: "main.py",
                        parentId: null,
                        content: "print('learner work')\n",
                        createdAt: 0,
                        updatedAt: 0,
                    },
                ],
                openTabs: ["main.py"],
                expanded: [],
                stdin: "",
            },
            code: "print('learner work')\n",
            userEdited: true,
            workspaceOrigin: "user",
        });

        expect(sanitized).not.toHaveProperty("key");
        expect(sanitized).not.toHaveProperty("title");
        expect(sanitized).not.toHaveProperty("prompt");
        expect(sanitized).not.toHaveProperty("starterCode");
        expect(sanitized).not.toHaveProperty("starterFiles");
        expect(sanitized).not.toHaveProperty("workspaceExpectations");
        expect(sanitized).not.toHaveProperty("recipe");
        expect(sanitized).not.toHaveProperty("help");
        expect(sanitized).not.toHaveProperty("messageBase");
        expect((sanitized as any).workspace?.language).toBe("python");
        expect((sanitized as any).code).toBe("print('learner work')\n");
        expect((sanitized as any).userEdited).toBe(true);
    });

    it("preserves prompt boundaries in visible terminal transcript fallback", () => {
        const transcript = normalizeVisibleTerminalTranscriptText([
            "[starting workspace terminal][zoeskoul]~$ mkdir -p practice/notes[zoeskoul]~$ mv practice-inbox/card.txt practice/notes/card.txt",
        ]);

        expect(transcript).toContain("\n[zoeskoul]~$ mkdir -p practice/notes");
        expect(transcript).toContain("\n[zoeskoul]~$ mv practice-inbox/card.txt practice/notes/card.txt");
    });

    it("extracts separate shell commands from a normalized visible transcript fallback", () => {
        const outputText = normalizeVisibleTerminalTranscriptText([
            "[starting workspace terminal][zoeskoul]~$ mkdir -p practice/notes[zoeskoul]~$ mv practice-inbox/card.txt practice/notes/card.txt",
        ]);

        expect(
            collectTerminalWorkspaceCommands({
                outputText,
            }),
        ).toEqual([
            "mkdir -p practice/notes",
            "mv practice-inbox/card.txt practice/notes/card.txt",
        ]);
    });
});
