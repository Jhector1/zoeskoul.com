import type { CritiqueIssue } from "@zoeskoul/curriculum-profiles";

function inferSeverity(message: string): "warn" | "error" {
    const normalized = message.toLowerCase();

    if (
        normalized.includes("reveals answer") ||
        normalized.includes("reveals fill_blank answer") ||
        normalized.includes("may reveal option text")
    ) {
        return "error";
    }

    return "warn";
}

function inferCategory(message: string) {
    const normalized = message.toLowerCase();

    if (normalized.includes("hint")) return "hint" as const;
    if (normalized.includes("answer")) return "answer_key" as const;
    return "clarity" as const;
}

function inferExerciseId(message: string): string | undefined {
    const match = message.match(/exercise\s+([A-Za-z0-9._-]+)/i);
    return match?.[1];
}

export function buildHintCritiqueIssues(
    hintWarnings: string[],
): CritiqueIssue[] {
    return hintWarnings.map((message) => ({
        code: "HINT_VALIDATION_WARNING",
        category: inferCategory(message),
        severity: inferSeverity(message),
        exerciseId: inferExerciseId(message),
        message,
    }));
}