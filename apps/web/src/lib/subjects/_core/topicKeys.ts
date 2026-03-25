// src/lib/subjects/_core/topicKeys.ts
export function makeTopicKeys(args: {
    subjectSlug: string;
    moduleSlug: string;
    topicId: string;
}) {
    const base = `topics.${args.subjectSlug}.${args.moduleSlug}.${args.topicId}`;

    return {
        base,
        label: `@:${base}.label`,
        summary: `@:${base}.summary`,
        cardTitle: (cardId: string) => `@:${base}.cards.${cardId}.title`,
        projectStepTitle: (stepId: string) => `@:${base}.projectSteps.${stepId}.title`,
    } as const;
}