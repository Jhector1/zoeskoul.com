import type {
  LearningPracticeExercise,
  LearningPracticeExerciseKind,
} from "@zoeskoul/learning-contracts";

type JsonRecord = Record<string, unknown>;

const COMMON_PUBLIC_FIELDS = [
  "help",
  "hint",
  "tools",
  "purpose",
  "messageBase",
] as const;

const KIND_PUBLIC_FIELDS: Record<
  LearningPracticeExerciseKind,
  readonly string[]
> = {
  single_choice: [
    "options",
  ],
  multi_choice: [
    "options",
  ],
  numeric: [
    "tolerance",
  ],
  vector_drag_target: [
    "initialA",
    "initialB",
    "targetA",
    "targetB",
    "lockB",
    "tolerance",
  ],
  vector_drag_dot: [
    "initialA",
    "b",
    "targetDot",
    "tolerance",
  ],
  matrix_input: [
    "rows",
    "cols",
    "tolerance",
    "step",
    "integerOnly",
  ],
  code_input: [
    "language",
    "lang",
    "codeSurface",
    "embedded",
    "embeddedCodeInput",
    "ui",
    "starterStdin",
    "stdinHint",
    "editorHeight",
    "allowLanguageSwitch",
    "examples",
    "fixedSqlDialect",
    "runtime",
    "expectedExample",
    "ideConfig",
    "workspace",
    "files",
    "initialFiles",
    "workspaceFiles",
    "fixtureFiles",
    "fixtures",
    "fileFixtures",
  ],
  text_input: [
    "placeholder",
    "ui",
  ],
  drag_reorder: [
    "tokens",
  ],
  voice_input: [
    "targetText",
    "locale",
    "maxSeconds",
  ],
  word_bank_arrange: [
    "targetText",
    "locale",
    "wordBank",
    "distractors",
    "ttsText",
  ],
  listen_build: [
    "targetText",
    "locale",
    "wordBank",
    "distractors",
  ],
  fill_blank_choice: [
    "template",
    "choices",
    "locale",
  ],
};

const FORBIDDEN_FIELDS = new Set<string>([
  "answer",
  "answerId",
  "answerKey",
  "checkSql",
  "correct",
  "correctAnswer",
  "correctValue",
  "expected",
  "expectedAnswerPayload",
  "expectedSolution",
  "hiddenTests",
  "recipe",
  "reveal",
  "revealAnswer",
  "secretPayload",
  "solutionCode",
  "solutionFiles",
  "sourceChecks",
  "tests",
]);

function isRecord(value: unknown): value is JsonRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function cleanString(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function cleanDifficulty(
  value: unknown,
): "easy" | "medium" | "hard" {
  if (
    value === "medium" ||
    value === "hard"
  ) {
    return value;
  }

  return "easy";
}

function cleanKind(
  value: unknown,
): LearningPracticeExerciseKind | null {
  const kind = cleanString(value);

  return Object.prototype.hasOwnProperty.call(
    KIND_PUBLIC_FIELDS,
    kind,
  )
    ? kind as LearningPracticeExerciseKind
    : null;
}

function sanitizePublicValue(
  value: unknown,
): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map(sanitizePublicValue)
      .filter((entry) => entry !== undefined);
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const out: JsonRecord = {};

  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_FIELDS.has(key)) continue;

    const projected = sanitizePublicValue(nested);

    if (projected !== undefined) {
      out[key] = projected;
    }
  }

  return out;
}

function canonicalChoiceOptions(
  value: unknown,
): Array<{
  id: string;
  label: string;
}> {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];

    const id = cleanString(entry.id);
    const label =
      cleanString(entry.label) ||
      cleanString(entry.text);

    return id && label
      ? [{ id, label }]
      : [];
  });
}

function publicPayload(
  source: JsonRecord,
  kind: LearningPracticeExerciseKind,
): JsonRecord {
  const out: JsonRecord = {};

  for (const field of [
    ...COMMON_PUBLIC_FIELDS,
    ...KIND_PUBLIC_FIELDS[kind],
  ]) {
    if (!(field in source)) continue;

    const projected =
      field === "options" &&
      (
        kind === "single_choice" ||
        kind === "multi_choice"
      )
        ? canonicalChoiceOptions(
            source[field],
          )
        : sanitizePublicValue(
            source[field],
          );

    if (projected !== undefined) {
      out[field] = projected;
    }
  }

  return out;
}

/**
 * Projects an authored/current practice exercise into the learner-facing
 * contract used by the Vite runtime boundary.
 *
 * This does not alter the existing /api/practice response yet. It creates a
 * tested boundary that the protected student runtime endpoint can use without
 * serializing the web runtime's raw exercise or target registry objects.
 */
export function projectStudentPracticeExercise(
  value: unknown,
): LearningPracticeExercise {
  if (!isRecord(value)) {
    throw new Error(
      "Practice exercise must be an object.",
    );
  }

  const kind = cleanKind(value.kind);

  if (!kind) {
    throw new Error(
      `Unsupported practice exercise kind: ${String(value.kind ?? "")}`,
    );
  }

  const id = cleanString(value.id);
  const topic = cleanString(value.topic);
  const title = cleanString(value.title);
  const prompt = cleanString(value.prompt);

  if (!id || !topic || !title) {
    throw new Error(
      "Practice exercise is missing learner-visible identity.",
    );
  }

  const exerciseKey =
    cleanString(value.exerciseKey) ||
    null;

  return {
    id,
    exerciseKey,
    kind,
    topic,
    difficulty: cleanDifficulty(value.difficulty),
    title,
    prompt,
    payload: publicPayload(value, kind),
  };
}
