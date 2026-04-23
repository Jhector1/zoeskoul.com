import type {
    TopicAuthoringDraft,
    TopicSeed,
} from "@zoeskoul/curriculum-contracts";
import type { SubjectShapePack } from "@zoeskoul/curriculum-profiles";
import type { AiProvider } from "../types.js";
import { buildTopicAuthoringDraftPrompt } from "../prompts/buildTopicAuthoringDraftPrompt.js";

export async function generateTopicAuthoringDraft(
    provider: AiProvider,
    args: {
        seed: TopicSeed;
        locale: string;
        shape: SubjectShapePack;
    },
): Promise<TopicAuthoringDraft> {
    const prompt = buildTopicAuthoringDraftPrompt(args);

    return provider.generateJson<TopicAuthoringDraft>({
        system: prompt.system,
        user: prompt.user,
        schemaName: "TopicAuthoringDraft",
    });
}