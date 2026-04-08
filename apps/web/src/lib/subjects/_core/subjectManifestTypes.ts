import type { ExerciseKind } from "@/lib/practice/types";
import type { PracticeKind } from "@prisma/client";

/* =========================
   Raw subject manifest types
   ========================= */

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

/* =========================
   Resolved presentation types
   ========================= */

export type ResolvedSubjectCatalogItem = {
    slug: string;
    title: string;
    description: string;
    imagePublicId: string | null;
    imageAlt: string | null;
    defaultModuleSlug: string | null;
};

export type ResolvedSubjectCatalogMap = Record<string, ResolvedSubjectCatalogItem>;

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

/* =========================
   Topic manifest types
   ========================= */

export type TopicManifestRefMap = Record<string, SlimTopicManifest>;

export type ManifestProjectStep = {
    id: string;
    titleKey: string;
    exerciseKey: string;
    difficulty?: "easy" | "medium" | "hard";
    preferKind?: PracticeKind | null;
    seedPolicy?: "global" | "step";
    maxAttempts?: number;
};

export type ManifestCard =
    | {
    id: string;
    kind: "sketch";
    titleKey: string;
    sketchId: string;
    height?: number;
}
    | {
    id: string;
    kind: "quiz";
    titleKey: string;
    quiz: {
        difficulty: "easy" | "medium" | "hard";
        n: number;
        allowReveal?: boolean;
        preferKind?: ExerciseKind | null;
        maxAttempts?: number;
    };
}
    | {
    id: string;
    kind: "project";
    titleKey: string;
    project: {
        difficulty: "easy" | "medium" | "hard";
        allowReveal?: boolean;
        preferKind?: PracticeKind | null;
        maxAttempts?: number;
        steps: ManifestProjectStep[];
    };
};

export type ManifestSketch = {
    id: string;
    archetype: "paragraph";
    titleKey: string;
    bodyKey: string;
    images?: Array<{
        id: string;
        publicId: string;
        alt?: string;
        width?: number;
        height?: number;
    }>;
};

export type ManifestBaseExercise = {
    id: string;
    kind: ExerciseKind;
    purpose?: "quiz" | "project";
    weight?: number;
    messageBase: string;
};

export type ManifestSingleChoice = ManifestBaseExercise & {
    kind: "single_choice";
    optionIds: string[];
    expected: {
        kind: "single_choice";
        optionId: string;
    };
};

export type ManifestMultiChoice = ManifestBaseExercise & {
    kind: "multi_choice";
    optionIds: string[];
    expected: {
        kind: "multi_choice";
        optionIds: string[];
    };
};

export type ManifestDragReorder = ManifestBaseExercise & {
    kind: "drag_reorder";
    tokenIds: string[];
    expected: {
        kind: "drag_reorder";
        tokenIds: string[];
    };
};

export type ManifestFillBlankChoice = ManifestBaseExercise & {
    kind: "fill_blank_choice";
    choiceCount: number;
    expected: {
        kind: "fill_blank_choice";
        value: string;
    };
};

export type ManifestCodeInput = ManifestBaseExercise & {
    kind: "code_input";
    language?: string;
    fixedSqlDialect?: string;
    recipe: ManifestRecipe;
};

export type ManifestExercise =
    | ManifestSingleChoice
    | ManifestMultiChoice
    | ManifestDragReorder
    | ManifestFillBlankChoice
    | ManifestCodeInput;

export type ManifestRecipe =
    | {
    type: "fixed_tests";
    tests: Array<{
        stdin?: string;
        stdout: string;
        match?: "exact" | "includes";
    }>;
    solutionCode?: string;
}
    | {
    type: "sql_query";
    datasetId: string;
    solutionCode: string;
    resultShape?: "table";
    ignoreRowOrder?: boolean;
}
    | {
    type: "template_io";
    vars: Record<string, ManifestVarSpec>;
    computed?: Record<string, ManifestComputedSpec>;
    tests: Array<{
        stdinTemplate?: string;
        stdoutTemplate: string;
        match?: "exact" | "includes";
    }>;
    solutionTemplate?: string;
};

export type ManifestVarSpec =
    | { source: "int"; min: number; max: number }
    | { source: "pick"; from: string[] }
    | { source: "pickDifferentFromVar"; from: string[]; var: string }
    | { source: "intDifferentFromVar"; min: number; max: number; var: string };

export type ManifestComputedSpec =
    | { op: "add"; left: string; right: number }
    | { op: "sub"; left: string; right: number }
    | { op: "mul"; left: string; right: number }
    | { op: "floor_div"; left: string; right: number }
    | { op: "c_to_f_int"; left: string }
    | { op: "mul_div_floor"; left: string; right: string; divisor: number };

export type SlimTopicManifest = {
    topicId: string;
    minutes: number;
    topic: {
        labelKey: string;
        summaryKey: string;
    };
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

export type TopicBundleManifest = {
    topicId: string;
    subjectSlug: string;
    moduleSlug: string;
    sectionSlug: string;
    prefix: string;
    minutes: number;
    topic: {
        labelKey: string;
        summaryKey: string;
    };
    cards: ManifestCard[];
    sketches: ManifestSketch[];
    exercises: ManifestExercise[];
};