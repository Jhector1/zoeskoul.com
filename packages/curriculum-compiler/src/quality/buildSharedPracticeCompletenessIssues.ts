import type {
    ProgrammingCodeInputStarterFileDraft,
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import type { CritiqueIssue } from "@zoeskoul/curriculum-profiles";
import { getCurriculumProfile } from "@zoeskoul/curriculum-profiles";
import { resolveTopicProjectKind } from "../emit/exerciseMessageBase.js";
import { applyProgressiveProjectFlow } from "../emit/progressiveProjectFlow.js";
import {
    resolveTryItExerciseIdForSketch,
    resolveTryItSketchIndexes,
} from "../emit/projectTopicEmission.js";
import {
    buildTryItPrompt,
    buildTryItTitle,
    hasGenericTryItText,
} from "../emit/tryItText.js";

function normalizeText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

const GENERIC_PROJECT_TITLES = [
    /^project$/i,
    /^module project$/i,
    /^capstone$/i,
    /^final capstone project$/i,
    /^real-world module project$/i,
    /^real-world final capstone$/i,
    /^practice$/i,
] as const;

const STORY_CONTEXT_PATTERNS = [
    /\bclient\b/i,
    /\bcustomer\b/i,
    /\bteam\b/i,
    /\bclinic\b/i,
    /\bschool\b/i,
    /\bstore\b/i,
    /\bnonprofit\b/i,
    /\bevent\b/i,
    /\bsupport desk\b/i,
    /\bresearch lab\b/i,
    /\boperations\b/i,
    /\bmanager\b/i,
    /\banalyst\b/i,
    /\bcoordinator\b/i,
    /\breport\b/i,
    /\bdeliverable\b/i,
    /\bapplication\b/i,
    /\btracker\b/i,
    /\baccount\b/i,
    /\bworkflow\b/i,
    /\bdashboard\b/i,
    /\bservice\b/i,
    /\boperations team\b/i,
    /\blearner role\b/i,
    /\byou will build\b/i,
] as const;

type DraftExercise = TopicAuthoringDraft["quizDraft"][number];
type DraftCodeInput = Extract<DraftExercise, { kind: "code_input" }>;

function isCodeInput(exercise: DraftExercise): exercise is DraftCodeInput {
    return exercise.kind === "code_input";
}

function normalizeFiles(
    files: ProgrammingCodeInputStarterFileDraft[] | undefined,
): Array<{ path: string; content: string }> {
    if (!Array.isArray(files)) return [];

    return files
        .map((file) => ({
            path: normalizeText(file?.path),
            content: String(file?.content ?? ""),
        }))
        .filter((file) => file.path.length > 0);
}

function normalizeCode(value: unknown) {
    return normalizeText(value)
        .replace(/\r\n/g, "\n")
        .replace(/[ \t]+$/gm, "")
        .trim();
}

function isTerminalWorkspaceExercise(exercise: DraftCodeInput): boolean {
    return normalizeText((exercise as DraftCodeInput & { mode?: unknown }).mode) === "terminal_workspace";
}

function workspaceExpectationPathSet(exercise: DraftCodeInput): Set<string> {
    const expectations = (exercise as DraftCodeInput & {
        workspaceExpectations?: {
            requiredFiles?: unknown[];
            requiredFolders?: unknown[];
        };
    }).workspaceExpectations;

    const paths = new Set<string>();
    for (const value of expectations?.requiredFolders ?? []) {
        const path = normalizeText(value);
        if (path) paths.add(path);
    }
    for (const value of expectations?.requiredFiles ?? []) {
        const path = normalizeText(value);
        if (path) paths.add(path);
    }

    return paths;
}

function buildMultiFileSolutionIssues(exercise: DraftCodeInput): CritiqueIssue[] {
    const starterFiles = normalizeFiles(exercise.starterFiles);
    const solutionFiles = normalizeFiles(exercise.solutionFiles);
    const starterPaths = starterFiles.map((file) => file.path);
    const solutionPathSet = new Set(solutionFiles.map((file) => file.path));
    const isMultiFile = starterPaths.length > 1 || solutionFiles.length > 1;

    if (!isMultiFile) return [];

    if (solutionFiles.length === 0) {
        return [{
            code: "MULTI_FILE_SOLUTION_FILES_MISSING",
            category: "clarity",
            severity: "error",
            exerciseId: exercise.id,
            message:
                `Exercise "${exercise.id}" uses a multi-file workspace but does not include complete solutionFiles for reveal/fill solution.`,
        }];
    }

    const missingPaths = starterPaths.filter((path) => !solutionPathSet.has(path));
    if (missingPaths.length === 0) return [];

    return [{
        code: "MULTI_FILE_SOLUTION_FILES_INCOMPLETE",
        category: "clarity",
        severity: "error",
        exerciseId: exercise.id,
        message:
            `Exercise "${exercise.id}" solutionFiles are missing starter paths: ${missingPaths.join(", ")}. Reveal/fill solution must cover the full workspace.`,
    }];
}

function hasRealWorldStory(text: string) {
    return STORY_CONTEXT_PATTERNS.some((pattern) => pattern.test(text));
}

function pathSetForSolution(exercise: DraftCodeInput) {
    const paths = new Set<string>();
    for (const file of normalizeFiles(exercise.solutionFiles)) paths.add(file.path);

    if (isTerminalWorkspaceExercise(exercise)) {
        for (const path of workspaceExpectationPathSet(exercise)) paths.add(path);
        return paths;
    }

    for (const file of normalizeFiles(exercise.starterFiles)) paths.add(file.path);
    if (normalizeText(exercise.entryFilePath)) paths.add(normalizeText(exercise.entryFilePath));
    return paths;
}

function pathSetForStarter(exercise: DraftCodeInput) {
    const paths = new Set<string>();

    if (isTerminalWorkspaceExercise(exercise)) {
        for (const path of workspaceExpectationPathSet(exercise)) paths.add(path);
    }

    for (const file of normalizeFiles(exercise.starterFiles)) paths.add(file.path);
    if (!isTerminalWorkspaceExercise(exercise) && normalizeText(exercise.entryFilePath)) {
        paths.add(normalizeText(exercise.entryFilePath));
    }
    return paths;
}

function orderedProjectCodeInputs(args: {
    draft: TopicAuthoringDraft;
    codeInputs: DraftCodeInput[];
}) {
    const byId = new Map(args.codeInputs.map((exercise) => [exercise.id, exercise]));
    const orderedIds = Array.isArray(args.draft.projectDraft?.stepIds)
        ? args.draft.projectDraft.stepIds
            .map(normalizeText)
            .filter((id) => byId.has(id))
        : [];

    const seen = new Set<string>();
    const ordered: DraftCodeInput[] = [];
    for (const id of orderedIds) {
        const exercise = byId.get(id);
        if (exercise && !seen.has(id)) {
            seen.add(id);
            ordered.push(exercise);
        }
    }

    for (const exercise of args.codeInputs) {
        if (!seen.has(exercise.id)) {
            seen.add(exercise.id);
            ordered.push(exercise);
        }
    }

    return ordered;
}

function projectStepIdsForDraft(args: {
    draft: TopicAuthoringDraft;
    codeInputs: DraftCodeInput[];
}) {
    return orderedProjectCodeInputs(args).map((exercise) => exercise.id);
}

function effectiveProjectCodeInputs(args: {
    draft: TopicAuthoringDraft;
    seed: TopicSeed;
    profile: ReturnType<typeof getCurriculumProfile>;
    codeInputs: DraftCodeInput[];
}) {
    const topicKind = resolveTopicProjectKind(args.seed);
    if (!topicKind) return args.codeInputs;

    const orderedCodeInputs = orderedProjectCodeInputs({
        draft: args.draft,
        codeInputs: args.codeInputs,
    });
    const projectConfig = args.profile.project?.getProjectConfig({
        seed: args.seed,
        topicKind,
    });
    if (!projectConfig) return orderedCodeInputs;

    const projectStepIds = projectStepIdsForDraft({
        draft: args.draft,
        codeInputs: args.codeInputs,
    });
    if (projectStepIds.length < 1) return orderedCodeInputs;

    return applyProgressiveProjectFlow({
        exercises: orderedCodeInputs,
        projectStepIds,
        projectConfig,
        seed: args.seed,
    }).filter(isCodeInput);
}

function buildProgressiveProjectIssues(args: {
    seed: TopicSeed;
    codeInputs: DraftCodeInput[];
}): CritiqueIssue[] {
    const issues: CritiqueIssue[] = [];
    const requiresCumulative =
        args.seed.practice?.projectFlow === "progressive" ||
        args.seed.sectionRole === "module_project" ||
        args.seed.sectionRole === "capstone" ||
        args.seed.moduleRole === "capstone" ||
        args.seed.authoringPolicy?.projectRequirements?.requireCumulativeChaining === true;

    if (!requiresCumulative || args.codeInputs.length < 2) return issues;

    for (let index = 1; index < args.codeInputs.length; index += 1) {
        const previous = args.codeInputs[index - 1];
        const current = args.codeInputs[index];
        const previousSolution = normalizeCode(previous.solutionCode);
        const currentStarter = normalizeCode(current.starterCode);
        const previousSolutionPaths = pathSetForSolution(previous);
        const currentStarterPaths = pathSetForStarter(current);
        const previousSolutionFilePaths = Array.from(previousSolutionPaths);

        const carriesSingleFileForward =
            !isTerminalWorkspaceExercise(current) &&
            previousSolution.length > 0 &&
            currentStarter.length > 0 &&
            currentStarter.includes(previousSolution.slice(0, Math.min(previousSolution.length, 400)));
        const carriesWorkspaceForward =
            previousSolutionFilePaths.length > 0 &&
            previousSolutionFilePaths.every((path) => currentStarterPaths.has(path));
        const noStructuredPaths = previousSolutionPaths.size === 0 && currentStarterPaths.size === 0;

        if (!carriesSingleFileForward && !carriesWorkspaceForward && !noStructuredPaths) {
            issues.push({
                code: "PROJECT_STEP_CHAINING_MISSING",
                category: "clarity",
                severity: "error",
                exerciseId: current.id,
                message:
                    `Project step "${current.id}" does not appear to start from the previous step's working solution/workspace. Progressive module projects and capstones must chain starter state forward.`,
            });
        }
    }

    return issues;
}

export function buildSharedPracticeCompletenessIssues(args: {
    draft: TopicAuthoringDraft;
    seed: TopicSeed;
}): CritiqueIssue[] {
    const issues: CritiqueIssue[] = [];
    if (!normalizeText(args.seed.profileId)) {
        return issues;
    }

    const profile = getCurriculumProfile(args.seed.profileId);
    const codeInputs = args.draft.quizDraft.filter(isCodeInput);

    for (const exercise of codeInputs) {
        issues.push(...buildMultiFileSolutionIssues(exercise));
    }

    if (args.seed.practice?.tryIt === true) {
        const tryItSketchIndexes = resolveTryItSketchIndexes(
            args.draft,
            args.seed,
            profile,
        );
        const preferredKind = profile.practice?.preferredTryItExerciseKind ?? null;
        const seenPrompts = new Map<string, string>();

        if (
            args.seed.practice?.requiresTryIt === true &&
            args.draft.sketchBlocks.length > 0 &&
            tryItSketchIndexes.length === 0
        ) {
            issues.push({
                code: "TRY_IT_SKETCH_COVERAGE_MISSING",
                category: "clarity",
                severity: "error",
                message:
                    "This hands-on topic requires Try It coverage, but no sketch is configured to receive an embedded Try It exercise.",
            });
        }

        for (const sketchIndex of tryItSketchIndexes) {
            const exerciseId = resolveTryItExerciseIdForSketch({
                draft: args.draft,
                exercises: args.draft.quizDraft,
                preferredKind,
                profile,
                seed: args.seed,
                sketchIndex,
            });
            const exercise = exerciseId
                ? args.draft.quizDraft.find((item) => item.id === exerciseId)
                : undefined;

            if (!exercise) {
                issues.push({
                    code: "TRY_IT_SKETCH_EXERCISE_MISSING",
                    category: "clarity",
                    severity: "error",
                    message:
                        `Sketch ${sketchIndex + 1} is configured for Try It, but no matching exercise was found. Every hands-on sketch needs a concrete Try It exercise or an explicit conceptual-only override.`,
                });
                continue;
            }

            const tryItTitle = buildTryItTitle(exercise.title);
            const tryItPrompt = buildTryItPrompt({
                exerciseTitle: exercise.title,
                exercisePrompt: exercise.prompt,
                topicTitle: args.draft.title,
                seed: args.seed,
            });

            if (
                hasGenericTryItText(normalizeText(exercise.prompt)) ||
                hasGenericTryItText(tryItPrompt)
            ) {
                issues.push({
                    code: "TRY_IT_GENERIC_MESSAGE",
                    category: "clarity",
                    severity: "error",
                    message: `Try It for sketch ${sketchIndex + 1} uses a generic instructional message. Make the task specific to the learner's output and the topic context.`,
                });
            }

            const normalizedPrompt = normalizeText(tryItPrompt).toLowerCase();
            const prior = seenPrompts.get(normalizedPrompt);
            if (normalizedPrompt && prior) {
                issues.push({
                    code: "TRY_IT_DUPLICATE_MESSAGE",
                    category: "clarity",
                    severity: "error",
                    message: `Try It messages must be unique per sketch. "${tryItTitle}" duplicates the message already used for "${prior}".`,
                });
            } else if (normalizedPrompt) {
                seenPrompts.set(normalizedPrompt, tryItTitle);
            }
        }
    }

    if (
        args.seed.sectionRole === "module_project" ||
        args.seed.sectionRole === "capstone" ||
        args.seed.moduleRole === "capstone"
    ) {
        if (!Array.isArray(args.draft.sketchBlocks) || args.draft.sketchBlocks.length < 1) {
            issues.push({
                code: "PROJECT_SYNOPSIS_SKETCH_COUNT",
                category: "pedagogy",
                severity: "error",
                message:
                    "Module projects and final capstones must have one teaching sketch that introduces the project synopsis. The emitter keeps only the first synopsis sketch and represents the actual work as project steps.",
            });
        }

        const candidateTitles = [
            normalizeText(args.draft.projectDraft?.title),
            normalizeText(args.draft.title),
            normalizeText(args.seed.title),
        ].filter(Boolean);
        const combinedProjectText = [
            ...candidateTitles,
            args.draft.summary,
            ...args.draft.sketchBlocks.map((block) => block.title),
            ...args.draft.sketchBlocks.map((block) => block.bodyMarkdown),
            ...codeInputs.map((exercise) => exercise.title),
            ...codeInputs.map((exercise) => exercise.prompt),
        ].map(normalizeText).join("\n");

        if (
            candidateTitles.length > 0 &&
            candidateTitles.every((title) =>
                GENERIC_PROJECT_TITLES.some((pattern) => pattern.test(title)),
            )
        ) {
            issues.push({
                code: "PROJECT_STORY_CONTEXT_MISSING",
                category: "clarity",
                severity: "error",
                message:
                    "Project and capstone topics need a real-world, story-based project title instead of a generic label.",
            });
        }

        if (
            args.seed.authoringPolicy?.projectRequirements?.requireRealWorldStory === true &&
            !hasRealWorldStory(combinedProjectText)
        ) {
            issues.push({
                code: "PROJECT_REAL_WORLD_SCENARIO_MISSING",
                category: "clarity",
                severity: "error",
                message:
                    "Project and capstone topics must include a believable real-world scenario, learner role, concrete files/tables/folders, and a useful deliverable.",
            });
        }

        const projectCodeInputs = effectiveProjectCodeInputs({
            draft: args.draft,
            seed: args.seed,
            profile,
            codeInputs,
        });

        issues.push(...buildProgressiveProjectIssues({
            seed: args.seed,
            codeInputs: projectCodeInputs,
        }));
    }

    return issues;
}
