import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
    getCurriculumProfile,
    pythonShape,
    registerCurriculumProfile,
    unregisterCurriculumProfile,
    type CourseProfile,
} from "@zoeskoul/curriculum-profiles";
import { buildTopicBundleFromDraft } from "./buildTopicBundleFromDraft.js";

// Deliberately use the existing profile registry and compiler entry point.
// No Course 2 special-case compiler, grader, or card is introduced.
const PROFILE = "stage4b9au-project-reasoning-test";
const stepIds = Array.from({ length: 5 }, (_, i) => `project-step-${i + 1}`);

function seed(project = true) {
    return {
        profileId: PROFILE,
        subjectSlug: "python-for-beginners",
        moduleSlug: "python-1",
        modulePrefix: "py1",
        moduleOrder: 1,
        sectionSlug: project ? "python-1-final" : "python-1-lesson",
        sectionOrder: 1,
        ...(project ? { moduleRole: "capstone", sectionRole: "capstone" } : {}),
        topicId: project ? "reasoning-capstone" : "reasoning-lesson",
        order: 1,
        title: project ? "Reasoning capstone" : "Reasoning lesson",
        summary: "Practice the concepts.",
        minutes: 25,
        sourceLocale: "en",
        targetLocales: [],
        ...(project ? { projectBrief: { stepCountTarget: 5 } } : {}),
        generationTargets: { quizVisibleDefault: 4, quizVisibleMax: 6 },
        moduleRuntimeDefaults: { kind: "code", language: "python" },
    } as any;
}

function step(i: number) {
    return {
        id: stepIds[i],
        kind: "code_input",
        title: `Project step ${i + 1}`,
        prompt: "Read a number and print it.",
        hint: "Use input().",
        help: { concept: "Reading input", hint_1: "Read a value.", hint_2: "Print a value." },
        starterCode: "n = input()\n",
        solutionCode: "n = input()\nprint(n)\n",
        recipeType: "fixed_tests",
        tests: [
            { stdin: "1\n", stdout: "1\n", match: "exact" },
            { stdin: "2\n", stdout: "2\n", match: "exact" },
        ],
    };
}

function question(i: number) {
    return {
        id: `reasoning-${i + 1}`,
        kind: "single_choice",
        title: `Reasoning ${i + 1}`,
        prompt: "Which choice is correct?",
        hint: "Review the lesson.",
        help: { concept: "Reasoning", hint_1: "Compare choices.", hint_2: "Select A." },
        options: ["A", "B"],
        correctOptionIds: ["a"],
    };
}

function draft(withReasoning: boolean) {
    return {
        title: "Capstone",
        summary: "Complete the project.",
        minutes: 25,
        sketchBlocks: [],
        quizDraft: [
            ...(withReasoning ? Array.from({ length: 3 }, (_, i) => question(i)) : []),
            ...Array.from({ length: 5 }, (_, i) => step(i)),
        ],
        projectDraft: { title: "Final capstone", stepIds },
    } as any;
}

beforeAll(() => {
    const base = getCurriculumProfile("python");
    const profile: CourseProfile = {
        ...base,
        id: PROFILE,
        shape: { ...pythonShape, profileId: PROFILE },
        project: {
            getProjectConfig() {
                return {
                    preferredProjectExerciseKind: "code_input",
                    minStepCount: 5,
                    targetStepCount: 5,
                    allowReveal: false,
                    tryItDefault: { enabled: false, placement: "none", sketchIndex: 0, allowReveal: false },
                    projectFlowDefault: "progressive",
                    projectTitle: "Final capstone",
                    projectStepLabel: "Step",
                    startPromptPrefix: "Start",
                    continuePromptPrefix: "Continue",
                    helpConcept: "Review the lesson",
                };
            },
            isProjectExercise({ exercise }) {
                return exercise.kind === "code_input";
            },
        },
    };
    registerCurriculumProfile(profile);
});

afterAll(() => unregisterCurriculumProfile(PROFILE));

describe("project reasoning reuses the standard quiz and project cards", () => {
    it("emits all five project steps and all three separate reasoning questions", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: pythonShape,
            seed: seed(),
            draft: draft(true),
        });
        const cards = bundle.cards;
        expect(cards.map((card) => card.kind)).toEqual(["project", "quiz"]);
        const project = cards.find((card) => card.kind === "project");
        const quiz = cards.find((card) => card.kind === "quiz");
        expect(project?.kind === "project" ? project.project.steps.map((s) => s.exerciseKey) : []).toEqual(stepIds);
        expect(quiz?.kind === "quiz" ? quiz.quiz.n : null).toBe(3);
        expect(bundle.exercises.filter((e) => e.kind === "code_input").map((e) => e.id)).toEqual(stepIds);
        expect(bundle.exercises.filter((e) => e.kind === "single_choice").map((e) => e.id)).toEqual([
            "reasoning-1", "reasoning-2", "reasoning-3",
        ]);
        expect(bundle.exercises).toHaveLength(8);
    });

    it("preserves Course 1-style five-step capstones that have no reasoning quiz", () => {
        const bundle = buildTopicBundleFromDraft({
            shape: pythonShape,
            seed: seed(),
            draft: draft(false),
        });
        expect(bundle.cards.map((card) => card.kind)).toEqual(["project"]);
        expect(bundle.exercises).toHaveLength(5);
        expect(bundle.exercises.every((e) => e.kind === "code_input")).toBe(true);
    });

    it("does not change ordinary topic quizzes", () => {
        const onlyReasoning = {
            title: "Ordinary lesson",
            summary: "Reason about a concept.",
            minutes: 15,
            sketchBlocks: [],
            quizDraft: [question(0), question(1), question(2)],
        } as any;
        const bundle = buildTopicBundleFromDraft({
            shape: pythonShape,
            seed: seed(false),
            draft: onlyReasoning,
        });
        expect(bundle.cards.map((card) => card.kind)).toEqual(["quiz"]);
        expect(bundle.exercises).toHaveLength(3);
    });
});
