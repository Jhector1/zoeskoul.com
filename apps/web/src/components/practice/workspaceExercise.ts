"use client";

import type { Exercise } from "@/lib/practice/types";
import type { ReviewProjectStep } from "@/lib/subjects/types";

export type CodeSurfaceRequest = "auto" | "embedded" | "workspace";
export type ResolvedCodeSurface = "embedded" | "tools";

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const FILE_SOURCE_KEYS = [
    "starterFiles",
    "files",
    "initialFiles",
    "workspaceFiles",
    "fixtureFiles",
    "fixtures",
    "fileFixtures",
    "solutionFiles",
] as const;

const CODE_SURFACE_VALUES = new Set<CodeSurfaceRequest>([
    "auto",
    "embedded",
    "workspace",
]);

function readCodeSurface(value: unknown): CodeSurfaceRequest | null {
    if (typeof value !== "string") return null;

    const normalized = value.trim().toLowerCase();
    if (CODE_SURFACE_VALUES.has(normalized as CodeSurfaceRequest)) {
        return normalized as CodeSurfaceRequest;
    }

    if (normalized === "tool" || normalized === "tools" || normalized === "toolpane" || normalized === "fullide") {
        return "workspace";
    }

    if (normalized === "inline" || normalized === "code_input" || normalized === "codeinput") {
        return "embedded";
    }

    return null;
}

function requestedCodeSurfaceFromRecord(
    record: Record<string, unknown> | null | undefined,
): CodeSurfaceRequest | null {
    if (!record) return null;

    const explicit =
        readCodeSurface(record.codeSurface) ??
        readCodeSurface(record.codeInputSurface) ??
        readCodeSurface(record.codeInputMode) ??
        readCodeSurface(record.editorSurface) ??
        readCodeSurface(record.presentationMode);

    if (explicit) return explicit;

    if (record.embedded === true || record.embeddedCodeInput === true) {
        return "embedded";
    }

    if (record.useTools === true || record.workspace === true || record.fullWorkspace === true) {
        return "workspace";
    }

    const ui = isRecord(record.ui) ? record.ui : null;
    const uiExplicit =
        readCodeSurface(ui?.codeSurface) ??
        readCodeSurface(ui?.codeInputSurface) ??
        readCodeSurface(ui?.codeInputMode) ??
        readCodeSurface(ui?.editorSurface) ??
        readCodeSurface(ui?.presentationMode);

    if (uiExplicit) return uiExplicit;

    if (ui?.embedded === true || ui?.embeddedCodeInput === true) {
        return "embedded";
    }

    if (ui?.useTools === true || ui?.workspace === true || ui?.fullWorkspace === true) {
        return "workspace";
    }

    const presentation = isRecord(record.presentation) ? record.presentation : null;
    const presentationExplicit =
        readCodeSurface(presentation?.codeSurface) ??
        readCodeSurface(presentation?.codeInputSurface) ??
        readCodeSurface(presentation?.codeInputMode) ??
        readCodeSurface(presentation?.editorSurface) ??
        readCodeSurface(presentation?.presentationMode);

    if (presentationExplicit) return presentationExplicit;

    if (presentation?.embedded === true || presentation?.embeddedCodeInput === true) {
        return "embedded";
    }

    if (presentation?.useTools === true || presentation?.workspace === true || presentation?.fullWorkspace === true) {
        return "workspace";
    }

    return null;
}

function hasStarterFiles(value: unknown): boolean {
    if (Array.isArray(value)) {
        return value.some(
            (entry) =>
                isRecord(entry) &&
                typeof entry.path === "string" &&
                entry.path.trim().length > 0,
        );
    }

    if (!isRecord(value)) return false;

    return Object.keys(value).some((key) => {
        const normalizedKey = key.trim();
        return normalizedKey.length > 0 && !["entryFile", "entryFilePath", "language", "lang"].includes(normalizedKey);
    });
}

function hasWorkspaceFiles(value: unknown): boolean {
    if (!isRecord(value)) return false;

    return FILE_SOURCE_KEYS.some((key) => hasStarterFiles(value[key]));
}

function hasAnyFileSources(record: Record<string, unknown>) {
    return FILE_SOURCE_KEYS.some((key) => hasStarterFiles(record[key]));
}

