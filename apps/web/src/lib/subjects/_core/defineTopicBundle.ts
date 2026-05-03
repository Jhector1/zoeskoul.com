import type { ReviewTopicShape } from "@/lib/subjects/types";
import type { SketchEntry } from "@/components/sketches/subjects";
import type { TopicBundle as GeneratorTopicBundle } from "@/lib/practice/generator/engines/utils";
import type { ManifestRuntimeDefaults } from "@/lib/subjects/_core/manifestTypes";
import type { LearningIdeConfig } from "@/lib/ide/learningIdeConfig";

export type JsonObject = { readonly [key: string]: unknown };

export type TopicPoolItem = {
    key: string;
    w: number;
    kind?: string;
    purpose?: "quiz" | "project";
};

export type TopicMeta = {
    label: string;
    minutes: number;
    preferKind?: string | null;
    pool?: readonly TopicPoolItem[];
    runtimeDefaults?: ManifestRuntimeDefaults | null;
    serviceDefaults?: LearningIdeConfig | null;
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
