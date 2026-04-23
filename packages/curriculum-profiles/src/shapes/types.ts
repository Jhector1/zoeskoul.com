export type SubjectSlug = string;
export type ModuleSlug = string;
export type SectionSlug = string;
export type TopicId = string;
export type ExerciseId = string;

export type ManifestKeyPatterns = {
    subjectTitleKey: (subjectSlug: SubjectSlug) => string;
    subjectDescriptionKey: (subjectSlug: SubjectSlug) => string;
    subjectMoreComingKey: (subjectSlug: SubjectSlug) => string;

    moduleTitleKey: (subjectSlug: SubjectSlug, moduleSlug: ModuleSlug) => string;
    moduleDescriptionKey: (subjectSlug: SubjectSlug, moduleSlug: ModuleSlug) => string;
    modulePrereqKey: (subjectSlug: SubjectSlug, moduleSlug: ModuleSlug, index: number) => string;
    moduleOutcomeKey: (subjectSlug: SubjectSlug, moduleSlug: ModuleSlug, index: number) => string;
    moduleWhyKey: (subjectSlug: SubjectSlug, moduleSlug: ModuleSlug, index: number) => string;

    sectionTitleKey: (
        subjectSlug: SubjectSlug,
        moduleSlug: ModuleSlug,
        sectionSlug: SectionSlug,
    ) => string;
    sectionDescriptionKey: (
        subjectSlug: SubjectSlug,
        moduleSlug: ModuleSlug,
        sectionSlug: SectionSlug,
    ) => string;
    sectionWeeksKey: (
        subjectSlug: SubjectSlug,
        moduleSlug: ModuleSlug,
        sectionSlug: SectionSlug,
    ) => string;
    sectionBulletKey: (
        subjectSlug: SubjectSlug,
        moduleSlug: ModuleSlug,
        sectionSlug: SectionSlug,
        index: number,
    ) => string;

    topicLabelKey: (
        subjectSlug: SubjectSlug,
        moduleSlug: ModuleSlug,
        topicId: TopicId,
    ) => string;
    topicSummaryKey: (
        subjectSlug: SubjectSlug,
        moduleSlug: ModuleSlug,
        topicId: TopicId,
    ) => string;

    topicCardTitleKey: (
        subjectSlug: SubjectSlug,
        moduleSlug: ModuleSlug,
        topicId: TopicId,
        cardId: string,
    ) => string;

    topicProjectStepTitleKey: (
        subjectSlug: SubjectSlug,
        moduleSlug: ModuleSlug,
        topicId: TopicId,
        stepId: string,
    ) => string;

    sketchTitleKey: (
        subjectSlug: SubjectSlug,
        moduleSlug: ModuleSlug,
        topicId: TopicId,
        sketchId: string,
    ) => string;
    sketchBodyKey: (
        subjectSlug: SubjectSlug,
        moduleSlug: ModuleSlug,
        topicId: TopicId,
        sketchId: string,
    ) => string;

    exerciseMessageBase: (exerciseId: ExerciseId) => string;
};

export type FileSystemShape = {
    subjectRootDir: (subjectSlug: SubjectSlug) => string;
    moduleDirName: (moduleOrder: number) => string;
    topicDirName: (topicId: TopicId) => string;
    topicBundleFileName: "topic.bundle.json";
    subjectManifestFileName: "subject.manifest.json";
    topicsGeneratedFileName: "topics.generated.ts";

    messageSubjectDir: (locale: string, subjectSlug: SubjectSlug) => string;
    messageModuleDirName: (moduleOrder: number) => string;
    messageTopicFileName: (topicId: TopicId) => string;
};

export type SubjectManifestShape = {
    genKey: string;
    moduleSlug: (order: number) => ModuleSlug;
    modulePrefix: (order: number) => string;
    sectionSlug: (moduleOrder: number, sectionOrder: number) => SectionSlug;
    accessPolicyDefault: "free" | "paid";
    statusDefault: "active" | "coming_soon" | "disabled";
    completionPolicy: {
        requireAllPublishedModules: boolean;
        rewardEnabledByDefault: boolean;
        certificateEnabledByDefault: boolean;
    };
    keyPatterns: ManifestKeyPatterns;
};

export type TopicBundleShape = {
    requiredTopLevelFields: readonly [
        "topicId",
        "subjectSlug",
        "moduleSlug",
        "sectionSlug",
        "prefix",
        "minutes",
        "topic",
        "cards",
        "sketches",
        "exercises",
    ];
    topicFields: readonly ["labelKey", "summaryKey"];
    allowedCardKinds: readonly ["sketch", "project", "quiz"];
    allowedSketchArchetypes: readonly ["paragraph"];
    allowedExerciseKinds: readonly [
        "single_choice",
        "multi_choice",
        "drag_reorder",
        "fill_blank_choice",
        "code_input",
    ];
};

export type MessageShape = {
    logicalNamespaces: readonly ["topics", "sketches", "quiz"];
};

export type SqlCodeRecipeShape = {
    kind: "code_input";
    language: "sql";
    fixedSqlDialect: "sqlite";
    recipeType: "sql_query";
    requiredRecipeFields: readonly ["type", "datasetId", "resultShape", "solutionCode"];
    allowedDatasetIds: readonly string[];
};

export type PythonCodeRecipeShape = {
    kind: "code_input";
    language: "python";
    recipeTypes: readonly ["template_io", "fixed_tests"];
    templateIoRequiredFields: readonly ["type", "vars", "tests", "solutionTemplate"];
    fixedTestsRequiredFields: readonly ["type", "tests", "solutionCode"];
};

export type QuizShape = {
    singleChoice: {
        requiredFields: readonly ["id", "kind", "purpose", "weight", "messageBase", "optionIds", "expected"];
    };
    multiChoice: {
        requiredFields: readonly ["id", "kind", "purpose", "weight", "messageBase", "optionIds", "expected"];
    };
    dragReorder: {
        requiredFields: readonly ["id", "kind", "purpose", "weight", "messageBase", "tokenIds", "expected"];
    };
    fillBlankChoice: {
        requiredFields: readonly ["id", "kind", "purpose", "weight", "messageBase", "choiceCount", "expected"];
    };
};

export type ProjectShape = {
    cardKind: "project";
    projectFields: readonly ["difficulty", "allowReveal", "preferKind", "maxAttempts", "steps"];
    projectStepFields: readonly [
        "id",
        "titleKey",
        "exerciseKey",
        "difficulty",
        "preferKind",
        "seedPolicy",
        "maxAttempts",
    ];
};

export type SubjectShapePack = {
    profileId: "sql" | "python" | "math" | "language" | "web" | "data_science";
    subjectManifest: SubjectManifestShape;
    topicBundle: TopicBundleShape;
    messages: MessageShape;
    filesystem: FileSystemShape;
    project: ProjectShape;
    quiz: QuizShape;
    sqlCodeRecipe?: SqlCodeRecipeShape;
    pythonCodeRecipe?: PythonCodeRecipeShape;

    aiContract: {
        description: string;
        rules: string[];
        doNotGenerate: string[];
    };
};