function isSqlWorkspaceExercise(exercise: Record<string, unknown>) {
    return (
        exercise.language === "sql" ||
        Boolean(exercise.fixedSqlDialect) ||
        Boolean((exercise.runtime as Record<string, unknown> | undefined)?.datasetId) ||
        typeof exercise.sqlSchemaSql === "string" ||
        typeof exercise.sqlSeedSql === "string" ||
        typeof exercise.sqlSetupSql === "string" ||
        Boolean(exercise.sqlDatasetId) ||
        Boolean(exercise.sqlInitialTableSnapshots)
    );
}

export function getRequestedCodeSurface(args: {
    exercise: Exercise | null | undefined;
    projectStepManifest?: ReviewProjectStep | null;
}): CodeSurfaceRequest {
    const exerciseRecord = isRecord(args.exercise) ? (args.exercise as unknown as Record<string, unknown>) : null;
    const projectStepRecord = isRecord(args.projectStepManifest)
        ? (args.projectStepManifest as unknown as Record<string, unknown>)
        : null;

    const exerciseRequest = requestedCodeSurfaceFromRecord(exerciseRecord);
    if (exerciseRequest && exerciseRequest !== "auto") return exerciseRequest;

    const projectStepRequest = requestedCodeSurfaceFromRecord(projectStepRecord);
    if (projectStepRequest && projectStepRequest !== "auto") return projectStepRequest;

    return "auto";
}

/**
 * Returns true only when the manifest/runtime contract needs the full workspace.
 *
 * This is intentionally stricter than resolveCodeSurface(): a simple one-file
 * code_input can still be displayed in the Tools workspace by default, but it
 * does not *require* the workspace unless it uses files, SQL, terminal, or a
 * project-step fallback that cannot fit safely in the embedded runner.
 */
export function isFullWorkspaceExercise(args: {
    exercise: Exercise | null | undefined;
    projectStepManifest?: ReviewProjectStep | null;
}) {
    const exercise = args.exercise;
    if (!exercise || exercise.kind !== "code_input") return false;

    const exerciseRecord = exercise as unknown as Record<string, unknown>;
    const ideConfig = isRecord(exerciseRecord.ideConfig) ? exerciseRecord.ideConfig : null;
    const ideRequires = isRecord(ideConfig?.requires) ? ideConfig.requires : null;

    if (isSqlWorkspaceExercise(exerciseRecord)) {
        return true;
    }

    if (
        ideConfig?.layoutMode === "terminal_workspace" ||
        ideRequires?.files === true ||
        ideRequires?.multiFile === true ||
        ideRequires?.terminal === true ||
        ideRequires?.projectPersistence === true ||
        ideRequires?.cloudProjects === true
    ) {
        return true;
    }

    if (
        hasAnyFileSources(exerciseRecord) ||
        hasWorkspaceFiles(exerciseRecord.workspace)
    ) {
        return true;
    }

    const projectStep = args.projectStepManifest;
    if (!projectStep) return false;

    return (
        hasAnyFileSources(projectStep as unknown as Record<string, unknown>) ||
        hasWorkspaceFiles(projectStep.workspace) ||
        typeof projectStep.solutionCode === "string"
    );
}

/**
 * Runtime policy for code_input display.
 *
 * Manifest rule:
 * - workspace-required exercises always use Tools, even if a manifest asks for embedded.
 * - embedded is opt-in for small/simple single-file checks.
 * - auto/default goes to Tools so the responsive UX uses one real code surface.
 */
export function resolveCodeSurface(args: {
    exercise: Exercise | null | undefined;
    projectStepManifest?: ReviewProjectStep | null;
}): ResolvedCodeSurface {
    const exercise = args.exercise;
    if (!exercise || exercise.kind !== "code_input") return "embedded";

    if (isFullWorkspaceExercise(args)) return "tools";

    const requested = getRequestedCodeSurface(args);
    return requested === "embedded" ? "embedded" : "tools";
}

export function shouldUseWorkspaceCodeSurface(args: {
    exercise: Exercise | null | undefined;
    projectStepManifest?: ReviewProjectStep | null;
}) {
    return resolveCodeSurface(args) === "tools";
}
