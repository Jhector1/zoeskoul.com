import type { TopicDefInput } from "@/lib/subjects/_core/defineTopicBundle";

export function makeTopicDef<T extends { key: string; w: number; kind?: any }>(args: {
    id: string;
    label: string;
    minutes: number;
    pool?: readonly T[];
    variant?: string | null;
    titleKey?: string;
    description?: string | null;
}): TopicDefInput {
    return {
        id: args.id,
        variant: args.variant,
        titleKey: args.titleKey,
        description: args.description,
        meta: {
            label: args.label,
            minutes: args.minutes,
            pool: args.pool?.map((p) => ({
                key: p.key,
                w: p.w,
                kind: p.kind,
            })),
        },
    };
}

export function createModuleTopicHelpers<
    const S extends string,
    const M extends string,
    const P extends string
>(args: {
    subjectSlug: S;
    moduleSlug: M;
    prefix: P;
}) {
    function makeTopicSlug<const T extends string>(topicId: T) {
        return `${args.prefix}.${topicId}` as const;
    }

    function makeTopicI18n<const T extends string>(topicId: T) {
        const base = `topics.${args.subjectSlug}.${args.moduleSlug}.${topicId}`;
        return {
            base,
            label: `@:${base}.label`,
            summary: `@:${base}.summary`,
            cardTitle: (cardId: string) => `@:${base}.cards.${cardId}.title`,
            projectStepTitle: (stepId: string) => `@:${base}.projectSteps.${stepId}.title`,
        } as const;
    }

    return {
        makeTopicSlug,
        makeTopicI18n,
    };
}