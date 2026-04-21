import type { TopicBundleManifest, TopicPlanDraft } from "@zoeskoul/curriculum-contracts";
import type { AiProvider } from "@zoeskoul/curriculum-ai";
import { generateTopicPack } from "@zoeskoul/curriculum-ai";
import { getProfile } from "@zoeskoul/curriculum-profiles";
import { normalizeText, normalizeTextList } from "@zoeskoul/curriculum-profiles";
type TopicSeed = Partial<TopicBundleManifest> & Partial<TopicPlanDraft>;

export async function compileTopic(args: {
    provider: AiProvider;
    subjectSlug: string;
    profileId: string;
    sourceLocale: "en";
    targetLocales: string[];
    moduleSlug: string;
    sectionSlug: string;
    topic: any;
}) {
    const sourcePack = await generateTopicPack(args.provider, {
        subjectSlug: args.subjectSlug,
        profileId: args.profileId,
        moduleSlug: args.moduleSlug,
        sectionSlug: args.sectionSlug,
        topic: args.topic,
        locale: args.sourceLocale,
    });

    const profile = getProfile(args.profileId);

    const rawTopic = sourcePack.topicBundle as TopicSeed;

    const topicPlan: TopicPlanDraft = {
        topicId: rawTopic.topicId ?? args.topic.topicId,
        order: rawTopic.order ?? args.topic.order ?? 0,
        title: normalizeText(rawTopic.title ?? args.topic.title ?? args.topic.topicId, args.topic.topicId),
        summary: normalizeText(rawTopic.summary ?? args.topic.summary ?? "", ""),
        minutes: rawTopic.minutes ?? args.topic.minutes ?? 10,
        learningGoals: normalizeTextList(
            rawTopic.learningGoals ?? args.topic.learningGoals ?? [`Practice ${args.topic.topicId}`],
            "learning_goal",
        ),
    };

    const topicBundle = profile.buildTopicBundleFromPlan
        ? profile.buildTopicBundleFromPlan({
            subjectSlug: args.subjectSlug,
            moduleSlug: args.moduleSlug,
            sectionSlug: args.sectionSlug,
            prefix: args.moduleSlug,
            topicPlan,
        })
        : ({
            ...rawTopic,
            subjectSlug: args.subjectSlug,
            moduleSlug: args.moduleSlug,
            sectionSlug: args.sectionSlug,
            prefix: args.moduleSlug,
        } as TopicBundleManifest);

    const sourceMessages = profile.buildTopicMessagesFromPlan
        ? profile.buildTopicMessagesFromPlan({
            subjectSlug: args.subjectSlug,
            moduleSlug: args.moduleSlug,
            sectionSlug: args.sectionSlug,
            prefix: args.moduleSlug,
            topicPlan,
            locale: args.sourceLocale,
        })
        : sourcePack.messagesByLocale[args.sourceLocale] ??
        sourcePack.messagesByLocale.en ??
        {};

    const messagesByLocale: Record<string, Record<string, unknown>> = {
        [args.sourceLocale]: sourceMessages,
    };

    for (const locale of args.targetLocales) {
        if (locale === args.sourceLocale) continue;
        messagesByLocale[locale] = JSON.parse(JSON.stringify(sourceMessages));
    }

    return {
        topicBundle,
        messagesByLocale,
    };
}