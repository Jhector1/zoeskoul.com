import type { PracticeKind } from "@prisma/client";
import type { ReviewTopicShape } from "@/lib/subjects/types";
import type { SketchEntry } from "@/components/sketches/subjects";

export type JsonObject = { readonly [key: string]: unknown };

export type TopicPoolItem = {
    key: string;
    w: number;
    kind?: PracticeKind;
};

export type TopicMeta = {
    label: string;
    minutes: number;
    preferKind?: PracticeKind | null;
    pool?: readonly TopicPoolItem[];
};

export type TopicDefInput = {
    id: string;
    order?: number;
    variant?: string | null;
    titleKey?: string;
    description?: string | null;
    meta: TopicMeta;
};

export type TopicGeneratorRegistration = {
    genKey?: string;
    pool: readonly TopicPoolItem[];
    handlers: Record<string, unknown>;
};

export type TopicBundle = {
    def: TopicDefInput;
    review?: ReviewTopicShape;
    sketches?: Record<string, SketchEntry>;
    generator?: TopicGeneratorRegistration;
    locale?: JsonObject;
};

export function defineTopicBundle<T extends TopicBundle>(input: T): T {
    return input;
}