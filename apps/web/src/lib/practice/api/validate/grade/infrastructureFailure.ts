export const RUNNER_UNAVAILABLE_MESSAGE =
    "The code runner is temporarily unavailable. Try again in a moment.";

export type GradeInfrastructureFailure = {
  code: "RUNNER_UNAVAILABLE";
  status: 503;
  message: string;
  retryAfterSeconds: number;
  detail: string | null;
};

function detailText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (value instanceof Error && value.message.trim()) {
    return value.message.trim();
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const candidate =
      typeof record.error === "string"
        ? record.error
        : typeof record.message === "string"
          ? record.message
          : null;

    return candidate?.trim() || null;
  }

  return null;
}

export function createRunnerUnavailableGradeResult(detail?: unknown) {
  return {
    ok: false,
    explanation: RUNNER_UNAVAILABLE_MESSAGE,
    feedback: null,
    infrastructureFailure: {
      code: "RUNNER_UNAVAILABLE" as const,
      status: 503 as const,
      message: RUNNER_UNAVAILABLE_MESSAGE,
      retryAfterSeconds: 5,
      detail: detailText(detail),
    },
  };
}
