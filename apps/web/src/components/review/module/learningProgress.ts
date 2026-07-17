import type { CompactProgressStepStatus } from "./compactFlowNavigation";

export type LearningProgressStatus = CompactProgressStepStatus;

export type LearningProgressTrack = {
    label: string;
    activeIndex: number;
    total: number;
    statuses?: LearningProgressStatus[];
};

export type LearningProgressStep = {
    index: number;
    status: LearningProgressStatus;
    current: boolean;
};

export function clampLearningProgressIndex(index: number, total: number): number {
    if (total <= 0) return 0;
    return Math.max(0, Math.min(index, total - 1));
}

export function buildLearningProgressSteps(
    track: LearningProgressTrack,
): LearningProgressStep[] {
    const total = Math.max(0, Math.trunc(track.total));
    const activeIndex = clampLearningProgressIndex(track.activeIndex, total);

    return Array.from({ length: total }, (_, index) => ({
        index,
        status: track.statuses?.[index] ?? "upcoming",
        current: index === activeIndex,
    }));
}

export function resolveLearningActivityLabel(args: {
    kind?: "quiz" | "project" | "card";
    identifyingText?: string | null;
}): string {
    if (args.kind === "quiz") return "Question";

    if (args.kind === "project") {
        const normalized = String(args.identifyingText ?? "")
            .trim()
            .toLowerCase();

        if (normalized.includes("capstone") || normalized.includes("final project")) {
            return "Capstone step";
        }

        return "Project step";
    }

    return "Lesson";
}

export function shouldUseNestedLearningProgress(
    kind?: "quiz" | "project" | "embedded_try_it",
): kind is "quiz" | "project" {
    return kind === "quiz" || kind === "project";
}
