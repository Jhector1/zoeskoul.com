export type JsonRecord =
  Record<string, unknown>;

export function isRecord(
  value: unknown,
): value is JsonRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export function messageFromError(
  error: unknown,
  fallback: string,
): string {
  return error instanceof Error
    ? error.message
    : fallback;
}

export function isNotMigratedError(
  error: unknown,
): boolean {
  if (
    !isRecord(error) ||
    error.status !== 409
  ) {
    return false;
  }

  const payload = error.payload;

  return (
    isRecord(payload) &&
    payload.code ===
      "RUNTIME_NOT_MIGRATED"
  );
}

export function practiceFeedbackText(
  validation: {
    ok: boolean | null;
    explanation: string | null;
    message: string | null;
  },
): string {
  return (
    validation.explanation ??
    validation.message ??
    (
      validation.ok === true
        ? "Correct."
        : validation.ok === false
          ? "That answer is not correct yet."
          : "Your answer was checked."
    )
  );
}

export function studentSubmissionId():
  string {
  return (
    globalThis.crypto
      ?.randomUUID?.() ??
    `student-${Date.now()}`
  );
}
