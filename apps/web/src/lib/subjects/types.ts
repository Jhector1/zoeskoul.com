import type { PracticeKind } from "@zoeskoul/db";
import type { ManifestRuntimeDefaults } from "@/lib/subjects/_core/manifestTypes";
import type { LearningIdeConfig } from "@/lib/ide/learningIdeConfig";
import type { ReviewContentVersion } from "@/lib/review/contentVersionTypes";
import type { CodeInputSurface, CodeInputUiSpec } from "@/lib/practice/types";
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
    /** Exact authored non-code quiz exercise keys for this quiz card. */
    exerciseKeys?: string[];
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
    /**
     * Optional authoring hint for code_input display surface. Runtime still
     * forces workspace when this project step provides files/multi-file data.
     */
    codeSurface?: CodeInputSurface;
    /** @deprecated Prefer codeSurface: "embedded". */
    embedded?: boolean;
    /** @deprecated Prefer codeSurface: "embedded". */
    embeddedCodeInput?: boolean;
    ui?: CodeInputUiSpec;

    /**
     * Optional project-step authored workspace fallback.
     *
     * These fields are intentionally optional because normal published topics
     * usually resolve the exercise through exerciseKey. Dev clones and capstone
     * step-to-step projects can still carry a full starter snapshot here so
     * Tools never falls back to blank/stale editor state while practice data is
     * loading.
     */
    starterCode?: string;
    solutionCode?: string;
    starterFiles?: unknown;
    solutionFiles?: unknown;
    workspace?: unknown;
    files?: unknown;
    fixtureFiles?: unknown;
    initialFiles?: unknown;
    workspaceFiles?: unknown;
    fixtures?: unknown;
    fileFixtures?: unknown;
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

export type ReviewCardToolsSpec = {
    /**
     * Controls whether the right Tools rail opens by default for this card.
     * Missing values preserve legacy behavior; the runtime still keeps Tools
     * visible for cards that require a workspace.
     */
    defaultVisible?: boolean;
    /**
     * Controls whether learners may manually open Tools for this card.
     * Missing values allow opening so older bundles keep working.
     */
    allowOpen?: boolean;
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
    tools?: ReviewCardToolsSpec | null;
};

export type ReviewCard =
    | (ReviewCardProgressMeta & {
    type: "text";
    id: string;
    title?: string;
    markdown: string;
    tryIt?: ReviewEmbeddedTryIt | null;
    spec?: any;
    tools?: ReviewCardToolsSpec | null;
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
    tools?: ReviewCardToolsSpec | null;
})
    | (ReviewCardProgressMeta & {
    type: "quiz";
    id: string;
    title?: string;
    passScore?: number;
    spec: ReviewQuizSpec;
    tools?: ReviewCardToolsSpec | null;
})
    | (ReviewCardProgressMeta & {
    type: "project";
    id: string;
    title?: string;
    passScore?: number;
    tryIt?: boolean | string | null;
    spec: ReviewProjectSpec;
    tools?: ReviewCardToolsSpec | null;
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
