// import type { ReviewQuizRequestSpec } from "./schema";
import { stableJsonHash } from "./helpers";
import {ReviewQuizRequestSpec} from "@/lib/review/api/quiz/schemas";

export function buildReviewQuizKey(spec: ReviewQuizRequestSpec) {
    const mode = spec.mode ?? "quiz";

    const base = [
        "review-quiz",
        `mode=${mode}`,
        `subject=${spec.subject}`,
        `module=${spec.moduleSlug}`,
        `section=${spec.section ?? ""}`,
        `difficulty=${spec.difficulty ?? ""}`,
        `allowReveal=${spec.allowReveal ? 1 : 0}`,
        `preferKind=${spec.preferKind ?? ""}`,
        `maxAttempts=${spec.maxAttempts ?? 1}`,
    ];

    if (mode === "project") {
        const stepsSig = stableJsonHash(
            (spec.steps ?? []).map((s) => ({
                id: s.id,
                topic: s.topic,
                difficulty: s.difficulty ?? "",
                preferKind: s.preferKind ?? "",
                exerciseKey: s.exerciseKey ?? "",
                seedPolicy: s.seedPolicy ?? "",
                maxAttempts: s.maxAttempts ?? "",
                carryFromPrev: s.carryFromPrev ? 1 : 0,
            })),
        );

        base.push(`steps=${stepsSig}`);
    } else {
        base.push(`topic=${spec.topic ?? ""}`);
        base.push(`n=${spec.n ?? 4}`);
    }

    return base.join("|");
}