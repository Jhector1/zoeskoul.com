export type WorkspaceCapability = {
    enabled: boolean;
    label?: string;
    notes?: string;
};

export type WorkspaceUiLabels = {
    editorLabel?: string;
    runButtonLabel?: string;
    outputPanelLabel?: string;
    feedbackPanelLabel?: string;
    terminalPanelLabel?: string | null;
    filesPanelLabel?: string | null;
    resultsTableLabel?: string | null;
};

export type WorkspaceCapabilities = {
    singleFileCodeInput: WorkspaceCapability;
    multiFileProjects: WorkspaceCapability;
    terminal: WorkspaceCapability;
    filesystem: WorkspaceCapability;

    /**
     * The learner can create new files in the online editor/file explorer.
     */
    createFiles?: WorkspaceCapability;

    /**
     * The learner can create folders/directories in the online editor/file explorer.
     * Authored curriculum folders are represented by slash-delimited file paths,
     * for example "src/main.py" or "data/input.txt".
     */
    createFolders?: WorkspaceCapability;

    stdinStdout: WorkspaceCapability;
    packageInstall: WorkspaceCapability;
    externalNetwork: WorkspaceCapability;
    uploads: WorkspaceCapability;

    sql?: {
        queryRunner: WorkspaceCapability;
        resultsTable: WorkspaceCapability;
        schemaBrowser: WorkspaceCapability;
        erdDiagram: WorkspaceCapability;
        chenDiagram: WorkspaceCapability;
    };
};

export type WorkspaceProfile = {
    id: string;
    name: string;
    ui: WorkspaceUiLabels;
    capabilities: WorkspaceCapabilities;
    preferredActionLanguage: string[];
    forbiddenActionLanguage: string[];
};

export type WorkspacePolicy = {
    workspaceProfileId?: string;
    workspaceOverrides?: Partial<WorkspaceProfile>;
};

export type CourseGenerationPolicy = {
    studentActionStyle?: string;
    forbidUnavailableWorkspaceActions?: boolean;
    avoidTerms?: string[];
    preferredTerms?: Record<string, string>;
    notes?: string[];
};

export type AuthoringPolicyOverride = {
    path: string;
    reason: string;
};

export type AuthoringModuleRule = {
    allowedConcepts?: string[];
    disallowedConcepts?: string[];
    preferredTerms?: Record<string, string>;
    forbiddenActions?: string[];
    learnerInstructions?: string[];
    notes?: string[];
    validationRequirements?: Record<string, unknown>;
};

export type AuthoringPolicyLayer = {
    policyId?: string;
    workspaceProfileId?: string;
    workspacePolicyId?: string;
    practiceDefaults?: import("./practice.js").PracticeConfig;
    topicDefaults?: {
        conceptualOnly?: boolean;
        requiresTryIt?: boolean;
        conceptualSignals?: string[];
    };
    uiTerms?: Record<string, string>;
    forbiddenActions?: string[];
    preferredTerms?: Record<string, string>;
    learnerInstructions?: string[];
    avoidTerms?: string[];
    notes?: string[];
    validationRequirements?: Record<string, unknown>;
    quizDefaults?: {
        allowCodeInput?: boolean;
        allowedKinds?: import("./exercise-policy.js").ExerciseKindKey[];
    };
    projectRequirements?: Record<string, unknown>;
    exerciseKindRules?: Record<string, unknown>;
    allowedConcepts?: string[];
    disallowedConcepts?: string[];
    datasets?: string[];
    moduleRules?: Record<string, AuthoringModuleRule>;
    overrides?: AuthoringPolicyOverride[];
    rules?: Record<string, unknown>;
    runtime?: Record<string, unknown>;
    checker?: Record<string, unknown>;
};

export type ResolvedAuthoringPolicy = AuthoringPolicyLayer & {
    sources: string[];
    warnings: string[];
};

export type ModulePedagogyPolicy = {
    moduleNumber: number;
    workspaceProfileId?: string;
    workspaceOverrides?: Partial<WorkspaceProfile>;
    allowedConcepts?: string[];
    forbiddenConcepts?: string[];
    allowedActions?: string[];
    forbiddenActions?: string[];
    notes?: string[];
};

export type TopicPedagogyPolicy = {
    teachingMode?: "normal" | "ui-guided" | "conceptual-only" | "simulated-files";
    conceptualOnly?: boolean;
    requiresTryIt?: boolean;
    runtimeMode?: import("./practice.js").PracticeRuntimeMode;
    expectedPracticeKinds?: string[];
    terminalSessionScope?: import("./practice.js").TerminalSessionScope;
    generationTargets?: {
        quizBankMin?: number;
        quizBankTarget?: number;
        quizVisibleDefault?: number;
        quizVisibleMax?: number;
        projectCodeInputMin?: number;
        projectCodeInputTarget?: number;
        projectCodeInputMax?: number;
        maxAttempts?: number | null;
    };
    workspaceOverrides?: Partial<WorkspaceProfile>;
    allowedConcepts?: string[];
    forbiddenConcepts?: string[];
    notes?: string[];
};
