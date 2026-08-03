import type {
  LearningPracticeValidationResponse,
} from "@zoeskoul/learning-contracts";

type JsonRecord = Record<string, unknown>;

const FORBIDDEN_KEYS = new Set([
  "answer",
  "answerId",
  "answerKey",
  "correctAnswer",
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
  "tests",
]);

function isRecord(
  value: unknown,
): value is JsonRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function nullableString(
  value: unknown,
): string | null {
  return typeof value === "string"
    ? value
    : null;
}

function nullableFiniteNumber(
  value: unknown,
): number | null {
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  )
    ? value
    : null;
}

function sanitize(
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
    return value.map(sanitize);
  }

  if (!isRecord(value)) return null;

  const output: JsonRecord = {};

  for (
    const [key, nested]
    of Object.entries(value)
  ) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    output[key] = sanitize(nested);
  }

  return output;
}

export function projectStudentPracticeValidation(
  value: unknown,
): LearningPracticeValidationResponse {
  const source = isRecord(value)
    ? value
    : {};
  const attemptsSource =
    isRecord(source.attempts)
      ? source.attempts
      : null;

  const attempts = attemptsSource
    ? {
        used:
          nullableFiniteNumber(
            attemptsSource.used,
          ) ?? 0,
        max:
          nullableFiniteNumber(
            attemptsSource.max,
          ),
        left:
          nullableFiniteNumber(
            attemptsSource.left,
          ),
      }
    : null;

  return {
    ok:
      typeof source.ok === "boolean"
        ? source.ok
        : null,
    message:
      nullableString(source.message) ??
      nullableString(source.error),
    code: nullableString(source.code),
    explanation:
      nullableString(
        source.explanation,
      ),
    feedback: sanitize(
      source.feedback ?? null,
    ),
    finalized:
      source.finalized === true,
    duplicate:
      source.duplicate === true,
    attempts,
    sessionComplete:
      source.sessionComplete === true,
    requestId:
      nullableString(source.requestId),
  };
}
