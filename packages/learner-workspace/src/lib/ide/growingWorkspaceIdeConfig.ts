import type { LearningIdeConfig } from "./learningIdeConfig";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function filePaths(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value
            .map((entry) =>
                isRecord(entry) && typeof entry.path === "string"
                    ? entry.path.trim()
                    : "",
            )
            .filter(Boolean);
    }

    if (isRecord(value)) {
        return Object.keys(value).filter(Boolean);
    }

    return [];
}

function firstUsablePaths(...values: unknown[]): string[] {
    for (const value of values) {
        const paths = filePaths(value);
        if (paths.length > 0) return paths;
    }

    return [];
}

function firstRecord(...values: unknown[]): UnknownRecord | null {
    for (const value of values) {
        if (isRecord(value)) return value;
    }

    return null;
}

function dedupe(paths: string[]) {
    return Array.from(new Set(paths));
}

/**
 * Runtime-only learner capability inference.
 *
 * A project step needs the file workspace when:
 * - its starter already contains multiple files, or
 * - its private solution introduces at least one path that is absent from the
 *   current starter.
 *
 * Only booleans are copied into ideConfig. Solution paths/content never move
 * into the IDE capability contract.
 */
export function projectStepNeedsFileWorkspace(step: unknown): boolean {
    if (!isRecord(step)) return false;

    const workspace = firstRecord(step.workspace);
    const recipe = firstRecord(step.recipe);
    const workspaceRecipe = firstRecord(workspace?.recipe);

    const starterPaths = dedupe(
        firstUsablePaths(
            step.starterFiles,
            workspace?.starterFiles,
            recipe?.starterFiles,
            workspaceRecipe?.starterFiles,
        ),
    );

    const solutionPaths = dedupe(
        firstUsablePaths(
            step.solutionFiles,
            recipe?.solutionFiles,
            workspace?.solutionFiles,
            workspaceRecipe?.solutionFiles,
        ),
    );

    if (starterPaths.length > 1) return true;
    if (starterPaths.length == 0 || solutionPaths.length == 0) return false;

    const starterSet = new Set(starterPaths);
    return solutionPaths.some((path) => !starterSet.has(path));
}

export function withGrowingWorkspaceIdeConfig<T>(step: T): T {
    if (!projectStepNeedsFileWorkspace(step) || !isRecord(step)) {
        return step;
    }

    const workspace = firstRecord(step.workspace);
    const existingIdeConfig = firstRecord(
        step.ideConfig,
        workspace?.ideConfig,
    );
    const existingRequires = firstRecord(existingIdeConfig?.requires);

    const ideConfig: LearningIdeConfig = {
        ...((existingIdeConfig ?? {}) as LearningIdeConfig),
        requires: {
            ...(existingRequires ?? {}),
            files: true,
            multiFile: true,
        },
    };

    return {
        ...step,
        ideConfig,
    } as T;
}
