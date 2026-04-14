import type { PracticeKind } from "@prisma/client";
import type { ManifestRuntimeDefaults } from "@/lib/subjects/_core/manifestTypes";

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
    maxAttempts?: number;
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
    maxAttempts?: number;
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
    maxAttempts?: number;
    steps: ReviewProjectStep[];
    runtime?: ManifestRuntimeDefaults | null;
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
    spec?: any;
})
    | (ReviewCardProgressMeta & {
    type: "sketch";
    id: string;
    title?: string;
    sketchId: string;
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
        [key: string]: unknown;
    } | null;
    cards: ReadonlyArray<ReviewCard>;
};

export type ReviewTopicShape = ReviewTopic;

export type ReviewModule = {
    id: string;
    title: string;
    subtitle?: string | null;
    startPracticeSectionSlug: string;
    runtimeDefaults?: ManifestRuntimeDefaults | null;
    topics: ReviewTopicShape[];
};