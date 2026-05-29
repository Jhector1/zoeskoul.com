import type { ReviewCard } from "@/lib/subjects/types";

export type AssessmentDisplayKind = "quiz" | "project" | "tryIt";

function asRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === "object"
        ? (value as Record<string, unknown>)
        : null;
}

function normalizeString(value: unknown) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isTrueLike(value: unknown) {
    const normalized = normalizeString(value);
    return value === true || normalized === "true";
}

function hasTryItId(value: unknown) {
    const id = normalizeString(value);
    if (!id) return false;

    return (
        id.startsWith("try-") ||
        id.startsWith("try_") ||
        id.includes("-try-")
    );
}

export function isTryItProjectCard(
    card: ReviewCard,
): card is Extract<ReviewCard, { type: "project" }> {
    if (card.type !== "project") return false;

    const cardRecord = asRecord(card);
    const specRecord = asRecord(card.spec);
    if (!cardRecord || !specRecord) return false;
    if (normalizeString(specRecord.mode) !== "project") return false;

    const steps = specRecord.steps;
    if (!Array.isArray(steps) || steps.length !== 1) return false;

    return (
        hasTryItId(card.id) ||
        isTrueLike(cardRecord.tryIt) ||
        isTrueLike(specRecord.tryIt) ||
        normalizeString(specRecord.displayKind) === "try_it" ||
        normalizeString(specRecord.uiKind) === "try_it"
    );
}

export function getAssessmentDisplayKind(
    card: ReviewCard,
    fallback: Exclude<AssessmentDisplayKind, "tryIt">,
): AssessmentDisplayKind {
    if (fallback === "project" && isTryItProjectCard(card)) {
        return "tryIt";
    }

    return fallback;
}
