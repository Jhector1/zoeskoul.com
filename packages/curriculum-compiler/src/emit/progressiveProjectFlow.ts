import type { TopicAuthoringDraft, TopicSeed } from "@zoeskoul/curriculum-contracts";
import type { ProjectProfileConfig } from "@zoeskoul/curriculum-profiles";

type DraftExercise = TopicAuthoringDraft["quizDraft"][number];

function normalizeText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function ensureTrailingNewline(value: string): string {
    return value.endsWith("\n") ? value : `${value}\n`;
}

function stripTrailingPunctuation(value: string): string {
    return value.replace(/[.!?]+$/g, "").trim();
}

function shortTaskFromPrompt(prompt: string): string {
    const normalized = normalizeText(prompt)
        .split(/\r?\n/)[0]
        ?.trim() ?? "";

    if (!normalized) return "follow the next focused task";

    const sentence = normalized.split(/(?<=[.!?])\s+/)[0] ?? normalized;
    return stripTrailingPunctuation(sentence) || "follow the next focused task";
}

function progressivePrompt(args: {
    exercise: DraftExercise;
    projectConfig: ProjectProfileConfig;
    stepNumber: number;
    totalSteps: number;
}) {
    const originalPrompt = normalizeText(args.exercise.prompt);
    const suffix =
        originalPrompt ||
        `complete ${args.projectConfig.projectStepLabel ?? "the next project step"}`;

    if (args.stepNumber === 1) {
        return `${args.projectConfig.startPromptPrefix ?? "Start the project."} In step 1 of ${args.totalSteps}, ${suffix}`;
    }

    return `${args.projectConfig.continuePromptPrefix ?? "Continue the same project from the previous working step."} In step ${args.stepNumber} of ${args.totalSteps}, ${suffix}`;
}

function progressiveHint(stepNumber: number) {
    if (stepNumber === 1) {
        return "This is the first project step. Build a clean starting version, then run it before moving on.";
    }

    return "Begin with the working code from the previous step. Keep that code, follow the new comments, and add only the next focused behavior.";
}

function progressiveHelp(args: {
    exercise: DraftExercise;
    projectConfig: ProjectProfileConfig;
    stepNumber: number;
}) {
    const baseHint = progressiveHint(args.stepNumber);

    return {
        concept: args.projectConfig.helpConcept ?? args.exercise.help.concept,
        hint_1: baseHint,
        hint_2:
            args.stepNumber === 1
                ? args.exercise.help.hint_2
                : "Run the previous working code first, then make only the focused change for this step.",
    };
}

function progressiveStarterCode(args: {
    exercise: Extract<DraftExercise, { kind: "code_input" }>;
    previousExercise?: Extract<DraftExercise, { kind: "code_input" }> | undefined;
    projectConfig: ProjectProfileConfig;
    stepNumber: number;
}) {
    if (args.stepNumber === 1 || !args.previousExercise) {
        return args.exercise.starterCode;
    }

    const previousSolution = normalizeText(args.previousExercise.solutionCode);
    const label = args.projectConfig.projectStepLabel ?? "Project step";
    const title = normalizeText(args.exercise.title) || `${label} ${args.stepNumber}`;
    const shortTask = shortTaskFromPrompt(args.exercise.prompt);

    const commentBlock = [
        `# ${label} ${args.stepNumber}: ${title}`,
        "# Keep the working code above from the previous step.",
        `# Next, ${shortTask}`,
        "# Add only the focused change for this step below or inside the existing work.",
    ].join("\n");

    return ensureTrailingNewline(
        [previousSolution, "", commentBlock].filter(Boolean).join("\n"),
    );
}

export function applyProgressiveProjectFlow(args: {
    exercises: DraftExercise[];
    projectStepIds: string[];
    projectConfig: ProjectProfileConfig | null | undefined;
    seed: TopicSeed;
}) {
    if (
        args.seed.practice?.projectFlow !== "progressive" ||
        !args.projectConfig ||
        args.projectStepIds.length < 1
    ) {
        return args.exercises;
    }

    const projectConfig = args.projectConfig;

    const stepIndexById = new Map(
        args.projectStepIds.map((id, index) => [id, index]),
    );
    const codeInputById = new Map(
        args.exercises
            .filter(
                (exercise): exercise is Extract<DraftExercise, { kind: "code_input" }> =>
                    exercise.kind === "code_input",
            )
            .map((exercise) => [exercise.id, exercise]),
    );

    return args.exercises.map((exercise) => {
        const stepIndex = stepIndexById.get(exercise.id);
        if (typeof stepIndex !== "number") return exercise;

        const stepNumber = stepIndex + 1;
        const nextExercise = {
            ...exercise,
            prompt: progressivePrompt({
                exercise,
                projectConfig,
                stepNumber,
                totalSteps: args.projectStepIds.length,
            }),
            hint: progressiveHint(stepNumber),
            help: progressiveHelp({
                exercise,
                projectConfig,
                stepNumber,
            }),
        };

        if (exercise.kind !== "code_input") {
            return nextExercise;
        }

        const previousExercise =
            stepIndex > 0
                ? codeInputById.get(args.projectStepIds[stepIndex - 1])
                : undefined;

        return {
            ...nextExercise,
            starterCode: progressiveStarterCode({
                exercise,
                previousExercise,
                projectConfig,
                stepNumber,
            }),
        };
    });
}
