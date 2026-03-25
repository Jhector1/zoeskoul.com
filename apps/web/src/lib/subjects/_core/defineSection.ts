// src/lib/subjects/_core/defineSection.ts
import type { JsonObject, TopicBundle } from "./defineTopicBundle";

export type SectionInput = {
    slug: string;
    order: number;
    title: string;
    description?: string | null;
    meta?: JsonObject | null;
};

export type SectionBundle = {
    section: SectionInput;
    topics: readonly TopicBundle[];
};

export function defineSection<const T extends SectionBundle>(input: T): T {
    return input;
}