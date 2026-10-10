import type { TopicAuthoringDraft, TopicSeed } from "@zoeskoul/curriculum-contracts";
import type { ProjectProfileConfig } from "@zoeskoul/curriculum-profiles";

type DraftExercise = TopicAuthoringDraft["quizDraft"][number];
type CodeExercise = Extract<DraftExercise, { kind: "code_input" }>;

function normalizeText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function isSqlQueryExercise(exercise: CodeExercise | undefined): boolean {
    return exercise?.recipeType === "sql_query";
}

function isWebExercise(exercise: CodeExercise | undefined): boolean {
    if (!exercise) return false;

    if (String(exercise.fixedLanguage ?? "").trim().toLowerCase() === "web") {
        return true;
    }

    const entryFilePath = normalizeText(
        (exercise as { entryFilePath?: string }).entryFilePath,
    ).toLowerCase();

    return entryFilePath.endsWith(".html") || entryFilePath.endsWith(".htm");
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

function progressiveHint(stepNumber: number, exercise?: DraftExercise) {
    const webExercise = exercise?.kind === "code_input" && isWebExercise(exercise);

    if (stepNumber === 1) {
        return webExercise
            ? "This is the first project step. Build a clean starting page, then inspect it in the browser preview before moving on."
            : "This is the first project step. Build a clean starting version, then run it before moving on.";
    }

    return webExercise
        ? "Begin with the working HTML from the previous step. Keep that markup, use the browser preview, and add only the next focused structure."
        : "Begin with the working code from the previous step. Keep that code, follow the new comments, and add only the next focused behavior.";
}

function progressiveHelp(args: {
    exercise: DraftExercise;
    projectConfig: ProjectProfileConfig;
    stepNumber: number;
}) {
    const baseHint = progressiveHint(args.stepNumber, args.exercise);

    return {
        concept: args.projectConfig.helpConcept ?? args.exercise.help.concept,
        hint_1: baseHint,
        hint_2:
            args.stepNumber === 1
                ? args.exercise.help.hint_2
                : args.exercise.kind === "code_input" && isWebExercise(args.exercise)
                    ? "Preview the previous working page first, then make only the focused HTML change for this step."
                    : "Run the previous working code first, then make only the focused change for this step.",
    };
}

function progressiveStarterCode(args: {
    exercise: CodeExercise;
    previousExercise?: CodeExercise | undefined;
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

    const commentLines = [
        `${label} ${args.stepNumber}: ${title}`,
        "Keep the working code above from the previous step.",
        `Next, ${shortTask}`,
        "Add only the focused change for this step inside the existing work.",
    ];
    const webExercise = isWebExercise(args.exercise);
    const commentPrefix = isSqlQueryExercise(args.exercise) ? "--" : "#";
    const commentBlock = webExercise
        ? commentLines.map((line) => `<!-- ${line} -->`).join("\n")
        : commentLines.map((line) => `${commentPrefix} ${line}`).join("\n");

    if (webExercise) {
        const closingBody = /<\/body\s*>/i;
        if (closingBody.test(previousSolution)) {
            return ensureTrailingNewline(
                previousSolution.replace(
                    closingBody,
                    `${commentBlock}\n  </body>`,
                ),
            );
        }
    }

    return ensureTrailingNewline(
        [previousSolution, "", commentBlock].filter(Boolean).join("\n"),
    );
}

function progressiveSolutionCode(args: {
    exercise: CodeExercise;
    previousExercise?: CodeExercise | undefined;
    stepNumber: number;
}) {
    const currentSolution = normalizeText(args.exercise.solutionCode);
    if (args.stepNumber === 1 || !args.previousExercise) {
        return currentSolution;
    }

    const previousSolution = normalizeText(args.previousExercise.solutionCode);
    if (!previousSolution) return currentSolution;
    if (!currentSolution) return previousSolution;

    // A progressive SQL step is a replacement query, not an additional
    // statement. Concatenating the previous and current SELECT statements
    // produces a multi-statement recipe that the SQL golden/runtime contract
    // cannot execute as one learner query. The authoring prompt requires each
    // later SQL solution to contain the complete cumulative query.
    if (
        isSqlQueryExercise(args.exercise) ||
        isSqlQueryExercise(args.previousExercise) ||
        isWebExercise(args.exercise) ||
        isWebExercise(args.previousExercise)
    ) {
        return ensureTrailingNewline(currentSolution);
    }

    if (currentSolution.includes(previousSolution)) return currentSolution;

    return ensureTrailingNewline(
        [previousSolution, currentSolution].filter(Boolean).join("\n"),
    );
}

function resolveEntryFilePath(exercise: CodeExercise) {
    const explicit = normalizeText((exercise as { entryFilePath?: string }).entryFilePath);
    if (explicit) return explicit;

    const entryStarter = (exercise.starterFiles ?? []).find(
        (file) => file.isEntry === true || file.entry === true,
    );

    if (entryStarter?.path) {
        return entryStarter.path;
    }

    if (isSqlQueryExercise(exercise)) return "query.sql";
    if (isWebExercise(exercise)) return "index.html";
    return "main.py";
}

function cloneStarterFiles(files: CodeExercise["starterFiles"]) {
    return Array.isArray(files) ? files.map((file) => ({ ...file })) : [];
}

function extractMarkedWorkspaceFiles(source: unknown): Map<string, string> {
    const result = new Map<string, string>();
    const lines = String(source ?? "").replace(/\r\n?/g, "\n").split("\n");
    let currentPath: string | null = null;
    let currentLines: string[] = [];

    function flush() {
        if (!currentPath) return;
        result.set(currentPath, currentLines.join("\n").trimEnd());
    }

    for (const line of lines) {
        const match = /^\s*#\s*([a-zA-Z0-9_.\/-]+\.py)\s*$/.exec(line);
        if (match?.[1]) {
            flush();
            currentPath = match[1];
            currentLines = [];
            continue;
        }

        if (currentPath) {
            currentLines.push(line);
        }
    }

    flush();
    return result;
}

function buildMarkedSolutionFiles(exercise: CodeExercise, entryFilePath: string) {
    const markedFiles = extractMarkedWorkspaceFiles(exercise.solutionCode);
    if (markedFiles.size < 1) return null;

    type StarterDraftFile = NonNullable<CodeExercise["starterFiles"]>[number];
    const merged = new Map<string, StarterDraftFile>();
    const order: string[] = [];

    function upsert(file: StarterDraftFile) {
        if (!file?.path || merged.has(file.path)) return;
        merged.set(file.path, { ...file });
        order.push(file.path);
    }

    for (const file of cloneStarterFiles(exercise.solutionFiles)) upsert(file);
    for (const file of cloneStarterFiles(exercise.starterFiles)) upsert(file);

    for (const [path, content] of markedFiles) {
        if (!merged.has(path)) {
            order.push(path);
        }

        merged.set(path, {
            ...(merged.get(path) ?? { path }),
            path,
            content,
            isEntry: path === entryFilePath,
            entry: path === entryFilePath,
        });
    }

    if (!merged.has(entryFilePath)) {
        order.unshift(entryFilePath);
        merged.set(entryFilePath, {
            path: entryFilePath,
            content: markedFiles.get(entryFilePath) ?? normalizeText(exercise.solutionCode),
            isEntry: true,
            entry: true,
        });
    }

    return order
        .map((path) => merged.get(path))
        .filter((file): file is StarterDraftFile => Boolean(file))
        .map((file) =>
            file.path === entryFilePath
                ? { ...file, isEntry: true, entry: true }
                : { ...file, isEntry: file.isEntry === true ? false : file.isEntry, entry: file.entry === true ? false : file.entry },
        );
}

function entryContentFromMarkedWorkspace(source: string, entryFilePath: string) {
    return extractMarkedWorkspaceFiles(source).get(entryFilePath) ?? source;
}

function buildBaseSolutionFiles(exercise: CodeExercise) {
    const entryFilePath = resolveEntryFilePath(exercise);
    const markedSolutions = buildMarkedSolutionFiles(exercise, entryFilePath);

    if (markedSolutions) {
        return markedSolutions;
    }

    const authoredSolutions = cloneStarterFiles(exercise.solutionFiles);

    if (authoredSolutions.length > 0) {
        const hasEntry = authoredSolutions.some((file) => file.path === entryFilePath);
        if (hasEntry) {
            return authoredSolutions.map((file) =>
                file.path === entryFilePath
                    ? {
                        ...file,
                        content: normalizeText(exercise.solutionCode),
                        isEntry: true,
                        entry: true,
                    }
                    : file,
            );
        }

        return [
            {
                path: entryFilePath,
                content: normalizeText(exercise.solutionCode),
                isEntry: true,
                entry: true,
            },
            ...authoredSolutions,
        ];
    }

    const starterFiles = cloneStarterFiles(exercise.starterFiles);
    if (starterFiles.length > 0) {
        const withEntry = starterFiles.map((file) =>
            file.path === entryFilePath
                ? {
                    ...file,
                    content: normalizeText(exercise.solutionCode),
                    isEntry: true,
                    entry: true,
                }
                : file,
        );

        if (withEntry.some((file) => file.path === entryFilePath)) {
            return withEntry;
        }

        return [
            {
                path: entryFilePath,
                content: normalizeText(exercise.solutionCode),
                isEntry: true,
                entry: true,
            },
            ...withEntry,
        ];
    }

    return [
        {
            path: entryFilePath,
            content: normalizeText(exercise.solutionCode),
            isEntry: true,
            entry: true,
        },
    ];
}

function mergeProgressiveFiles(args: {
    previousExercise: CodeExercise;
    exercise: CodeExercise;
    entryContent: string;
    preferCurrentSolutionFiles: boolean;
}) {
    const previousFiles = buildBaseSolutionFiles(args.previousExercise);
    const currentStarterFiles = cloneStarterFiles(args.exercise.starterFiles);
    const currentSolutionFiles = cloneStarterFiles(args.exercise.solutionFiles);
    const entryFilePath = resolveEntryFilePath(args.exercise);
    type StarterDraftFile = NonNullable<CodeExercise["starterFiles"]>[number];
    const merged = new Map<string, StarterDraftFile>();
    const order: string[] = [];

    function upsert(
        files: NonNullable<CodeExercise["starterFiles"]>,
        mode: "append" | "override",
    ) {
        for (const file of files) {
            if (!file?.path) continue;
            if (!merged.has(file.path)) {
                order.push(file.path);
                merged.set(file.path, { ...file });
                continue;
            }

            if (mode === "override") {
                merged.set(file.path, { ...file });
            }
        }
    }

    const previousPaths = new Set(previousFiles.map((file) => file.path));
    const currentSolutionPaths = new Set(
        currentSolutionFiles.map((file) => file.path),
    );
    const currentStarterFilesForStarter = currentStarterFiles.filter((file) => {
        if (!file?.path) return false;
        if (file.path === entryFilePath) return true;
        if (previousPaths.has(file.path)) return true;
        return !currentSolutionPaths.has(file.path);
    });

    upsert(previousFiles, "append");
    if (args.preferCurrentSolutionFiles) {
        upsert(currentStarterFiles, "append");
        upsert(currentSolutionFiles, "override");
    } else {
        upsert(currentStarterFilesForStarter, "append");
    }

    const existingEntry =
        merged.get(entryFilePath) ??
        currentSolutionFiles.find((file) => file.path === entryFilePath) ??
        currentStarterFiles.find((file) => file.path === entryFilePath) ??
        previousFiles.find((file) => file.path === entryFilePath);

    merged.set(entryFilePath, {
        ...(existingEntry ?? { path: entryFilePath }),
        path: entryFilePath,
        content: entryContentFromMarkedWorkspace(args.entryContent, entryFilePath),
        isEntry: true,
        entry: true,
    });

    if (!order.includes(entryFilePath)) {
        order.unshift(entryFilePath);
    }

    return order
        .map((path) => merged.get(path))
        .filter((file): file is NonNullable<typeof file> => Boolean(file));
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
    const originalCodeInputById = new Map(
        args.exercises
            .filter(
                (exercise): exercise is Extract<DraftExercise, { kind: "code_input" }> =>
                    exercise.kind === "code_input",
            )
            .map((exercise) => [exercise.id, exercise]),
    );
    const transformedCodeInputById = new Map<string, CodeExercise>();

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
            hint: progressiveHint(stepNumber, exercise),
            help: progressiveHelp({
                exercise,
                projectConfig,
                stepNumber,
            }),
        };

        if (exercise.kind !== "code_input") {
            return nextExercise;
        }

        const previousStepId = stepIndex > 0 ? args.projectStepIds[stepIndex - 1] : undefined;
        const previousExercise = previousStepId
            ? transformedCodeInputById.get(previousStepId) ?? originalCodeInputById.get(previousStepId)
            : undefined;

        const starterCode = progressiveStarterCode({
            exercise,
            previousExercise,
            projectConfig,
            stepNumber,
        });
        const solutionCode = progressiveSolutionCode({
            exercise,
            previousExercise,
            stepNumber,
        });

        const transformedExercise: CodeExercise = {
            ...(nextExercise as CodeExercise),
            starterCode,
            solutionCode,
            ...(previousExercise
                ? {
                    starterFiles: mergeProgressiveFiles({
                        previousExercise,
                        exercise,
                        entryContent: starterCode,
                        preferCurrentSolutionFiles: false,
                    }),
                    solutionFiles: mergeProgressiveFiles({
                        previousExercise,
                        exercise: {
                            ...exercise,
                            solutionCode,
                        },
                        entryContent: solutionCode,
                        preferCurrentSolutionFiles: true,
                    }),
                }
                : {}),
        };

        transformedCodeInputById.set(exercise.id, transformedExercise);
        return transformedExercise;
    });
}
