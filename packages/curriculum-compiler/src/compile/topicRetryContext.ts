import type { TopicRetryContext } from "@zoeskoul/curriculum-ai";
import { isRetryableTopicValidationError } from "../validate/RetryableTopicValidationError.js";

type RetryIssueLike = {
    code?: unknown;
    exerciseId?: unknown;
    field?: unknown;
    message?: unknown;
    severity?: unknown;
};

function asIssue(value: unknown): RetryIssueLike | null {
    return value && typeof value === "object"
        ? (value as RetryIssueLike)
        : null;
}

function shouldIncludeIssue(issue: RetryIssueLike) {
    const severity =
        typeof issue.severity === "string"
            ? issue.severity.toLowerCase()
            : "";

    return severity !== "info";
}

/**
 * Pull actionable validation details into the next AI retry prompt.
 *
 * Both single-topic and whole-course compilation must use this helper so a
 * retry sees the complete critique, including non-fatal count mismatches that
 * explain how to repair the fatal error.
 */
export function extractRetryIssues(
    error: unknown,
): TopicRetryContext["qualityIssues"] {
    if (!isRetryableTopicValidationError(error)) return undefined;

    const details = error.details as
        | {
              issues?: unknown;
              repairs?: unknown;
          }
        | undefined;

    const rawIssues = Array.isArray(details?.issues) ? details.issues : [];
    const rawRepairs = Array.isArray(details?.repairs) ? details.repairs : [];
    const candidates = [...rawIssues, ...rawRepairs];
    const seen = new Set<string>();
    const result: NonNullable<TopicRetryContext["qualityIssues"]> = [];

    for (const candidate of candidates) {
        const issue = asIssue(candidate);
        if (!issue || !shouldIncludeIssue(issue)) continue;
        if (typeof issue.message !== "string" || issue.message.trim().length < 1) {
            continue;
        }

        const code = String(issue.code ?? "UNKNOWN");
        const exerciseId =
            typeof issue.exerciseId === "string"
                ? issue.exerciseId
                : typeof issue.field === "string"
                  ? issue.field
                  : undefined;
        const message = issue.message.trim();
        const key = JSON.stringify([code, exerciseId ?? "", message]);

        if (seen.has(key)) continue;
        seen.add(key);

        result.push({
            code,
            ...(exerciseId ? { exerciseId } : {}),
            message,
        });
    }

    return result.length > 0 ? result : undefined;
}
