import type { TopicPlanDraft } from "@zoeskoul/curriculum-contracts";

export function topicBaseKey(
    subjectSlug: string,
    moduleSlug: string,
    topicId: string,
) {
    return `topics.${subjectSlug}.${moduleSlug}.${topicId}`;
}

export function sketchBaseKey(
    subjectSlug: string,
    moduleSlug: string,
    topicId: string,
) {
    return `sketches.${subjectSlug}.${moduleSlug}.${topicId}`;
}

export function extractModuleNumber(moduleSlug: string): number {
    const match = moduleSlug.match(/(\d+)$/);
    return match ? Number(match[1]) : 0;
}

export function safeGoalList(topicPlan: TopicPlanDraft): string[] {
    const goals = [...(topicPlan.learningGoals ?? [])].filter(Boolean);

    while (goals.length < 2) {
        goals.push(`Practice the core idea of ${topicPlan.title}`);
    }

    return goals;
}

export function sentenceCase(input: string): string {
    if (!input) return "";
    return input.charAt(0).toUpperCase() + input.slice(1);
}

export function slugToWords(input: string): string {
    return input
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}