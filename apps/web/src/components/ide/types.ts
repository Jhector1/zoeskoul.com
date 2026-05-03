import {WorkspaceLanguage} from "@/lib/practice/types";


export type NodeId = string;

export type FolderNode = {
    id: NodeId;
    kind: "folder";
    name: string;
    parentId: NodeId | null;
    createdAt: number;
    updatedAt: number;
};

export type FileNode = {
    id: NodeId;
    kind: "file";
    name: string;
    parentId: NodeId | null;
    content: string;
    createdAt: number;
    updatedAt: number;
};

export type FSNode = FolderNode | FileNode;

export type WorkspaceStateV2 = {
    version: 2;
    language: WorkspaceLanguage;
    nodes: FSNode[];
    openTabs: NodeId[];
    activeFileId: NodeId;
    entryFileId: NodeId;
    stdin: string;
    expanded: NodeId[];
    leftPct: number;
};

export type InlineEdit =
    | {
    mode: "new-file" | "new-folder" | "rename";
    parentId: NodeId | null;
    targetId?: NodeId;
    value: string;
}
    | null;

type ToastKind = "info" | "success" | "error";

export type Toast = {
    kind: ToastKind;
    text: string;
} | null;





import type React from "react";

import type { IdeCapabilities } from "@/lib/access/ideCapabilities";
import type { RunResult } from "@/lib/code/types";
import type { SqlDialect } from "@/lib/practice/types";
import type {
    ProjectResponse,
    ProjectScopeInput,
    ProjectSummary,
    SaveProjectRequest,
} from "@/lib/projects/projectApiTypes";
import type {
    FullIDEServicePreset,
    FullIDEServicesInput,
} from "@/components/ide/fullide/services";

// export type ToastKind = "info" | "success" | "error";

export type ToastState = Toast;
export type RouterPushHref =
    | string
    | {
    readonly pathname?: string;
    readonly query?: Record<string, string | number | boolean | null | undefined>;
};
export type FullIDEProps = {
    title?: string;
    height?: number;
    className?: string;
    fullHeight?: boolean;
    storageKey?: string;
    language?: WorkspaceLanguage;
    onChangeLanguage?: (l: WorkspaceLanguage) => void;
    resetOnForcedLanguageChange?: boolean;
    showTopLanguageButtons?: boolean;
    lessonHref?: string;
    lessonLabel?: string;
    access: Pick<
        IdeCapabilities,
        "hasUser" | "canUseMultiFile" | "canSaveCloud" | "canCreateProjects"
    >;
    loginHref?: RouterPushHref;
    billingHref?: string;
    initialProjectId?: string | null;
    projectTitle?: string;
    projectDescription?: string | null;
    projectScope?: ProjectScopeInput;
    draftStorageMode?: "off" | "local";
    onReadyChange?: (ready: boolean) => void;
    servicePreset?: FullIDEServicePreset;
    services?: FullIDEServicesInput;
    initialWorkspace?: WorkspaceStateV2 | null;
    externalWorkspace?: WorkspaceStateV2 | null;
    onWorkspaceChange?: (workspace: WorkspaceStateV2 | null) => void;
    onBeforeRun?: () => void | Promise<void>;
    onRunResult?: (args: { result: RunResult; runArgs: any }) => void;
    initialSqlDialect?: SqlDialect;
    forceDesktopLayout?: boolean;
    exerciseStateKey?: string;
    sqlInitialTableSnapshots?: Record<
        string,
        {
            name: string;
            columns: Array<{ name: string; type?: string | null }>;
            rows: unknown[][];
            rowCount: number;
        }
    >;
};

export type ProjectsHookResult = {
    projects: ProjectSummary[];
    loading: boolean;
    error: string | null;
    refresh: () => Promise<unknown> | void;
};

export type DirtyStateApi = {
    isDirty: boolean;
    markSaved: (workspace: SaveProjectRequest["workspace"]) => void;
    markLoaded: (workspace: SaveProjectRequest["workspace"]) => void;
    clearSavedBaseline: () => void;
};

export type ProjectSessionApi = {
    projectId: string | null;
    currentProjectName: string;
    loadingProject: boolean;
    isSavingProject: boolean;
    lastSavedAt: string | null;
    saveError: string | null;
    projectsOpen: boolean;
    setProjectsOpen: React.Dispatch<React.SetStateAction<boolean>>;
    confirmSwitchOpen: boolean;
    saveAsOpen: boolean;
    renameOpen: boolean;
    renamingProject: ProjectSummary | null;
    projectModalBusy: boolean;
    setSaveAsOpen: React.Dispatch<React.SetStateAction<boolean>>;
    setRenameOpen: React.Dispatch<React.SetStateAction<boolean>>;
    setRenamingProject: React.Dispatch<React.SetStateAction<ProjectSummary | null>>;
    saveProject: () => Promise<boolean>;
    saveAsProject: (title: string) => Promise<boolean>;
    renameProject: (title: string) => Promise<boolean>;
    archiveProject: (projectId: string) => Promise<void>;
    startBlankProject: () => void;
    requestOpenProject: (projectId: string) => void;
    handleSaveAndContinue: () => Promise<void>;
    handleDiscardAndContinue: () => void;
    cancelPendingSwitch: () => void;
    syncTerminalFiles: (sessionId: string) => Promise<boolean>;
};
export type ViewportApi = {
    isDesktop: boolean;
    editorHeight: number;
};

export type RunnerApi = {
    onRunProject: (args: any) => Promise<RunResult>;
};

export type WorkspaceHookApi = {
    state: any;
    derived: any;
    actions: any;
};

export type LoadProjectResponse = ProjectResponse;
export type PersistProjectResult = { ok: true; data: any } | { ok: false };

export type UseIdeProjectSessionArgs = {
    title: string;
    projectTitle?: string | null;
    projectDescription?: string | null;
    projectScope?: ProjectScopeInput;
    initialProjectId?: string | null;
    access: FullIDEProps["access"];
    loginHref: string;
    billingHref: string;
    routerPush: (href: string) => void;
    language: WorkspaceLanguage;
    sqlDialect: SqlDialect;
    currentWorkspace: SaveProjectRequest["workspace"] | null;
    nodes: any[];
    activeFile: any | null;
    entryFile: any | null;
    replaceWorkspace: (ws: SaveProjectRequest["workspace"]) => void;
    resetWorkspaceForLanguage?: (language: WorkspaceLanguage) => void;
    markLoaded: DirtyStateApi["markLoaded"];
    markSaved: DirtyStateApi["markSaved"];
    clearSavedBaseline: DirtyStateApi["clearSavedBaseline"];
    isDirty: boolean;
    actorKey: string;
    setToast: (toast: ToastState) => void;
    refreshProjects: ProjectsHookResult["refresh"];
};
