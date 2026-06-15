import type React from "react";
import type { WorkspaceLanguage } from "@/lib/practice/types";
import type {
  FileNode,
  FolderNode,
  FSNode,
  InlineEdit,
  NodeId,
  Toast,
  WorkspaceStateV2,
} from "../types";
import type { IdeWorkspacePolicy, ImportedWorkspaceFile } from "./workspace.policy";
import type { IdeFileActionsConfig } from "@/lib/ide/workspacePolicy";

export type IdeWorkspaceAccess = {
  hasUser: boolean;
  canUseMultiFile: boolean;
  canSaveCloud: boolean;
  canCreateProjects: boolean;
};

export type CreateNodeHandler = (parentId: NodeId | null) => void;

export type DraftStorageMode = "off" | "local";

export type UseIdeWorkspaceOpts = {
  storageKey?: string;
  forcedLanguage?: WorkspaceLanguage;
  resetOnForcedLanguageChange?: boolean;
  access?: IdeWorkspaceAccess;
  draftStorageMode?: DraftStorageMode;
  initialWorkspace?: WorkspaceStateV2 | null;

  actorKey?: string | null;
  projectId?: string | null;
  scopeKey?: string | null;
  exerciseStateKey?: string | null;
  localWorkspaceId?: string | null;

  policy?: IdeWorkspacePolicy;
  fileActions?: IdeFileActionsConfig | null;
};

export type WorkspaceMeta = {
  lastLanguage: WorkspaceLanguage;
  actorKey: string;
  projectId: string | null;
  scopeKey: string | null;
  exerciseStateKey: string | null;
  localWorkspaceId: string | null;
};

export type IdeWorkspaceState = {
  language: WorkspaceLanguage;
  nodes: FSNode[];
  openTabs: NodeId[];
  activeFileId: NodeId;
  entryFileId: NodeId;
  stdin: string;
  expanded: Set<NodeId>;
  leftPct: number;
  filter: string;
  inlineEdit: InlineEdit;
  pendingDeleteId: NodeId | null;
  toast: Toast;
  access: IdeWorkspaceAccess;
  policy: IdeWorkspacePolicy;
};

export type IdeWorkspaceDerived = {
  activeFile: FileNode | undefined;
  entryFile: FileNode | undefined;
  tabFiles: FileNode[];
  rootSrc: FolderNode | undefined;
  currentWorkspace: WorkspaceStateV2 | null;
  isSingleFileMode: boolean;
  storageHydrated: boolean;
};

export type DividerRootEl = HTMLElement | null;

export type IdeWorkspaceActions = {
  setLanguage: (next: WorkspaceLanguage) => void;
  setNodes: React.Dispatch<React.SetStateAction<FSNode[]>>;
  setOpenTabs: React.Dispatch<React.SetStateAction<NodeId[]>>;
  setActiveFileId: React.Dispatch<React.SetStateAction<NodeId>>;
  setEntryFileId: React.Dispatch<React.SetStateAction<NodeId>>;
  setStdin: React.Dispatch<React.SetStateAction<string>>;
  setExpanded: React.Dispatch<React.SetStateAction<Set<NodeId>>>;
  setLeftPct: React.Dispatch<React.SetStateAction<number>>;
  setFilter: React.Dispatch<React.SetStateAction<string>>;
  setInlineEdit: React.Dispatch<React.SetStateAction<InlineEdit>>;
  setPendingDeleteId: React.Dispatch<React.SetStateAction<NodeId | null>>;
  setToast: React.Dispatch<React.SetStateAction<Toast>>;
  importExternalFiles: (files: ImportedWorkspaceFile[]) => void;
  replaceWorkspace: (ws: WorkspaceStateV2) => void;
  resetWorkspaceForLanguage: (next: WorkspaceLanguage) => void;
  switchLanguage: (next: WorkspaceLanguage) => void;

  openFile: (id: NodeId) => void;
  closeTab: (id: NodeId) => void;
  onChangeCode: (code: string) => void;
  toggleFolder: (id: NodeId) => void;

  startNewFile: CreateNodeHandler;
  startNewFolder: CreateNodeHandler;
  startRename: (nodeId: NodeId) => void;
  moveNode: (id: string, parentId: string | null) => void;
  commitInlineEdit: () => void;
  cancelInlineEdit: () => void;

  setEntry: (id: NodeId) => void;
  requestDelete: (id: NodeId) => void;
  performDelete: () => void;

  onMouseDownDivider: (e: React.MouseEvent, rootEl: DividerRootEl) => void;
  onPointerDownDivider: (e: React.PointerEvent, rootEl: DividerRootEl) => void;
  onKeyDownDivider: (e: React.KeyboardEvent, rootEl: DividerRootEl) => void;

  undo: () => void;
  redo: () => void;
};

export type IdeWorkspaceConstants = {
  allLanguages: WorkspaceLanguage[];
};

export type UseIdeWorkspaceResult = {
  state: IdeWorkspaceState;
  derived: IdeWorkspaceDerived;
  actions: IdeWorkspaceActions;
  constants: IdeWorkspaceConstants;
  history: {
    canUndo: boolean;
    canRedo: boolean;
  };
};
