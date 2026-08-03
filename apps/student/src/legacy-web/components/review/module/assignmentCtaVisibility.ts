import type { ReviewModule, ReviewCard } from "@/lib/subjects/types";
import { isTopicComplete } from "./utils";

export function resolveCompactAssignmentCtaVisibility(args: {
    compactLearnerUi: boolean;
    showDebugLearningUi: boolean;
    topics: ReviewModule["topics"] | undefined;
    progress: any;
    assignmentPhase: "idle" | "in_progress" | "complete";
    activeCard: ReviewCard | null;
    moduleComplete: boolean;
}) {
    if (!args.compactLearnerUi || args.showDebugLearningUi) {
        return true;
    }

    if (args.assignmentPhase !== "idle") {
        return true;
    }

    if (args.activeCard?.type === "project") {
        return true;
    }

    const safeTopics = Array.isArray(args.topics) ? args.topics : [];
    const projectTopicIndex = safeTopics.findIndex((topic) =>
        Array.isArray(topic.cards) && topic.cards.some((card) => card.type === "project"),
    );

    if (projectTopicIndex === 0) {
        return true;
    }

    const prerequisiteTopics =
        projectTopicIndex >= 0 ? safeTopics.slice(0, projectTopicIndex) : safeTopics;

    if (!prerequisiteTopics.length) {
        return args.moduleComplete;
    }

    const prerequisitesComplete = prerequisiteTopics.every((topic) =>
        isTopicComplete(topic.cards ?? [], args.progress?.topics?.[topic.id], topic.id),
    );

    return prerequisitesComplete;
}
