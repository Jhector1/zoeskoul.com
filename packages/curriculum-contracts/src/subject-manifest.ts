import type {
    ManifestCard,
    ManifestExercise,
    ManifestRuntimeDefaults,
    ManifestSketch,
} from "./manifest.js";


export type SubjectManifest = {
    subject: {
        slug: string;
        genKey: string;
        order: number;
        accessPolicy?: "free" | "paid";
        status?: "active" | "coming_soon" | "disabled";
        imagePublicId?: string | null;
        imageAlt?: string | null;
        titleKey: string;
        descriptionKey?: string | null;
        meta?: {
            curriculum?: {
                plannedModuleCount?: number;
                isTerminalRelease?: boolean;
                moreComingMessageKey?: string;
            };
            completionPolicy?: {
                requireAllPublishedModules?: boolean;
                rewardEnabledByDefault?: boolean;
                certificateEnabledByDefault?: boolean;
            };
        };
    };
    modules: SubjectModuleManifest[];
};

export type SubjectModuleManifest = {
    slug: string;
    prefix: string;
    order: number;
    titleKey: string;
    descriptionKey?: string | null;
    weekStart?: number | null;
    weekEnd?: number | null;
    accessOverride?: "free" | "paid" | null;
    runtimeDefaults?: ManifestRuntimeDefaults | null;
    meta?: {
        estimatedMinutes?: number;
        prereqKeys?: string[];
        outcomeKeys?: string[];
        whyKeys?: string[];
    };
    sections: SubjectSectionManifest[];
};

export type SubjectSectionManifest = {
    slug: string;
    order: number;
    titleKey: string;
    descriptionKey?: string | null;
    meta?: {
        module?: number;
        weeksKey?: string;
        bulletKeys?: string[];
    };
    topics: string[];
};

export type SlimTopicManifest = {
    topicId: string;
    minutes: number;
    topic: {
        labelKey: string;
        summaryKey: string;
    };
    runtimeDefaults?: ManifestRuntimeDefaults | null;
    cards: ManifestCard[];
    sketches: ManifestSketch[];
    exercises: ManifestExercise[];
};

export type FullTopicManifest = SlimTopicManifest & {
    subjectSlug: string;
    moduleSlug: string;
    sectionSlug: string;
    prefix: string;
};

export type TopicManifestRefMap = Record<string, SlimTopicManifest>;
