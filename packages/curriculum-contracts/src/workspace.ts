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

export type ModulePedagogyPolicy = {
    moduleNumber: number;
    allowedConcepts?: string[];
    forbiddenConcepts?: string[];
    allowedActions?: string[];
    forbiddenActions?: string[];
    notes?: string[];
};

export type TopicPedagogyPolicy = {
    teachingMode?: "normal" | "ui-guided" | "conceptual-only" | "simulated-files";
    workspaceOverrides?: Partial<WorkspaceProfile>;
    allowedConcepts?: string[];
    forbiddenConcepts?: string[];
    notes?: string[];
};