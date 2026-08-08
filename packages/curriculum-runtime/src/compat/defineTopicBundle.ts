import type { ReviewTopicShape } from "@zoeskoul/curriculum-contracts/subjects/types";
import type { SketchEntry } from "@zoeskoul/curriculum-contracts/subjects/types";
import type { ManifestRuntimeDefaults } from "@zoeskoul/curriculum-contracts";
import type { LearningIdeConfig } from "@zoeskoul/curriculum-contracts";
import type { ToolPresentationPolicy } from "@zoeskoul/curriculum-contracts";

export type JsonObject = { readonly [key: string]: unknown };

export type TopicPoolItem = {
    key: string;
    w: number;
    kind?: string;
    purpose?: "quiz" | "project";
};
export type GeneratorTopicBundle = {
    id?: string;
    profileId?: string;
    pool: readonly TopicPoolItem[];
    [key: string]: unknown;
};

export type TopicMeta = {
    label: string;
    minutes: number;
    preferKind?: string | null;
    pool?: readonly TopicPoolItem[];
    runtimeDefaults?: ManifestRuntimeDefaults | null;
    serviceDefaults?: LearningIdeConfig | null;
    tools?: ToolPresentationPolicy | null;
};

export type TopicDefInput = {
    id: string;
    order?: number;
    variant?: string | null;
    titleKey?: string;
    description?: string | null;
    meta: TopicMeta;
};

export type SubjectTopicBundle = {
    def: TopicDefInput;
    review?: ReviewTopicShape;
    sketches?: Record<string, SketchEntry>;
    generator?: GeneratorTopicBundle;
    locale?: JsonObject;
};

export type GeneratedSubjectTopicBundle = SubjectTopicBundle & {
    generator: GeneratorTopicBundle;
};

export function defineTopicBundle<T extends SubjectTopicBundle>(input: T): T {
    return input;
}

export function defineGeneratedTopicBundle<T extends GeneratedSubjectTopicBundle>(input: T): T {
    return input;
}
