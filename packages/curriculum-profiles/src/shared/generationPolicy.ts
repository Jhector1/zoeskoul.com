import type { ExerciseKind } from "@zoeskoul/curriculum-contracts";
import type {
    PracticeProfileConfig,
    ProjectExerciseCandidate,
    ProjectProfileCapability,
    ProjectTopicKind,
} from "../types.js";

export const sharedPracticeProfileConfig: PracticeProfileConfig = {
    tryItDefault: {
        enabled: true,
        placement: "all_sketches",
        sketchIndex: 0,
        allowReveal: true,
    },
    preferredTryItExerciseKind: "code_input",
};

function buildSharedProjectConfig(args: {
    topicKind: ProjectTopicKind;
    preferredProjectExerciseKind?: ExerciseKind | null;
}) {
    if (args.topicKind === "capstone") {
        return {
            preferredProjectExerciseKind:
                args.preferredProjectExerciseKind ?? "code_input",
            minStepCount: 5,
            targetStepCount: 5,
            allowReveal: true,
            tryItDefault: {
                enabled: true,
                placement: "all_sketches" as const,
                sketchIndex: 0,
                allowReveal: true,
            },
            projectFlowDefault: "progressive" as const,
            projectTitle: "Real-World Final Capstone",
            projectStepLabel: "Capstone step",
            startPromptPrefix: "Start the final capstone project.",
            continuePromptPrefix:
                "Continue the final capstone project from the previous working step.",
            helpConcept:
                "The final capstone is progressive. Each step starts from the previous working solution and adds one focused feature.",
        };
    }

    return {
        preferredProjectExerciseKind:
            args.preferredProjectExerciseKind ?? "code_input",
        minStepCount: 3,
        targetStepCount: 3,
        allowReveal: true,
        tryItDefault: {
            enabled: true,
            placement: "all_sketches" as const,
            sketchIndex: 0,
            allowReveal: true,
        },
        projectFlowDefault: "progressive" as const,
        projectTitle: "Real-World Module Project",
        projectStepLabel: "Project step",
        startPromptPrefix: "Start the module project.",
        continuePromptPrefix:
            "Continue the same module project from the previous working step.",
        helpConcept:
            "This module project is progressive. Each step starts from the previous working solution and adds one focused feature.",
    };
}

export function createCodeInputProjectCapability(args?: {
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

            return configArgs.exercise.kind === "code_input";
        },
    };
}
