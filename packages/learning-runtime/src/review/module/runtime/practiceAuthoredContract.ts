export const PRACTICE_AUTHORED_CONTRACT_FIELDS = [
  "help",
  "prompt",
  "title",
  "hint",
  "starterCode",
  "starterFiles",
  "workspace",
  "files",
  "initialFiles",
  "workspaceFiles",
  "fixtureFiles",
  "fixtures",
  "fileFixtures",
  "workspaceExpectations",
  "recipe",
  "tests",
  "solutionCode",
  "solutionFiles",
  "expected",
  "messageBase",
  "ideConfig",
  "language",
  "lang",
] as const;

export type PracticeAuthoredContractField =
  (typeof PRACTICE_AUTHORED_CONTRACT_FIELDS)[number];

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

const BARE_I18N_KEY_RE = /^[a-zA-Z0-9_.:-]+$/;

function isTaggedPracticeAlias(value: unknown) {
  return typeof value === "string" && value.trim().startsWith("@:");
}

function isBarePracticeI18nAlias(value: unknown) {
  if (typeof value !== "string") return false;

  const trimmed = value.trim();

  return (
    trimmed.length > 0 &&
    trimmed.includes(".") &&
    !trimmed.includes(" ") &&
    BARE_I18N_KEY_RE.test(trimmed)
  );
}

function pickLivePracticeContractValue(args: {
  resolvedValue: unknown;
  currentValue: unknown;
}) {
  const { resolvedValue, currentValue } = args;

  if (currentValue === undefined) {
    return resolvedValue;
  }

  if (
    resolvedValue !== undefined &&
    !isTaggedPracticeAlias(resolvedValue) &&
    (
      isTaggedPracticeAlias(currentValue) ||
      isBarePracticeI18nAlias(currentValue)
    )
  ) {
    return resolvedValue;
  }

  return currentValue;
}

export function isLearnerOwnedPracticeRuntimeState(value: unknown) {
  const row = record(value);
  if (!row) return false;

  const origin =
    typeof row.workspaceOrigin === "string"
      ? row.workspaceOrigin.trim().toLowerCase()
      : "";

  const result = record(row.result);

  return Boolean(
    row.userEdited === true ||
      origin === "user" ||
      origin === "saved" ||
      origin === "reveal-fill" ||
      result?.ok === true ||
      row.correct === true ||
      row.status === "completed"
  );
}

const LEARNER_OWNED_AUTHORED_STRUCTURE_FIELDS =
  new Set<PracticeAuthoredContractField>([
    "starterCode",
    "starterFiles",
    "workspace",
    "files",
    "initialFiles",
    "workspaceFiles",
    "fixtureFiles",
    "fixtures",
    "fileFixtures",
    "workspaceExpectations",
    "ideConfig",
    "language",
    "lang",
  ]);

function preferCanonicalPracticeStructure(args: {
  resolvedValue: unknown;
  fallbackValue: unknown;
}) {
  if (args.resolvedValue === undefined) {
    return args.fallbackValue;
  }

  if (
    isTaggedPracticeAlias(args.resolvedValue) ||
    isBarePracticeI18nAlias(args.resolvedValue)
  ) {
    return args.fallbackValue ?? args.resolvedValue;
  }

  return args.resolvedValue;
}

export function resolvePracticeAuthoredContractValue(args: {
  field: PracticeAuthoredContractField;
  resolvedValue: unknown;
  currentExerciseValue: unknown;
  currentItemValue: unknown;
  learnerOwnedRuntimeState: boolean;
}) {
  if (
    args.learnerOwnedRuntimeState &&
    LEARNER_OWNED_AUTHORED_STRUCTURE_FIELDS.has(args.field)
  ) {
    /**
     * Saved learner state must not redefine the authored workspace contract.
     *
     * Canonical resolved structure wins whenever present. A nested live
     * exercise field is a compatibility fallback. Item-level structure is only
     * a final fallback for non-workspace aliases; item.workspace itself is
     * learner/editor state and is never an authored-manifest fallback.
     */
    return preferCanonicalPracticeStructure({
      resolvedValue: args.resolvedValue,
      fallbackValue:
        args.currentExerciseValue ??
        (args.field === "workspace"
          ? undefined
          : args.currentItemValue),
    });
  }

  return pickLivePracticeContractValue({
    resolvedValue: args.resolvedValue,
    currentValue:
      args.currentItemValue ?? args.currentExerciseValue,
  });
}

export function shouldMirrorPracticeAuthoredContractFieldToItem(args: {
  field: PracticeAuthoredContractField;
  learnerOwnedRuntimeState: boolean;
}) {
  return !(
    args.field === "workspace" &&
    args.learnerOwnedRuntimeState
  );
}
