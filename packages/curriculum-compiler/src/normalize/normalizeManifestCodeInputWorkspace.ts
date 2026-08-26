import { isDeepStrictEqual } from "node:util";
import type {
    ManifestCodeInput,
    ManifestCodeInputCompilerInput,
    ManifestStarterFile,
    ManifestStarterFiles,
} from "@zoeskoul/curriculum-contracts";

function defaultEntryFile(language: unknown): string {
    switch (language) {
        case "javascript": return "main.js";
        case "java": return "Main.java";
        case "r": return "main.R";
        case "c": return "main.c";
        case "cpp": return "main.cpp";
        case "bash": return "main.sh";
        case "sql": return "query.sql";
        default: return "main.py";
    }
}

function filePath(file: ManifestStarterFile): string {
    return String(file.path ?? file.name ?? "").trim();
}

function canonicalStarterFiles(args: {
    starterCode?: string;
    starterFiles?: ManifestStarterFiles;
    entryFilePath: string;
}): ManifestStarterFiles | undefined {
    const { starterCode, starterFiles, entryFilePath } = args;
    if (starterCode === undefined) return starterFiles;

    if (Array.isArray(starterFiles)) {
        const entryIndex = starterFiles.findIndex((file) =>
            filePath(file) === entryFilePath || file.isEntry === true || file.entry === true,
        );

        if (entryIndex < 0) {
            return [
                {
                    path: entryFilePath,
                    content: starterCode,
                    isEntry: true,
                    entry: true,
                },
                ...starterFiles,
            ];
        }

        return starterFiles.map((file, index) =>
            index === entryIndex
                ? {
                    ...file,
                    path: filePath(file) || entryFilePath,
                    content: starterCode,
                    isEntry: true,
                    entry: true,
                  }
                : file,
        );
    }

    if (starterFiles && typeof starterFiles === "object") {
        const current = starterFiles[entryFilePath];
        return {
            ...starterFiles,
            [entryFilePath]:
                current && typeof current === "object"
                    ? { ...current, content: starterCode, isEntry: true, entry: true }
                    : { content: starterCode, isEntry: true, entry: true },
        };
    }

    return [{
        path: entryFilePath,
        content: starterCode,
        isEntry: true,
        entry: true,
    }];
}

function resolveCompatibleAlias<T>(args: {
    label: string;
    legacy: T | undefined;
    workspace: T | undefined;
}): T | undefined {
    if (
        args.legacy !== undefined &&
        args.workspace !== undefined &&
        !isDeepStrictEqual(args.legacy, args.workspace)
    ) {
        throw new Error(
            `Conflicting code_input ${args.label}: legacy top-level and workspace values differ. ` +
                "Normalize the authored exercise instead of choosing a silent fallback.",
        );
    }

    return args.workspace !== undefined
        ? args.workspace
        : args.legacy;
}

/**
 * Transitional compiler boundary for code-input workspace normalization.
 *
 * `workspace` is the canonical published runtime representation. Historical
 * top-level aliases are accepted only at this compiler ingress when they agree
 * with the workspace value or when the workspace value is missing.
 *
 * This function deliberately refuses conflicting duplicate state. It hydrates
 * the canonical workspace first, then strips `starterCode` and `starterFiles`
 * from the returned manifest so published learner runtime has one starter
 * owner. The input object itself is never mutated.
 */
export function normalizeManifestCodeInputWorkspace(
    exercise: ManifestCodeInputCompilerInput,
): ManifestCodeInput {
    const currentWorkspace = exercise.workspace ?? {};

    const starterCode = resolveCompatibleAlias({
        label: "starterCode",
        legacy:
            typeof exercise.starterCode === "string"
                ? exercise.starterCode
                : undefined,
        workspace: undefined,
    });

    const starterFiles = resolveCompatibleAlias<ManifestStarterFiles>({
        label: "starterFiles",
        legacy: exercise.starterFiles,
        workspace: currentWorkspace.starterFiles,
    });

    const workspaceExpectations = resolveCompatibleAlias({
        label: "workspaceExpectations",
        legacy: exercise.workspaceExpectations,
        workspace: currentWorkspace.workspaceExpectations,
    });

    const language = resolveCompatibleAlias({
        label: "language",
        legacy: exercise.language,
        workspace: currentWorkspace.language,
    });

    const entryFilePath =
        currentWorkspace.entryFilePath ??
        currentWorkspace.entryFile ??
        currentWorkspace.mainFilePath ??
        currentWorkspace.mainFile ??
        (Array.isArray(starterFiles)
            ? filePath(
                starterFiles.find((file) => file.isEntry === true || file.entry === true) ??
                starterFiles[0] ?? {},
              )
            : "") ??
        defaultEntryFile(language);
    const normalizedEntryFilePath = entryFilePath || defaultEntryFile(language);
    const normalizedStarterFiles = canonicalStarterFiles({
        starterCode,
        starterFiles,
        entryFilePath: normalizedEntryFilePath,
    });

    const workspaceFirstExercise = { ...exercise } as Record<string, unknown>;
    delete workspaceFirstExercise.starterCode;
    delete workspaceFirstExercise.starterFiles;

    const normalizedWorkspace = { ...currentWorkspace } as Record<string, unknown>;
    delete normalizedWorkspace.starterCode;

    return {
        ...workspaceFirstExercise as ManifestCodeInput,
        workspace: {
            ...normalizedWorkspace,
            ...(language !== undefined ? { language } : {}),
            entryFilePath: normalizedEntryFilePath,
            ...(normalizedStarterFiles !== undefined
                ? { starterFiles: normalizedStarterFiles }
                : {}),
            ...(workspaceExpectations !== undefined
                ? { workspaceExpectations }
                : {}),
        },
    };
}
