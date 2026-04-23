import type {
    TopicBundleManifest,
    TopicPlanDraft,
} from "@zoeskoul/curriculum-contracts";

export type TopicPackDraft = {
    topicBundle: Partial<TopicBundleManifest> & TopicPlanDraft;
    messagesByLocale: Record<string, Record<string, unknown>>;
};

export type TranslationEntry = {
    key: string;
    value: string;
};

export type TranslationEntriesPayload = {
    entries: TranslationEntry[];
};

export type GenerateJsonArgs = {
    system: string;
    user: string;
    schemaName:
        | "CoursePlan"
        | "TopicPackDraft"
        | "TranslatedMessages"
        | "TranslatedEntries";
};

export type AiProvider = {
    generateJson<T>(args: GenerateJsonArgs): Promise<T>;
};