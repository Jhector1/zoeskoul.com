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

/**
 * Only executable code_input presentations require canonical workspace
 * ownership before they can be shown.
 *
 * Materialized non-code exercises are themselves the learner presentation.
 * Requiring an editor workspace for those exercises makes valid language
 * exercises remain permanently transition-pending.
 */
function canonicalExerciseRequiresWorkspace(value: unknown): boolean {
  if (!isRecord(value)) return false;

  return value.kind === "code_input";
}

function hasNonBlankString(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}

function hasNonEmptyArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0
  );
}

/**
 * Decide whether a canonical route manifest is already a learner-renderable
 * Exercise.
 *
 * Code input intentionally supports zero-network fast hydration: its authored
 * manifest plus canonical workspace is the learner surface.
 *
 * Non-code manifests are different. The compiled curriculum manifest is often
 * structural and message-driven. For example, fill_blank_choice stores
 * messageBase + choiceCount + expected, while template + choices are created
 * later by buildExerciseFromManifest().
 *
 * A structural manifest must therefore never become learner presentation just
 * because ReviewRuntime attached an empty workspace to it.
 */
export function isRenderableCanonicalExerciseManifest(
  value: unknown,
): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const kind =
    typeof value.kind === "string"
      ? value.kind.trim()
      : "";

  if (!kind) {
    return false;
  }

  /*
   * Preserve the existing fast-hydration architecture for executable code
   * exercises. Their canonical manifest + workspace is intentionally enough.
   */
  if (kind === "code_input") {
    return true;
  }

  /*
   * Every materialized non-code Exercise owns learner-facing copy.
   * Structural manifests generally own messageBase instead.
   *
   * Title and prompt are alternative presentation surfaces. Some canonical
   * language exercises materialize their learner instruction entirely into
   * title and intentionally leave prompt blank, so requiring both would keep
   * an otherwise complete exercise permanently pending.
   */
  if (
    !hasNonBlankString(value.title) &&
    !hasNonBlankString(value.prompt)
  ) {
    return false;
  }

  switch (kind) {
    case "single_choice":
    case "multi_choice":
      return hasNonEmptyArray(
        value.options,
      );

    case "drag_reorder":
      return hasNonEmptyArray(
        value.tokens,
      );

    case "fill_blank_choice":
      return (
        hasNonBlankString(
          value.template,
        ) &&
        hasNonEmptyArray(
          value.choices,
        ) &&
        (
          value.choices as unknown[]
        ).every(
          hasNonBlankString,
        )
      );

    case "voice_input":
    case "word_bank_arrange":
    case "listen_build":
      return hasNonBlankString(
        value.targetText,
      );

    case "matrix_input":
      return (
        typeof value.rows ===
          "number" &&
        value.rows > 0 &&
        typeof value.cols ===
          "number" &&
        value.cols > 0
      );

    case "vector_drag_target":
      return (
        isRecord(
          value.initialA,
        ) &&
        isRecord(
          value.targetA,
        )
      );

    case "vector_drag_dot":
      return (
        isRecord(
          value.initialA,
        ) &&
        isRecord(
          value.b,
        )
      );

    case "pseudocode_input":
      return hasNonBlankString(
        value.mode,
      );

    /*
     * Numeric and text input have no additional mandatory presentation
     * collections beyond their materialized title/prompt contract.
     */
    case "numeric":
    case "text_input":
      return true;

    default:
      return false;
  }
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

  const requiresWorkspace =
    canonicalExerciseRequiresWorkspace(manifest);

  const ready =
    Boolean(exercise) &&
    hasManifest &&
    isRenderableCanonicalExerciseManifest(
      manifest,
    ) &&
    (!requiresWorkspace || hasWorkspace) &&
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
    requiresWorkspace &&
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
