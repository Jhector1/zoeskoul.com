/**
 * Canonical learner exercise presentation contract.
 *
 * Presentation is owned by the authored ExerciseRuntime, never by the signed
 * validation transport and never by a parallel editor-runtime readiness flag.
 *
 * A current-generation authored manifest + canonical workspace is sufficient
 * to render the learner exercise. `workspaceStatus` remains diagnostic state:
 * it may report a prior transient "pending", but it cannot hide a real current
 * workspace. A hard error is authoritative only when no canonical workspace
 * exists.
 */

export type CanonicalExercisePresentationStatus =
  | "missing"
  | "pending"
  | "ready"
  | "error";

type CanonicalExerciseRuntimeLike = {
  manifest?: unknown;
  workspace?: unknown;
  workspaceStatus?: "pending" | "ready" | "error" | string | null;
  workspaceGeneration?: number | null;
  workspaceError?: unknown;
} | null | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export function hasCanonicalExerciseWorkspace(value: unknown): boolean {
  if (!isRecord(value)) return false;

  if (value.version === 2) {
    return Array.isArray(value.nodes);
  }

  return false;
}

export function hasCanonicalExerciseManifest(value: unknown): boolean {
  return isRecord(value);
}

export function resolveCanonicalExercisePresentation(args: {
  exercise: CanonicalExerciseRuntimeLike;
  authoredManifest?: unknown;
  resetRevision: number;
}): {
  status: CanonicalExercisePresentationStatus;
  ready: boolean;
  generationCurrent: boolean;
  hasManifest: boolean;
  hasWorkspace: boolean;
  error: string | null;
} {
  const exercise = args.exercise ?? null;
  const manifest = exercise?.manifest ?? args.authoredManifest ?? null;
  const hasManifest = hasCanonicalExerciseManifest(manifest);
  const hasWorkspace = hasCanonicalExerciseWorkspace(exercise?.workspace);

  const runtimeGeneration =
    typeof exercise?.workspaceGeneration === "number"
      ? exercise.workspaceGeneration
      : args.resetRevision;
  const generationCurrent = runtimeGeneration === args.resetRevision;

  const ready =
    Boolean(exercise) &&
    hasManifest &&
    hasWorkspace &&
    generationCurrent;

  if (ready) {
    return {
      status: "ready",
      ready: true,
      generationCurrent,
      hasManifest,
      hasWorkspace,
      error: null,
    };
  }

  if (
    exercise?.workspaceStatus === "error" &&
    !hasWorkspace &&
    generationCurrent
  ) {
    return {
      status: "error",
      ready: false,
      generationCurrent,
      hasManifest,
      hasWorkspace,
      error:
        typeof exercise.workspaceError === "string" &&
        exercise.workspaceError.trim()
          ? exercise.workspaceError.trim()
          : "Exercise workspace failed to resolve.",
    };
  }

  if (exercise || hasManifest) {
    return {
      status: "pending",
      ready: false,
      generationCurrent,
      hasManifest,
      hasWorkspace,
      error: null,
    };
  }

  return {
    status: "missing",
    ready: false,
    generationCurrent,
    hasManifest,
    hasWorkspace,
    error: null,
  };
}
