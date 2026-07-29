import {
  projectStudentPracticeValidation,
} from "./studentPracticeValidationData";

type JsonRecord =
  Record<string, unknown>;

type TaggedResolver = (
  value: unknown,
) => Promise<unknown>;

function record(
  value: unknown,
): JsonRecord | null {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  )
    ? value as JsonRecord
    : null;
}

function isTranslationTag(
  value: unknown,
): boolean {
  return (
    typeof value === "string" &&
    value.trim().startsWith("@:")
  );
}

function readableText(
  value: unknown,
): string | null {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    isTranslationTag(value)
  ) {
    return null;
  }

  return value.trim();
}

function defaultFeedback(
  ok: unknown,
): string {
  if (ok === true) {
    return "Correct.";
  }

  if (ok === false) {
    return "That answer is not correct yet.";
  }

  return "Your answer was checked.";
}

function removeUnresolvedFeedbackTags(
  value: unknown,
): unknown {
  const body = record(value);
  if (!body) return value;

  const feedback = record(body.feedback);
  const fallback =
    readableText(body.explanation) ??
    readableText(feedback?.message) ??
    readableText(body.message) ??
    defaultFeedback(body.ok);

  const nextFeedback =
    feedback &&
    isTranslationTag(feedback.message)
      ? {
          ...feedback,
          message: fallback,
        }
      : body.feedback;

  return {
    ...body,
    ...(isTranslationTag(body.explanation)
      ? { explanation: fallback }
      : {}),
    ...(isTranslationTag(body.message)
      ? { message: fallback }
      : {}),
    ...(nextFeedback !== body.feedback
      ? { feedback: nextFeedback }
      : {}),
  };
}

/**
 * The validation service may return authored @: message references from
 * protected grading metadata. Project the response first, resolve only the
 * learner-safe payload, then guarantee that an unresolved key cannot reach
 * the student UI.
 */
export async function localizeStudentPracticeValidation(
  value: unknown,
  resolveTagged: TaggedResolver,
): Promise<unknown> {
  const projected =
    projectStudentPracticeValidation(
      value,
    );
  const resolved =
    await resolveTagged(projected);

  return removeUnresolvedFeedbackTags(
    resolved,
  );
}
