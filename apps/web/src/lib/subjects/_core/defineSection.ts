// src/lib/subjects/_core/defineSection.ts
import type { SubjectTopicBundle } from "@/lib/subjects/_core/defineTopicBundle";

export type SectionMeta = {
    module?: number;

    // legacy display fields
    weeks?: string;
    bullets?: string[];

    // canonical key fields
    weeksKey?: string;
    bulletKeys?: string[];

    readonly [key: string]: unknown;
};

export type SectionInput = {
    slug: string;
    order: number;

    // legacy display fields
    title: string;
    description?: string | null;

    // canonical i18n fields
    titleKey?: string;
    descriptionKey?: string | null;

    meta?: SectionMeta | null;
};

export type SectionBundle = {
    section: SectionInput;
    topics: readonly SubjectTopicBundle[];
};

export function defineSection<const T extends SectionBundle>(input: T): T {
    return input;
}