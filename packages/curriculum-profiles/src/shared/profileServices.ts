import type {
    TopicAuthoringDraft,
    TopicSeed,
    TopicBundleManifest,
} from "@zoeskoul/curriculum-contracts";

export type RepairSeverity = "low" | "medium" | "high";
export type CritiqueSeverity = "warn" | "error";
export type SemanticValidationSeverity = "warn" | "error";

export type RepairCategory =
    | "answer_key"
    | "ordering"
    | "hint"
    | "text"
    | "dataset"
    | "recipe"
    | "other";

export type CritiqueCategory =
    | "answer_key"
    | "hint"
    | "difficulty"
    | "redundancy"
    | "clarity"
    | "pedagogy"
    | "other";

export type SemanticValidationCategory =
    | "execution"
    | "result_shape"
    | "prompt_intent"
    | "dataset"
    | "aggregate"
    | "join"
    | "tests"
    | "behavior"
    | "pedagogy"
    | "other";

export type RepairEntry = {
    code: string;
    category: RepairCategory;
    severity: RepairSeverity;
    field: string;
    message: string;
};

export type RepairReport = {
    topicId: string;
    repairs: RepairEntry[];
};

export type CritiqueIssue = {
    code: string;
    category: CritiqueCategory;
    severity: CritiqueSeverity;
    exerciseId?: string;
    message: string;
};

export type CritiqueReport = {
    topicId: string;
    ok: boolean;
    issues: CritiqueIssue[];
};

export type SemanticValidationIssue = {
    code: string;
    category: SemanticValidationCategory;
    severity: SemanticValidationSeverity;
    exerciseId?: string;
    message: string;
};

export type SemanticValidationReport = {
    topicId: string;
    ok: boolean;
    issues: SemanticValidationIssue[];
};

export type GoldenValidationSeverity = "warn" | "error";

export type GoldenValidationCategory =
    | "recipe"
    | "runtime"
    | "bundle"
    | "tests"
    | "dataset"
    | "other";

export type GoldenValidationIssue = {
    code: string;
    category: GoldenValidationCategory;
    severity: GoldenValidationSeverity;
    exerciseId?: string;
    message: string;
};

export type GoldenValidationReport = {
    topicId: string;
    ok: boolean;
    issues: GoldenValidationIssue[];
};

export type ProfileTrustPolicy = {
    profileId: string;
    autoPublishEnabled: boolean;
    requiresCritiquePass: boolean;
    requiresSemanticValidation: boolean;
    maxHintWarnings: number;
    maxMediumRepairs: number;
    allowHighSeverityRepairs: boolean;
};

export type ProfileServices = {
    profileId: string;

    repairDraft(args: {
        seed: TopicSeed;
        draft: TopicAuthoringDraft;
    }): Promise<{
        draft: TopicAuthoringDraft;
        report: RepairReport;
    }>;

    critiqueDraft(args: {
        seed: TopicSeed;
        draft: TopicAuthoringDraft;
    }): Promise<CritiqueReport>;

    validateProfile(args: {
        seed: TopicSeed;
        draft: TopicAuthoringDraft;
    }): Promise<string[]>;

    validateSemantic(args: {
        seed: TopicSeed;
        draft: TopicAuthoringDraft;
    }): Promise<SemanticValidationReport>;

    validateGolden(args: {
        seed: TopicSeed;
        draft: TopicAuthoringDraft;
        topicBundle: TopicBundleManifest;
    }): Promise<GoldenValidationReport>;

    getTrustPolicy(): ProfileTrustPolicy;
};
