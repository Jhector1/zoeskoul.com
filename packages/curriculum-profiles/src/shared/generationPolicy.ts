import type { ExerciseKind } from "@zoeskoul/curriculum-contracts";
import type {
    CourseProfile,
    PracticeProfileConfig,
    ProjectExerciseCandidate,
    ProjectProfileCapability,
    ProjectTopicKind,
} from "../types.js";

export type BaseCourseGenerationPolicy = {
    practice: {
        requireTryItForTeachingTopics: boolean;
        tryItPlacement: "first_sketch" | "all_sketches" | "none";
        requireTryItConceptAlignment: boolean;
    };
    quiz: {
        allowCodeInput: boolean;
        allowedKinds: ExerciseKind[];
    };
    projects: {
        requireOneModuleProjectPerStandardModule: boolean;
        requireFinalCapstone: boolean;
        projectTopicSketchCount: number;
        projectFlowDefault: "standalone" | "progressive";
        requireStepChaining: boolean;
        moduleProject: {
            minStepCount: number;
            targetStepCount: number;
            title: string;
            stepLabel: string;
            startPromptPrefix: string;
            continuePromptPrefix: string;
            helpConcept: string;
        };
        capstone: {
            minStepCount: number;
            targetStepCount: number;
            title: string;
            stepLabel: string;
            startPromptPrefix: string;
            continuePromptPrefix: string;
            helpConcept: string;
        };
    };
    exerciseKinds: {
        tryItPurpose: "try_it";
        practicePurpose: "practice";
        quizPurpose: "quiz";
        projectPurpose: "project";
    };
};

export const baseCourseGenerationPolicy: BaseCourseGenerationPolicy = {
    practice: {
        requireTryItForTeachingTopics: true,
        tryItPlacement: "all_sketches",
        requireTryItConceptAlignment: true,
    },
    quiz: {
        allowCodeInput: false,
        allowedKinds: [
            "single_choice",
            "multi_choice",
            "drag_reorder",
            "fill_blank_choice",
        ],
    },
    projects: {
        requireOneModuleProjectPerStandardModule: true,
        requireFinalCapstone: true,
        projectTopicSketchCount: 1,
        projectFlowDefault: "progressive",
        requireStepChaining: true,
        moduleProject: {
            minStepCount: 3,
            targetStepCount: 3,
            title: "Real-World Module Project",
            stepLabel: "Project step",
            startPromptPrefix: "Start the module project.",
            continuePromptPrefix:
                "Continue the same module project from the previous working step.",
            helpConcept:
                "This module project is progressive. Each step starts from the previous working solution and adds one focused feature.",
        },
        capstone: {
            minStepCount: 5,
            targetStepCount: 5,
            title: "Real-World Final Capstone",
            stepLabel: "Capstone step",
            startPromptPrefix: "Start the final capstone project.",
            continuePromptPrefix:
                "Continue the final capstone project from the previous working step.",
            helpConcept:
                "The final capstone is progressive. Each step starts from the previous working solution and adds one focused feature.",
        },
    },
    exerciseKinds: {
        tryItPurpose: "try_it",
        practicePurpose: "practice",
        quizPurpose: "quiz",
        projectPurpose: "project",
    },
};


export function createSharedPracticeProfileConfig(args?: {
    preferredTryItExerciseKind?: ExerciseKind | null;
}): PracticeProfileConfig {
    return {
        tryItDefault: {
            enabled: baseCourseGenerationPolicy.practice.requireTryItForTeachingTopics,
            placement: baseCourseGenerationPolicy.practice.tryItPlacement,
            sketchIndex: 0,
            allowReveal: true,
        },
        ...(args?.preferredTryItExerciseKind
            ? { preferredTryItExerciseKind: args.preferredTryItExerciseKind }
            : {}),
    };
}

export const sharedPracticeProfileConfig: PracticeProfileConfig = createSharedPracticeProfileConfig({
    preferredTryItExerciseKind: "code_input",
});

function projectDefaults(topicKind: ProjectTopicKind) {
    return topicKind === "capstone"
        ? baseCourseGenerationPolicy.projects.capstone
        : baseCourseGenerationPolicy.projects.moduleProject;
}

function buildSharedProjectConfig(args: {
    topicKind: ProjectTopicKind;
    preferredProjectExerciseKind?: ExerciseKind | null;
}) {
    const defaults = projectDefaults(args.topicKind);

    return {
        preferredProjectExerciseKind:
            args.preferredProjectExerciseKind ?? "code_input",
        minStepCount: defaults.minStepCount,
        targetStepCount: defaults.targetStepCount,
        allowReveal: true,
        tryItDefault: {
            enabled: true,
            placement: baseCourseGenerationPolicy.practice.tryItPlacement,
            sketchIndex: 0,
            allowReveal: true,
        },
        projectFlowDefault: baseCourseGenerationPolicy.projects.projectFlowDefault,
        projectTitle: defaults.title,
        projectStepLabel: defaults.stepLabel,
        startPromptPrefix: defaults.startPromptPrefix,
        continuePromptPrefix: defaults.continuePromptPrefix,
        helpConcept: defaults.helpConcept,
    };
}

function defaultExerciseKind(profile: CourseProfile): ExerciseKind | null {
    const allowed = profile.allowedExerciseKinds as ExerciseKind[];
    return allowed.includes("code_input") ? "code_input" : null;
}

export function createSharedProjectCapability(args?: {
    preferredProjectExerciseKind?: ExerciseKind | null;
    isProjectExercise?: (exercise: ProjectExerciseCandidate) => boolean;
}): ProjectProfileCapability {
    return {
        getProjectConfig(configArgs) {
            return buildSharedProjectConfig({
                topicKind: configArgs.topicKind,
                preferredProjectExerciseKind: args?.preferredProjectExerciseKind,
            });
        },
        isProjectExercise(configArgs) {
            if (args?.isProjectExercise) {
                return args.isProjectExercise(configArgs.exercise);
            }

            const preferredKind = args?.preferredProjectExerciseKind ?? "code_input";
            return configArgs.exercise.kind === preferredKind;
        },
    };
}

export function createCodeInputProjectCapability(args?: {
    preferredProjectExerciseKind?: ExerciseKind | null;
    isProjectExercise?: (exercise: ProjectExerciseCandidate) => boolean;
}): ProjectProfileCapability {
    return createSharedProjectCapability({
        preferredProjectExerciseKind: args?.preferredProjectExerciseKind ?? "code_input",
        isProjectExercise: args?.isProjectExercise,
    });
}

export function applyBaseCourseGenerationPolicy(profile: CourseProfile): CourseProfile {
    const defaultKind = defaultExerciseKind(profile);

    return {
        ...profile,
        practice:
            profile.practice ??
            (defaultKind
                ? createSharedPracticeProfileConfig({
                    preferredTryItExerciseKind: defaultKind,
                })
                : undefined),
        project:
            profile.project ??
            (defaultKind
                ? createSharedProjectCapability({
                    preferredProjectExerciseKind: defaultKind,
                })
                : undefined),
    };
}
