import type { AiProvider, TopicPackDraft } from "../types.js";
import { buildTopicPrompt } from "../prompts/buildTopicPrompt.js";

export async function generateTopicPack(
    provider: AiProvider,
    args: {
        subjectSlug: string;
        profileId: string;
        moduleSlug: string;
        sectionSlug: string;
        topic: any;
        locale: string;
    },
): Promise<TopicPackDraft> {
    const prompt = buildTopicPrompt(args);

    return provider.generateJson<TopicPackDraft>({
        system: prompt.system,
        user: prompt.user,
        schemaName: "TopicPackDraft",
    });
}