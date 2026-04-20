import type { AiProvider } from "@zoeskoul/curriculum-ai";
import { generateTopicPack, translateMessages } from "@zoeskoul/curriculum-ai";
import { validateLocaleParity } from "../validate/validateLocaleParity.js";

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

    const messagesByLocale: Record<string, Record<string, unknown>> = {
        [args.sourceLocale]:
        sourcePack.messagesByLocale[args.sourceLocale] ?? sourcePack.messagesByLocale.en ?? {},
    };

    for (const locale of args.targetLocales) {
        if (locale === args.sourceLocale) continue;

        const translated = await translateMessages(args.provider, {
            sourceLocale: args.sourceLocale,
            targetLocale: locale,
            messages: messagesByLocale[args.sourceLocale],
        });

        validateLocaleParity(messagesByLocale[args.sourceLocale], translated, locale);
        messagesByLocale[locale] = translated;
    }

    return {
        topicBundle: sourcePack.topicBundle,
        messagesByLocale,
    };
}