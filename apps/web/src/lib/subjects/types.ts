import type { PracticeKind } from "@zoeskoul/db";
import type { ManifestRuntimeDefaults } from "@/lib/subjects/_core/manifestTypes";
import type { LearningIdeConfig } from "@/lib/ide/learningIdeConfig";
import type { ReviewContentVersion } from "@/lib/review/contentVersionTypes";
export type ReviewQuestion =
    | {
    kind: "mcq";
    id: string;
    prompt: string;
    choices: { id: string; label: string }[];
    answerId: string;
    explain?: string;
}
    | {
    kind: "numeric";
    id: string;
    prompt: string;
    answer: number;
    tolerance?: number;
    explain?: string;
}
    | {
    kind: "practice";
    id: string;
    prompt?: string;
    fetch: {
        subject: string;
        module?: string;
        section?: string;
        topic?: string;
        difficulty?: "easy" | "medium" | "hard";
        allowReveal?: boolean;
        preferKind?: PracticeKind | null;
    };
    maxAttempts?: number;
};

export type ReviewTopicId = string;

export type ReviewQuizSpec = {
    subject: string;
    module?: string;
    moduleSlug?: string;
    section?: string;
    topic?: string;
    difficulty?: "easy" | "medium" | "hard";
    n?: number;
    allowReveal?: boolean;
    preferKind?: PracticeKind | null;
    maxAttempts?: number | null;
    runtime?: ManifestRuntimeDefaults | null;
};

export type ReviewVideoProvider = "auto" | "youtube" | "vimeo" | "iframe" | "file";

export type SeedPolicy = "actor" | "global";
export type Difficulty = "easy" | "medium" | "hard";
export type PurposeMode = "quiz" | "project" | "mixed";
export type PurposePolicy = "strict" | "fallback";

export type ReviewProjectStep = {
    id: string;
    title?: string;
    topic?: string;
    difficulty?: Difficulty;
    preferKind?: PracticeKind | null;
    exerciseKey?: string;
    seedPolicy?: SeedPolicy;
    maxAttempts?: number | null;
    carryFromPrev?: boolean;
};

export type ReviewProjectSpec = {
    mode: "project";
    subject: string;
    module?: string;
    moduleSlug?: string;
    section?: string;
    topic?: string;
    difficulty?: Difficulty;
    preferKind?: PracticeKind | null;
    allowReveal?: boolean;
    maxAttempts?: number | null;
    steps: ReviewProjectStep[];
    runtime?: ManifestRuntimeDefaults | null;
    tryIt?: boolean | string | null;
    displayKind?: string | null;
    uiKind?: string | null;
};

export type ReviewEmbeddedTryIt = {
    id: string;
    title?: string;
    prompt?: string;
    exerciseKey: string;
    difficulty?: Difficulty;
    preferKind?: PracticeKind | null;
    seedPolicy?: SeedPolicy;
    required?: boolean;
    allowReveal?: boolean;
    maxAttempts?: number | null;
    spec: ReviewProjectSpec;
};

export type ReviewCardProgressMeta = {
    progressKey?: string | null;
    legacyProgressKeys?: string[];
};

export type ReviewVideoCard = ReviewCardProgressMeta & {
    type: "video";
    id: string;
    title?: string;
    url: string;
    provider?: ReviewVideoProvider;
    startSeconds?: number;
    posterUrl?: string;
    captionMarkdown?: string;
    spec?: any;
};

export type ReviewCard =
    | (ReviewCardProgressMeta & {
    type: "text";
    id: string;
    title?: string;
    markdown: string;
    tryIt?: ReviewEmbeddedTryIt | null;
    spec?: any;
})
    | (ReviewCardProgressMeta & {
    type: "sketch";
    id: string;
    title?: string;
    sketchId: string;
    tryIt?: ReviewEmbeddedTryIt | null;
    spec?: any;
    height?: number;
    props?: any;
})
    | (ReviewCardProgressMeta & {
    type: "quiz";
    id: string;
    title?: string;
    passScore?: number;
    spec: ReviewQuizSpec;
})
    | (ReviewCardProgressMeta & {
    type: "project";
    id: string;
    title?: string;
    passScore?: number;
    tryIt?: boolean | string | null;
    spec: ReviewProjectSpec;
})
    | ReviewVideoCard;

export type ReviewTopic = {
    id: ReviewTopicId;
    label: string;
    minutes?: number;
    summary?: string;
    meta?: {
        runtimeDefaults?: ManifestRuntimeDefaults | null;
        serviceDefaults?: LearningIdeConfig | null;
        [key: string]: unknown;
    } | null;
    cards: ReadonlyArray<ReviewCard>;
};

export type ReviewTopicShape = ReviewTopic;

export type ReviewModuleSection = {
    id: string;
    slug: string;
    title: string;
    summary?: string | null;
    description?: string | null;
    order: number;
    runtimeDefaults?: ManifestRuntimeDefaults | null;
    topics: ReviewTopicShape[];
};

export type ReviewModule = {
    id: string;
    title: string;
    subtitle?: string | null;
    startPracticeSectionSlug: string;
    profileId?: string | null;
    versionFamily?: string | null;
    runtimeDefaults?: ManifestRuntimeDefaults | null;
    serviceDefaults?: LearningIdeConfig | null;

    /**
     * Keep required.
     * Current progress, card rendering, navigation, and topic lookup depend on this.
     */
    topics: ReviewTopicShape[];
    /**
     * Published content patch version for this exact subject/module.
     * This is used to detect stale loaded lesson/exercise content.
     */
    contentVersion?: ReviewContentVersion | null;
    /**
     * New optional structure for sidebar display:
     * module -> sections -> topics.
     *
     * Optional so old ReviewModule objects do not break.
     */
    sections?: ReviewModuleSection[];
};
