import type { CoursePlan, TopicBundleManifest } from "@zoeskoul/curriculum-contracts";

export type TopicPackDraft = {
    topicBundle: TopicBundleManifest;
    messagesByLocale: Record<string, Record<string, unknown>>;
};

export type AiProvider = {
    generateJson<T>(args: {
        system: string;
        user: string;
        schemaName: string;
    }): Promise<T>;
};