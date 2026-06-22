function normalizeText(value) {
    return typeof value === "string" ? value.trim() : "";
}
function ensureTrailingNewline(value) {
    return value.endsWith("\n") ? value : `${value}\n`;
}
function stripTrailingPunctuation(value) {
    return value.replace(/[.!?]+$/g, "").trim();
}
function shortTaskFromPrompt(prompt) {
    const normalized = normalizeText(prompt)
        .split(/\r?\n/)[0]
        ?.trim() ?? "";
    if (!normalized)
        return "follow the next focused task";
    const sentence = normalized.split(/(?<=[.!?])\s+/)[0] ?? normalized;
    return stripTrailingPunctuation(sentence) || "follow the next focused task";
}
function progressivePrompt(args) {
    const originalPrompt = normalizeText(args.exercise.prompt);
    const suffix = originalPrompt ||
        `complete ${args.projectConfig.projectStepLabel ?? "the next project step"}`;
    if (args.stepNumber === 1) {
        return `${args.projectConfig.startPromptPrefix ?? "Start the project."} In step 1 of ${args.totalSteps}, ${suffix}`;
    }
    return `${args.projectConfig.continuePromptPrefix ?? "Continue the same project from the previous working step."} In step ${args.stepNumber} of ${args.totalSteps}, ${suffix}`;
}
function progressiveHint(stepNumber) {
    if (stepNumber === 1) {
        return "This is the first project step. Build a clean starting version, then run it before moving on.";
    }
    return "Begin with the working code from the previous step. Keep that code, follow the new comments, and add only the next focused behavior.";
}
function progressiveHelp(args) {
    const baseHint = progressiveHint(args.stepNumber);
    return {
        concept: args.projectConfig.helpConcept ?? args.exercise.help.concept,
        hint_1: baseHint,
        hint_2: args.stepNumber === 1
            ? args.exercise.help.hint_2
            : "Run the previous working code first, then make only the focused change for this step.",
    };
}
function progressiveStarterCode(args) {
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
    return ensureTrailingNewline([previousSolution, "", commentBlock].filter(Boolean).join("\n"));
}
function resolveEntryFilePath(exercise) {
    const explicit = normalizeText(exercise.entryFilePath);
    if (explicit)
        return explicit;
    const entryStarter = (exercise.starterFiles ?? []).find((file) => file.isEntry === true || file.entry === true);
    if (entryStarter?.path) {
        return entryStarter.path;
    }
    return "main.py";
}
function cloneStarterFiles(files) {
    return Array.isArray(files) ? files.map((file) => ({ ...file })) : [];
}
function buildBaseSolutionFiles(exercise) {
    const entryFilePath = resolveEntryFilePath(exercise);
    const authoredSolutions = cloneStarterFiles(exercise.solutionFiles);
    if (authoredSolutions.length > 0) {
        const hasEntry = authoredSolutions.some((file) => file.path === entryFilePath);
        if (hasEntry) {
            return authoredSolutions.map((file) => file.path === entryFilePath
                ? {
                    ...file,
                    content: normalizeText(exercise.solutionCode),
                    isEntry: true,
                    entry: true,
                }
                : file);
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
        const withEntry = starterFiles.map((file) => file.path === entryFilePath
            ? {
                ...file,
                content: normalizeText(exercise.solutionCode),
                isEntry: true,
                entry: true,
            }
            : file);
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
function mergeProgressiveFiles(args) {
    const previousFiles = buildBaseSolutionFiles(args.previousExercise);
    const currentStarterFiles = cloneStarterFiles(args.exercise.starterFiles);
    const currentSolutionFiles = cloneStarterFiles(args.exercise.solutionFiles);
    const entryFilePath = resolveEntryFilePath(args.exercise);
    const merged = new Map();
    const order = [];
    function upsert(files, mode) {
        for (const file of files) {
            if (!file?.path)
                continue;
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
    upsert(previousFiles, "append");
    upsert(currentStarterFiles, "append");
    if (args.preferCurrentSolutionFiles) {
        upsert(currentSolutionFiles, "override");
    }
    else {
        upsert(currentSolutionFiles, "append");
    }
    const existingEntry = merged.get(entryFilePath) ??
        currentSolutionFiles.find((file) => file.path === entryFilePath) ??
        currentStarterFiles.find((file) => file.path === entryFilePath) ??
        previousFiles.find((file) => file.path === entryFilePath);
    merged.set(entryFilePath, {
        ...(existingEntry ?? { path: entryFilePath }),
        path: entryFilePath,
        content: args.entryContent,
        isEntry: true,
        entry: true,
    });
    if (!order.includes(entryFilePath)) {
        order.unshift(entryFilePath);
    }
    return order
        .map((path) => merged.get(path))
        .filter(Boolean);
}
export function applyProgressiveProjectFlow(args) {
    if (args.seed.practice?.projectFlow !== "progressive" ||
        !args.projectConfig ||
        args.projectStepIds.length < 1) {
        return args.exercises;
    }
    const stepIndexById = new Map(args.projectStepIds.map((id, index) => [id, index]));
    const codeInputById = new Map(args.exercises
        .filter((exercise) => exercise.kind === "code_input")
        .map((exercise) => [exercise.id, exercise]));
    return args.exercises.map((exercise) => {
        const stepIndex = stepIndexById.get(exercise.id);
        if (typeof stepIndex !== "number")
            return exercise;
        const stepNumber = stepIndex + 1;
        const nextExercise = {
            ...exercise,
            prompt: progressivePrompt({
                exercise,
                projectConfig: args.projectConfig,
                stepNumber,
                totalSteps: args.projectStepIds.length,
            }),
            hint: progressiveHint(stepNumber),
            help: progressiveHelp({
                exercise,
                projectConfig: args.projectConfig,
                stepNumber,
            }),
        };
        if (exercise.kind !== "code_input") {
            return nextExercise;
        }
        const previousExercise = stepIndex > 0
            ? codeInputById.get(args.projectStepIds[stepIndex - 1])
            : undefined;
        return {
            ...nextExercise,
            starterCode: progressiveStarterCode({
                exercise,
                previousExercise,
                projectConfig: args.projectConfig,
                stepNumber,
            }),
            ...(previousExercise
                ? {
                    starterFiles: mergeProgressiveFiles({
                        previousExercise,
                        exercise,
                        entryContent: progressiveStarterCode({
                            exercise,
                            previousExercise,
                            projectConfig: args.projectConfig,
                            stepNumber,
                        }),
                        preferCurrentSolutionFiles: false,
                    }),
                    solutionFiles: mergeProgressiveFiles({
                        previousExercise,
                        exercise,
                        entryContent: normalizeText(exercise.solutionCode),
                        preferCurrentSolutionFiles: true,
                    }),
                }
                : {}),
        };
    });
}
