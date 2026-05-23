import type {
    ManifestCard,
    ManifestExercise,
    ManifestSketch,
    ManifestRuntimeDefaults,
    TopicBundleManifest as BaseTopicBundleManifest,
} from "@/lib/subjects/_core/manifestTypes";
import type { LearningIdeConfig } from "@/lib/ide/learningIdeConfig";

export type SubjectCurriculumManifestMeta = {
    plannedModuleCount?: number;
    isTerminalRelease?: boolean;
    moreComingMessageKey?: string;
};
export type SubjectVersioningManifestMeta = {
    family: string;
    version: number;
    status: "draft" | "active" | "legacy" | "disabled";
    defaultForNewEnrollments?: boolean;
    supersedes?: string | null;
    supersededBy?: string | null;
};
export type SubjectCompletionPolicyManifestMeta = {
    requireAllPublishedModules?: boolean;
    rewardEnabledByDefault?: boolean;
    certificateEnabledByDefault?: boolean;
};

export type SubjectManifest = {
    subject: {
        slug: string;
        profileId?: string | null;
        catalogSlug?: string | null;
        genKey: string;
        order: number;
        accessPolicy?: "free" | "paid";
        status?: "active" | "coming_soon" | "disabled";
        imagePublicId?: string | null;
        imageAlt?: string | null;
        titleKey: string;
        descriptionKey?: string | null;
        serviceDefaults?: LearningIdeConfig | null;
        meta?: {
            versioning?: SubjectVersioningManifestMeta;
            curriculum?: SubjectCurriculumManifestMeta;
            completionPolicy?: SubjectCompletionPolicyManifestMeta;
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
    serviceDefaults?: LearningIdeConfig | null;
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
    serviceDefaults?: LearningIdeConfig | null;
    meta?: {
        module?: number;
        weeksKey?: string;
        bulletKeys?: string[];
    };
    topics: string[];
};

export type CatalogManifest = {
    catalog: {
        slug: string;
        order: number;
        title: string;
        description?: string | null;
        imagePublicId?: string | null;
        imageAlt?: string | null;
        defaultSubjectSlug?: string | null;
        status?: "active" | "coming_soon" | "disabled";
        subjectSlugs: string[];
        meta?: Record<string, unknown> | null;
    };
};

export type ResolvedSubjectCatalogItem = {
    slug: string;
    title: string;
    description: string;
    imagePublicId: string | null;
    imageAlt: string | null;
    defaultModuleSlug: string | null;
};

export type ResolvedSubjectCatalogMap = Record<string, ResolvedSubjectCatalogItem>;

export type ResolvedCatalogSubjectItem = ResolvedSubjectCatalogItem & {
    status: "active" | "coming_soon" | "disabled";
};

export type ResolvedCatalogItem = {
    slug: string;
    title: string;
    description: string;
    imagePublicId: string | null;
    imageAlt: string | null;
    defaultSubjectSlug: string | null;
    status: "active" | "coming_soon" | "disabled";
    subjects: ResolvedCatalogSubjectItem[];
};

export type ResolvedModuleIntroView = {
    subject: {
        slug: string;
        title: string;
        description: string;
        imagePublicId: string | null;
        imageAlt: string | null;
    };
    module: {
        slug: string;
        title: string;
        description: string;
        order: number;
        weekStart: number | null;
        weekEnd: number | null;
        meta: {
            estimatedMinutes: number | null;
            prereqs: string[];
            outcomes: string[];
            why: string[];
        };
    };
};

export type ResolvedSubjectModule = {
    slug: string;
    title: string;
    description: string;
    order: number;
    weekStart: number | null;
    weekEnd: number | null;
};

export type ResolvedSubjectModulesView = {
    subject: {
        slug: string;
        title: string;
        description: string;
    };
    modules: ResolvedSubjectModule[];
};

export type TopicManifestRefMap = Record<string, SlimTopicManifest>;

export type SlimTopicManifest = {
    topicId: string;
    minutes: number;
    topic: {
        labelKey: string;
        summaryKey: string;
    };
    serviceDefaults?: LearningIdeConfig | null;
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

export type TopicBundleManifest = BaseTopicBundleManifest;
