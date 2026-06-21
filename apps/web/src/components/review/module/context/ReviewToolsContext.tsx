"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { WorkspaceStateV2 } from "@/components/ide/types";
import type { LearningIdeConfig } from "@/lib/ide/learningIdeConfig";
import type { CodeFeedback } from "@/lib/code/feedback/types";
import type {
  WorkspaceLanguage,
  SqlDialect,
  TerminalEvidence,
} from "@/lib/practice/types";
import type { SqlPaneOptions } from "@/components/code/runner/components/sql/results-pane";
import type {
  UnknownRecord,
  WorkspaceOrigin,
} from "../runtime/reviewRuntimeTypes";
import { useReviewRuntimeStore } from "../runtime/reviewRuntimeStore";
import { useDebouncedSketchState } from "../hooks/useDebouncedSketchState";
import {
    hasNonBlankText,
    normalizeCodeWorkspacePair,
    stateLanguageMatches, workspaceWithEntryCode,
} from "@/components/review/module/runtime/workspaceCodeSource";

type SqlTableSnapshot = {
  name: string;
  columns: Array<{ name: string; type?: string | null }>;
  rows: unknown[][];
  rowCount: number;
};

type SqlTableSnapshots = Record<string, SqlTableSnapshot>;
type CodeInputPatch = UnknownRecord & {
  userEdited?: boolean;
  workspaceOrigin?: WorkspaceOrigin;
  updateOrigin?: string;
  dismissFeedbackOnEdit?: boolean;
  feedbackDismissed?: boolean;
  preferSnapshot?: boolean;
  exerciseKey?: string;
  workspace?: WorkspaceStateV2 | null;
  codeWorkspace?: WorkspaceStateV2 | null;
  ideWorkspace?: WorkspaceStateV2 | null;
  codeLang?: WorkspaceLanguage;
  language?: WorkspaceLanguage;
  code?: string;
  codeStdin?: string;
  stdin?: string;
  terminalEvidence?: TerminalEvidence;
  ideConfig?: LearningIdeConfig | null;
  codeSqlDialect?: SqlDialect;
  sqlDialect?: SqlDialect;
  sqlDatasetId?: string;
  sqlSchemaSql?: string;
  sqlSeedSql?: string;
  sqlInitialTableSnapshots?: SqlTableSnapshots;
  sqlPaneOptions?: SqlPaneOptions;
};

export type RegisterArgs = {
  lang: WorkspaceLanguage;
  code: string;
  stdin?: string;
  terminalEvidence?: TerminalEvidence;
  ideConfig?: LearningIdeConfig | null;
  workspace?: WorkspaceStateV2 | null;
  ownerCardId?: string | null;
  exerciseKey?: string;
    preferSnapshot?: boolean;
    userEdited?: boolean;
    workspaceOrigin?: WorkspaceOrigin;

  sqlDialect?: SqlDialect;
  sqlDatasetId?: string;
  sqlSchemaSql?: string;
  sqlSeedSql?: string;
  sqlInitialTableSnapshots?: SqlTableSnapshots;
  sqlPaneOptions?: SqlPaneOptions;

  onPatch: (patch: CodeInputPatch) => void;
};

export type RunFeedbackEntry = {
  feedback: CodeFeedback | null;
  tick: number;
};

export type CodeInputMeta = {
  order: number;
  eligible: boolean;
  done: boolean;
};

export type ReviewToolsValue = {
  enabled: boolean;

  registerCodeInput: (id: string, args: RegisterArgs) => void;
  unregisterCodeInput: (id: string) => void;

  requestBind: (id: string) => void;
  requestBindNext: (afterId: string) => void;
  unbindCodeInput: () => void;

  setCodeInputMeta: (id: string, meta: Partial<CodeInputMeta>) => void;

  boundId: string | null;
  previewExerciseKey: string | null;
  isBound: (id: string) => boolean;

  ensureVisible?: () => void;
  flushLatest?: () => void | Promise<void>;

  getRunFeedbackEntry: (id: string) => RunFeedbackEntry | null;
  setRunFeedback: (id: string, feedback: CodeFeedback | null) => void;
  clearRunFeedback: (id: string) => void;

  syncCodeInputSnapshot: (id: string, patch: CodeInputPatch) => void;
  patchCodeInput: (id: string, patch: CodeInputPatch) => void;

  sketch?: ReturnType<typeof useDebouncedSketchState>;
};

const Ctx = createContext<ReviewToolsValue | null>(null);

function workspaceKeyOf(workspace: WorkspaceStateV2 | null | undefined) {
  if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
    return JSON.stringify(workspace ?? null);
  }

  const folderPathById = new Map<string, string>();

  let changed = true;
  while (changed) {
    changed = false;

    for (const node of workspace.nodes as any[]) {
      if (!node || node.kind !== "folder") continue;

      const id = String(node.id ?? "");
      if (!id || folderPathById.has(id)) continue;

      const name = String(node.name ?? "");
      const parentId = node.parentId == null ? null : String(node.parentId);
      if (parentId && !folderPathById.has(parentId)) continue;

      const parentPath = parentId ? folderPathById.get(parentId) || "" : "";
      folderPathById.set(id, parentPath ? `${parentPath}/${name}` : name);
      changed = true;
    }
  }

  const nodePath = (node: any) => {
    const name = String(node?.name ?? "");
    const parentId = node?.parentId == null ? null : String(node.parentId);
    const parentPath = parentId ? folderPathById.get(parentId) || "" : "";
    return parentPath ? `${parentPath}/${name}` : name;
  };

  const files = (workspace.nodes as any[])
    .filter((node) => node?.kind === "file")
    .map((node) => ({
      path: nodePath(node),
      content: String(node.content ?? ""),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const folders = (workspace.nodes as any[])
    .filter((node) => node?.kind === "folder")
    .map((node) => nodePath(node))
    .sort((a, b) => a.localeCompare(b));

  const activeNode = (workspace.nodes as any[]).find(
    (node) => node?.kind === "file" && node.id === workspace.activeFileId,
  );
  const entryNode = (workspace.nodes as any[]).find(
    (node) => node?.kind === "file" && node.id === workspace.entryFileId,
  );
  const openTabPaths = (workspace.openTabs ?? [])
    .map((id) => (workspace.nodes as any[]).find((node) => node?.kind === "file" && node.id === id))
    .filter(Boolean)
    .map((node) => nodePath(node))
    .sort((a, b) => a.localeCompare(b));
  const expandedPaths = (workspace.expanded ?? [])
    .map((id) => (workspace.nodes as any[]).find((node) => node?.kind === "folder" && node.id === id))
    .filter(Boolean)
    .map((node) => nodePath(node))
    .sort((a, b) => a.localeCompare(b));

  return JSON.stringify({
    version: workspace.version,
    language: workspace.language ?? null,
    activePath: activeNode ? nodePath(activeNode) : null,
    entryPath: entryNode ? nodePath(entryNode) : null,
    openTabs: openTabPaths,
    expanded: expandedPaths,
    stdin: workspace.stdin ?? "",
    leftPct: workspace.leftPct ?? null,
    folders,
    files,
  });
}

function getWorkspaceEntryCode(workspace: WorkspaceStateV2 | null | undefined) {
  if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
    return null;
  }

  const entryId = workspace.entryFileId || workspace.activeFileId;
  const file =
    workspace.nodes.find((node) => node.kind === "file" && node.id === entryId) ??
    workspace.nodes.find((node) => node.kind === "file");

  return file && file.kind === "file" ? String(file.content ?? "") : null;
}
function workspaceHasAnyNonBlankFile(
    workspace: WorkspaceStateV2 | null | undefined,
) {
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return false;
    }

    return workspace.nodes.some((node) => {
        if (node.kind !== "file") return false;
        return String(node.content ?? "").trim().length > 0;
    });
}
function firstNonBlank(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}
// function isRealUserWorkspaceEdit(patch: CodeInputPatch) {
//     return (
//         patch?.userEdited === true ||
//         patch?.workspaceOrigin === "user" ||
//         patch?.updateOrigin === "user" ||
//         patch?.dismissFeedbackOnEdit === true ||
//         patch?.preferSnapshot === true
//     );
// }
function registerArgsKey(args: RegisterArgs | undefined) {
  if (!args) return "";

  return JSON.stringify({
    exerciseKey: args.exerciseKey ?? null,
    lang: args.lang,
    code: args.code,
    stdin: args.stdin ?? "",
    terminalEvidence: args.terminalEvidence ?? null,
    ideConfig: args.ideConfig ?? null,
    workspaceKey: workspaceKeyOf(args.workspace ?? null),
    ownerCardId: args.ownerCardId ?? null,
    // Deliberately exclude transient ownership flags from the registry key.
    // They can flip during bind/progress reconciliation and otherwise cause
    // register -> bind -> setProgress -> register update loops. Contract
    // changes are represented by code/workspace/language/runtime fields above.
    sqlDialect: args.sqlDialect ?? null,
    sqlDatasetId: args.sqlDatasetId ?? null,
    sqlSchemaSql: args.sqlSchemaSql ?? null,
    sqlSeedSql: args.sqlSeedSql ?? null,
    sqlInitialTableSnapshots: args.sqlInitialTableSnapshots ?? null,
    sqlPaneOptions: args.sqlPaneOptions ?? null,
  });
}

function defer(fn: () => void) {
  if (typeof queueMicrotask === "function") queueMicrotask(fn);
  else Promise.resolve().then(fn);
}

export function ReviewToolsProvider({
  children,
  ensureVisible,
  onBindToToolsPanel,
  onUnbindFromToolsPanel,
  externalBoundId,
  enabled = true,
  mode = "manual",
  resetKey,
}: {
  children: React.ReactNode;
  ensureVisible?: () => void;
  onBindToToolsPanel: (args: { id: string } & RegisterArgs) => void | boolean | Promise<void | boolean>;
  onUnbindFromToolsPanel?: () => void;
  externalBoundId?: string | null;
  enabled?: boolean;
  mode?: "manual" | "first_unanswered" | "first_registered";
  resetKey?: string;
}) {
  const enabledRef = useRef(Boolean(enabled));

  const registryRef = useRef(new Map<string, RegisterArgs>());
  const orderRef = useRef<string[]>([]);
  const metaRef = useRef(new Map<string, CodeInputMeta>());
  const unbindTimersRef = useRef(new Map<string, number>());

  const [requestedId, setRequestedId] = useState<string | null>(null);
  const lastRegisterAutoBindKeyRef = useRef<string | null>(null);
  const lastExternalBoundBindKeyRef = useRef<string | null>(null);
  const [registryTick, setRegistryTick] = useState(0);
  const [metaTick, setMetaTick] = useState(0);
  const [runFeedbackById, setRunFeedbackById] = useState<Record<string, RunFeedbackEntry>>({});

  const storeBoundId = useReviewRuntimeStore((s) => s.tool.boundExerciseKey);
  const bindExerciseTool = useReviewRuntimeStore((s) => s.bindExerciseTool);
  const storeUnbindExerciseTool = useReviewRuntimeStore((s) => s.unbindExerciseTool);
  const patchExercise = useReviewRuntimeStore((s) => s.patchExercise);
  const patchEditorWorkspace = useReviewRuntimeStore((s) => s.patchEditorWorkspace);
  const setFlushToolSnapshotCallback = useReviewRuntimeStore((s) => s.setFlushToolSnapshotCallback);
  const flushToolSnapshot = useReviewRuntimeStore((s) => s.flushToolSnapshot);

  const sketch = useDebouncedSketchState({});

  useEffect(() => {
    enabledRef.current = Boolean(enabled);
  }, [enabled]);

  const getTargetKeyForInputId = useCallback((id: string | null) => {
    if (!id) return null;

    const direct = registryRef.current.get(id);
    if (direct?.exerciseKey) return direct.exerciseKey;

    for (const [inputId, snap] of registryRef.current.entries()) {
      const targetKey = snap.exerciseKey ?? inputId;
      if (targetKey === id) return targetKey;
    }

    return id;
  }, []);

  const getInputIdForToolKey = useCallback((toolKey: string | null) => {
    if (!toolKey) return null;

    if (registryRef.current.has(toolKey)) return toolKey;

    for (const [inputId, snap] of registryRef.current.entries()) {
      const targetKey = snap.exerciseKey ?? inputId;
      if (targetKey === toolKey) return inputId;
    }

    return toolKey;
  }, []);

  const getRegistryEntryForToolKey = useCallback((toolKey: string | null) => {
    if (!toolKey) return null;

    const direct = registryRef.current.get(toolKey);
    if (direct) {
      return {
        id: toolKey,
        snap: direct,
        targetKey: direct.exerciseKey ?? toolKey,
      };
    }

    for (const [id, snap] of registryRef.current.entries()) {
      const targetKey = snap.exerciseKey ?? id;
      if (targetKey === toolKey) {
        return { id, snap, targetKey };
      }
    }

    return null;
  }, []);

  const clearUnbindTimer = useCallback((id: string) => {
    const timer = unbindTimersRef.current.get(id);
    if (timer) window.clearTimeout(timer);
    unbindTimersRef.current.delete(id);
  }, []);

  useEffect(() => {
    const timers = unbindTimersRef.current;
    return () => {
      for (const timer of timers.values()) {
        window.clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  const [boundId, setBoundId] = useState<string | null>(null);

  const clearRunFeedback = useCallback((id: string) => {
    if (!id) return;

    setRunFeedbackById((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const setRunFeedback = useCallback((id: string, feedback: CodeFeedback | null) => {
    if (!id) return;

    setRunFeedbackById((prev) => {
      const cur = prev[id];
      return {
        ...prev,
        [id]: {
          feedback: feedback ?? null,
          tick: (cur?.tick ?? 0) + 1,
        },
      };
    });
  }, []);
    function isRealUserWorkspaceEdit(patch: CodeInputPatch) {
        return (
            patch?.userEdited === true ||
            patch?.workspaceOrigin === "user" ||
            patch?.updateOrigin === "user" ||
            patch?.dismissFeedbackOnEdit === true
        );
    }
  const getRunFeedbackEntry = useCallback(
    (id: string) => {
      if (!id) return null;
      return runFeedbackById[id] ?? null;
    },
    [runFeedbackById],
  );

    const flushByToolKey = useCallback(
        (toolKey: string | null) => {
            const entry = getRegistryEntryForToolKey(toolKey);
            if (!entry) return;

            const { snap, targetKey } = entry;
            const userEdited =
                snap.userEdited === true ||
                snap.workspaceOrigin === "user" ||
                snap.workspaceOrigin === "saved";
            patchExercise(targetKey, {
                language: snap.lang,
                lang: snap.lang,
                workspace: snap.workspace ?? undefined,
                codeWorkspace: snap.workspace ?? undefined,
                ideWorkspace: snap.workspace ?? undefined,
                stdin: snap.stdin ?? "",
                codeStdin: snap.stdin ?? "",
                code: getWorkspaceEntryCode(snap.workspace) ?? snap.code,
                ...(userEdited
                    ? {
                        userEdited: true,
                        workspaceOrigin: "user",
                    }
                    : {}),
            });
        },
        [getRegistryEntryForToolKey, patchExercise],
    );

  useEffect(() => {
    const flush = () => {
      flushByToolKey((externalBoundId ?? storeBoundId) ?? null);
    };

    setFlushToolSnapshotCallback(flush);
    return () => setFlushToolSnapshotCallback(null);
  }, [externalBoundId, storeBoundId, flushByToolKey, setFlushToolSnapshotCallback]);

  const bindNow = useCallback(
    async (id: string) => {
      if (!enabledRef.current) return;
      if (!id) return;

      const snap = registryRef.current.get(id);
      if (!snap) {
        setRequestedId(id);
        return;
      }

      const targetKey = snap.exerciseKey ?? id;
      const current = useReviewRuntimeStore.getState().tool.boundExerciseKey;

      if (current !== targetKey) {
        flushByToolKey(current);
      }

      const accepted = await onBindToToolsPanel({ id, ...snap, exerciseKey: targetKey });

      /**
       * Do not mark the global Tools panel as bound when the route/controller
       * rejected this registration as stale. Otherwise the header can say it is
       * bound to the exercise while the editor is still the generic default
       * workspace (for example Python main.py / print("Hello Python!")).
       */
      if (accepted === false) {
        setRequestedId(null);
        return;
      }

      const normalizedPair = normalizeCodeWorkspacePair({
        workspace: snap.workspace ?? null,
        code: snap.code,
        state: snap,
        language: snap.lang,
        stdin: snap.stdin,
      });
      const boundWorkspace = normalizedPair.workspace;
      const boundCode = normalizedPair.code;
      const boundOrigin =
        snap.userEdited === true ||
        snap.workspaceOrigin === "user" ||
        snap.workspaceOrigin === "saved"
          ? (snap.workspaceOrigin ?? "saved")
          : "starter";

      patchExercise(targetKey, {
        language: snap.lang,
        lang: snap.lang,
        workspace: boundWorkspace ?? undefined,
        codeWorkspace: boundWorkspace ?? undefined,
        ideWorkspace: boundWorkspace ?? undefined,
        code: boundCode,
        source: boundCode,
        stdin: snap.stdin ?? "",
        codeStdin: snap.stdin ?? "",
        userEdited: boundOrigin === "user" || boundOrigin === "saved",
        workspaceOrigin: boundOrigin,
      });

      if (boundWorkspace && (boundOrigin === "user" || boundOrigin === "saved")) {
        patchEditorWorkspace(targetKey, boundWorkspace);
      }

      bindExerciseTool(targetKey);
      setRequestedId(null);
    },
    [ensureVisible, onBindToToolsPanel, bindExerciseTool, flushByToolKey, patchEditorWorkspace, patchExercise],
  );

    const syncCodeInputSnapshot = useCallback(
        (id: string, patch: CodeInputPatch) => {
            if (!id) return;

            const cur = registryRef.current.get(id);
            if (!cur) return;

            const targetKey = patch?.exerciseKey ?? cur.exerciseKey ?? id;
            const userEdited = isRealUserWorkspaceEdit(patch);

            const incomingWorkspaceRaw =
                patch?.workspace && typeof patch.workspace === "object"
                    ? (patch.workspace as WorkspaceStateV2)
                    : patch?.codeWorkspace && typeof patch.codeWorkspace === "object"
                        ? (patch.codeWorkspace as WorkspaceStateV2)
                        : patch?.ideWorkspace && typeof patch.ideWorkspace === "object"
                            ? (patch.ideWorkspace as WorkspaceStateV2)
                            : cur.workspace;

            const rawPatchCode =
                typeof patch?.code === "string"
                    ? patch.code
                    : typeof patch?.source === "string"
                        ? patch.source
                        : undefined;

            const patchCode =
                typeof rawPatchCode === "string" &&
                (
                    userEdited ||
                    rawPatchCode.trim() ||
                    !String(cur.code ?? "").trim()
                )
                    ? rawPatchCode
                    : cur.code;

            /**
             * Fill answer is an explicit user/action patch.
             *
             * The bound Tools workspace usually already has starter text like
             * "# Write your code below". normalizeCodeWorkspacePair normally preserves
             * non-blank workspace content, which is correct for hydration.
             *
             * For Fill answer, that would keep the old starter text and ignore the
             * revealed solution. So when this is a real user patch with code, force the
             * patch code into the workspace entry before normalization.
             */
            const incomingWorkspace =
                userEdited && typeof rawPatchCode === "string"
                    ? workspaceWithEntryCode(incomingWorkspaceRaw, rawPatchCode)
                    : incomingWorkspaceRaw;

            const existingExercise =
                useReviewRuntimeStore.getState().exercises[targetKey];

            const existingWorkspace = existingExercise?.workspace ?? null;

            const protectsExistingUserWorkspace =
                !userEdited &&
                existingExercise?.userEdited === true &&
                existingWorkspace &&
                workspaceKeyOf(existingWorkspace) !== workspaceKeyOf(incomingWorkspace);

            /**
             * Critical:
             * A sync/programmatic hydration snapshot must not replace a previously
             * user-edited SQL workspace. SQL route/topic navigation can emit starter
             * workspace snapshots after the real query was already saved.
             */
            const normalizedPair = normalizeCodeWorkspacePair({
                workspace: protectsExistingUserWorkspace
                    ? existingWorkspace
                    : incomingWorkspace,
                code: patchCode,
                state: userEdited
                    ? { userEdited: true, workspaceOrigin: "user" }
                    : cur,
                language: patch?.codeLang ?? patch?.language ?? cur.lang,
                stdin:
                    typeof patch?.codeStdin === "string"
                        ? patch.codeStdin
                        : typeof patch?.stdin === "string"
                            ? patch.stdin
                            : cur.stdin,
            });

            const workspace = normalizedPair.workspace;
            const nextCode = normalizedPair.code;

            const nextStdin =
                typeof patch?.codeStdin === "string"
                    ? patch.codeStdin
                    : typeof patch?.stdin === "string"
                        ? patch.stdin
                        : protectsExistingUserWorkspace
                            ? existingExercise?.stdin ?? cur.stdin
                            : cur.stdin;

            const next: RegisterArgs = {
                ...cur,
                exerciseKey: targetKey,
                lang: patch?.codeLang ?? patch?.language ?? cur.lang,
                code: nextCode,
                stdin: nextStdin,
                terminalEvidence: patch?.terminalEvidence ?? cur.terminalEvidence,
                ideConfig: patch?.ideConfig ?? cur.ideConfig,
                workspace,
                preferSnapshot:
                    userEdited ||
                    cur.preferSnapshot === true ||
                    patch?.preferSnapshot === true,
                userEdited: userEdited || cur.userEdited === true,
                workspaceOrigin: userEdited ? "user" : cur.workspaceOrigin,
                sqlDialect: patch?.codeSqlDialect ?? patch?.sqlDialect ?? cur.sqlDialect,
                sqlDatasetId: firstNonBlank(
                    typeof patch?.sqlDatasetId === "string"
                        ? patch.sqlDatasetId
                        : undefined,
                    cur.sqlDatasetId,
                ),
                sqlSchemaSql: firstNonBlank(
                    typeof patch?.sqlSchemaSql === "string"
                        ? patch.sqlSchemaSql
                        : undefined,
                    cur.sqlSchemaSql,
                ),
                sqlSeedSql: firstNonBlank(
                    typeof patch?.sqlSeedSql === "string"
                        ? patch.sqlSeedSql
                        : undefined,
                    cur.sqlSeedSql,
                ),
                sqlInitialTableSnapshots:
                    patch?.sqlInitialTableSnapshots &&
                    typeof patch.sqlInitialTableSnapshots === "object"
                        ? patch.sqlInitialTableSnapshots
                        : cur.sqlInitialTableSnapshots,
                sqlPaneOptions:
                    patch?.sqlPaneOptions && typeof patch.sqlPaneOptions === "object"
                        ? patch.sqlPaneOptions
                        : cur.sqlPaneOptions,
            };

            if (registerArgsKey(cur) === registerArgsKey(next)) {
                return;
            }

            registryRef.current.set(id, next);
            cur.onPatch?.(patch);

            const feedbackDismissPatch =
                patch?.dismissFeedbackOnEdit === true &&
                patch?.feedbackDismissed === true
                    ? {
                        submitted: false,
                        feedbackDismissed: true,
                        dismissFeedbackOnEdit: true,
                        userEdited: true,
                        updateOrigin: "user",
                        workspaceOrigin: "user" as const,
                    }
                    : {};

            const runtimePatch = {
                language: next.lang,
                lang: next.lang,

                workspace: next.workspace ?? undefined,
                codeWorkspace: next.workspace ?? undefined,
                ideWorkspace: next.workspace ?? undefined,

                stdin: next.stdin ?? "",
                codeStdin: next.stdin ?? "",
                terminalEvidence: next.terminalEvidence,
                code: hasNonBlankText(getWorkspaceEntryCode(next.workspace))
                    ? getWorkspaceEntryCode(next.workspace)!
                    : next.code,
                ...(userEdited
                    ? {
                        userEdited: true,
                        workspaceOrigin: "user" as const,
                    }
                    : {}),

                ...feedbackDismissPatch,
            };

            patchExercise(targetKey, runtimePatch);

            const runtimeState = useReviewRuntimeStore.getState();
            const currentBound = runtimeState.tool.boundExerciseKey;
            const activeExerciseKey = runtimeState.activeExerciseKey;

            /**
             * Route/dynamic review editors can be keyed by more than one stable owner:
             *
             * - targetKey: the normalized exercise key selected by this sync call
             * - cur.exerciseKey: the key the input registered with originally
             * - id: the CodeInput registry id
             * - currentBound: the right-side Tools editor's current bound owner
             *
             * Fill answer is an explicit user action. The visible Tools editor must receive
             * the revealed solution even when the route-owned editor runtime is keyed by
             * currentBound instead of targetKey. Mirror the same runtime workspace into the
             * possible owner keys for this one explicit patch.
             */
            if (userEdited && next.workspace) {
                const mirrorOwnerKeys = Array.from(
                    new Set(
                        [
                            targetKey,
                            typeof cur.exerciseKey === "string" ? cur.exerciseKey : null,
                            id,
                            typeof currentBound === "string" ? currentBound : null,
                            typeof activeExerciseKey === "string" ? activeExerciseKey : null,
                        ].filter((key): key is string => Boolean(key && key.trim())),
                    ),
                );

                for (const ownerKey of mirrorOwnerKeys) {
                    runtimeState.patchEditorWorkspace(ownerKey, next.workspace);

                    if (ownerKey !== targetKey) {
                        runtimeState.patchExercise(ownerKey, runtimePatch);
                    }
                }
            }

            const shouldRebindVisibleEditor =
                currentBound === targetKey ||
                currentBound === cur.exerciseKey ||
                currentBound === id ||
                activeExerciseKey === targetKey ||
                activeExerciseKey === cur.exerciseKey ||
                activeExerciseKey === id ||
                (userEdited && typeof currentBound === "string" && currentBound.trim().length > 0);

            if (shouldRebindVisibleEditor) {
                defer(() => bindNow(id));
            }
        },
        [bindNow, patchExercise],
    );

    const patchCodeInput = useCallback(
        (id: string, patch: CodeInputPatch) => {
            if (!id) return;

            clearRunFeedback(id);
            const existing = registryRef.current.get(id);

            if (!existing) {
                const runtimeStore = useReviewRuntimeStore.getState();
                const currentBound = runtimeStore.tool.boundExerciseKey;
                const activeExerciseKey = runtimeStore.activeExerciseKey;
                const ownerKeys = Array.from(
                    new Set(
                        [currentBound, activeExerciseKey].filter(
                            (key): key is string => Boolean(key && key.trim()),
                        ),
                    ),
                );

                for (const ownerKey of ownerKeys) {
                    const currentExercise = runtimeStore.exercises[ownerKey] ?? null;
                    const incomingWorkspace =
                        patch?.workspace && typeof patch.workspace === "object"
                            ? (patch.workspace as WorkspaceStateV2)
                            : patch?.codeWorkspace && typeof patch.codeWorkspace === "object"
                                ? (patch.codeWorkspace as WorkspaceStateV2)
                                : patch?.ideWorkspace && typeof patch.ideWorkspace === "object"
                                    ? (patch.ideWorkspace as WorkspaceStateV2)
                                    : runtimeStore.editorRuntimes[ownerKey]?.workspace ??
                                    currentExercise?.workspace ??
                                    runtimeStore.boundToolWorkspace ??
                                    null;
                    const incomingCode =
                        typeof patch?.code === "string"
                            ? patch.code
                            : typeof patch?.source === "string"
                                ? patch.source
                                : typeof currentExercise?.code === "string"
                                    ? currentExercise.code
                                    : "";
                    const incomingLang = String(
                        patch?.codeLang ??
                        patch?.language ??
                        patch?.lang ??
                        currentExercise?.language ??
                        currentExercise?.lang ??
                        "python",
                    ) as WorkspaceLanguage;
                    const incomingStdin =
                        typeof patch?.codeStdin === "string"
                            ? patch.codeStdin
                            : typeof patch?.stdin === "string"
                                ? patch.stdin
                                : typeof currentExercise?.stdin === "string"
                                    ? currentExercise.stdin
                                    : "";

                    const normalizedPair = normalizeCodeWorkspacePair({
                        workspace:
                            typeof incomingCode === "string" && incomingCode.trim()
                                ? workspaceWithEntryCode(incomingWorkspace, incomingCode)
                                : incomingWorkspace,
                        code: incomingCode,
                        language: incomingLang,
                        stdin: incomingStdin,
                        state: { userEdited: true, workspaceOrigin: "user" },
                    });

                    runtimeStore.patchExercise(ownerKey, {
                        language: incomingLang,
                        lang: incomingLang,
                        workspace: normalizedPair.workspace ?? undefined,
                        codeWorkspace: normalizedPair.workspace ?? undefined,
                        ideWorkspace: normalizedPair.workspace ?? undefined,
                        code: normalizedPair.code,
                        source: normalizedPair.code,
                        stdin: incomingStdin,
                        codeStdin: incomingStdin,
                        userEdited: true,
                        workspaceOrigin: "user",
                        submitted: false,
                        feedbackDismissed: true,
                        dismissFeedbackOnEdit: true,
                        updatedAt: Date.now(),
                    });

                    if (normalizedPair.workspace) {
                        runtimeStore.patchEditorWorkspace(ownerKey, normalizedPair.workspace);
                    }
                }

                defer(() => bindNow(id));
                return;
            }

            syncCodeInputSnapshot(id, {
                ...patch,
                preferSnapshot: true,
                userEdited: true,
                updateOrigin: "user",
                workspaceOrigin: "user",
            });

            defer(() => bindNow(id));
        },
        [bindNow, clearRunFeedback, syncCodeInputSnapshot],
    );

    const requestBind = useCallback(
    (id: string) => {
      if (!enabledRef.current) return;
      if (!id) return;

      const snap = registryRef.current.get(id);
      if (!snap) {
        setRequestedId(id);
        return;
      }

      const targetKey = snap.exerciseKey ?? id;
      const current = useReviewRuntimeStore.getState().tool.boundExerciseKey;

      /**
       * Browser back/forward can leave the runtime bound to the same exercise key
       * while the visible Tools editor still carries an older workspace snapshot.
       * Same-key binding must therefore refresh the Tools panel instead of no-oping.
       */
      if (current === targetKey) {
        setRequestedId(null);
        void bindNow(id);
        return;
      }

      void bindNow(id);
    },
    [bindNow],
  );

  const unbindCodeInput = useCallback(() => {
    const currentBound = (externalBoundId ?? storeBoundId) ?? null;

    if (currentBound) {
      flushByToolKey(currentBound);
      storeUnbindExerciseTool(currentBound);
    }

    setRequestedId(null);
    onUnbindFromToolsPanel?.();
  }, [externalBoundId, storeBoundId, flushByToolKey, storeUnbindExerciseTool, onUnbindFromToolsPanel]);

  const registerCodeInput = useCallback(
    (id: string, args: RegisterArgs) => {
      if (!enabledRef.current) return;
      if (!id) return;

      clearUnbindTimer(id);

      const had = registryRef.current.has(id);
      const prev = registryRef.current.get(id);
      if (!orderRef.current.includes(id)) orderRef.current.push(id);

        const normalizedPair = normalizeCodeWorkspacePair({
            workspace: args.workspace,
            code: args.code,
            state: args,
            language: args.lang,
            stdin: args.stdin,
        });

        const normalizedArgs: RegisterArgs = {
            ...args,
            workspace: normalizedPair.workspace,
            code: normalizedPair.code,
        };

        let nextArgs: RegisterArgs = normalizedArgs;
        const prevCode = getWorkspaceEntryCode(prev?.workspace ?? null) ?? prev?.code ?? "";
        const incomingCode =
            getWorkspaceEntryCode(normalizedArgs.workspace ?? null) ?? normalizedArgs.code ?? "";
        const prevTargetKey = prev?.exerciseKey ?? id;
        const nextTargetKey = normalizedArgs.exerciseKey ?? id;
        const sameExerciseTarget = String(prevTargetKey ?? "") === String(nextTargetKey ?? "");
        const sameLanguageTarget =
            !prev ||
            stateLanguageMatches(prev, normalizedArgs.lang, prev.workspace ?? null);

        const incomingIsExplicitUserSnapshot = Boolean(
            normalizedArgs.userEdited === true ||
            normalizedArgs.workspaceOrigin === "user" ||
            normalizedArgs.workspaceOrigin === "saved"
        );

        const prevHasUserWorkspaceContent = Boolean(
            hasNonBlankText(prevCode) ||
            hasNonBlankText(prev?.code) ||
            workspaceHasAnyNonBlankFile(prev?.workspace ?? null)
        );

        const prevIsProtectedUserSnapshot = Boolean(
            prev &&
            sameExerciseTarget &&
            sameLanguageTarget &&
            (
                prev.userEdited === true ||
                prev.workspaceOrigin === "user" ||
                prev.workspaceOrigin === "saved"
            ) &&
            prevHasUserWorkspaceContent
        );

        if (prevIsProtectedUserSnapshot && prev) {
            const incomingMatchesPatchedSnapshot =
                prev.lang === normalizedArgs.lang &&
                prev.code === normalizedArgs.code &&
                (prev.stdin ?? "") === (normalizedArgs.stdin ?? "") &&
                workspaceKeyOf(prev.workspace ?? null) ===
                workspaceKeyOf(normalizedArgs.workspace ?? null);

            const incomingIsBlankNonUser =
                !incomingIsExplicitUserSnapshot && !hasNonBlankText(incomingCode);

            const incomingWouldDowngradeProtectedSnapshot =
                !incomingIsExplicitUserSnapshot &&
                hasNonBlankText(incomingCode) &&
                incomingCode !== prevCode;

            /**
             * Critical:
             * When navigating real review routes, the same code_input can re-register
             * with nonblank starter code after the learner already solved it.
             *
             * That incoming starter is nonblank, so the old guard allowed it to replace
             * the protected learner snapshot. Then CodeToolPane correctly rendered the
             * registry's new value: starter code.
             *
             * Preserve the previous learner/saved snapshot unless the incoming
             * registration is an explicit user edit.
             */
            if (
                incomingMatchesPatchedSnapshot ||
                incomingIsBlankNonUser ||
                incomingWouldDowngradeProtectedSnapshot
            ) {
                nextArgs = {
                    ...prev,

                    exerciseKey: nextTargetKey,
                    ownerCardId: normalizedArgs.ownerCardId ?? prev.ownerCardId,
                    ideConfig: normalizedArgs.ideConfig ?? prev.ideConfig,

                    sqlDialect: normalizedArgs.sqlDialect ?? prev.sqlDialect,
                    sqlDatasetId: normalizedArgs.sqlDatasetId ?? prev.sqlDatasetId,
                    sqlSchemaSql: normalizedArgs.sqlSchemaSql ?? prev.sqlSchemaSql,
                    sqlSeedSql: normalizedArgs.sqlSeedSql ?? prev.sqlSeedSql,
                    sqlInitialTableSnapshots:
                        normalizedArgs.sqlInitialTableSnapshots ??
                        prev.sqlInitialTableSnapshots,
                    sqlPaneOptions:
                        normalizedArgs.sqlPaneOptions ??
                        prev.sqlPaneOptions,

                    /**
                     * Important: keep the latest onPatch closure from the current
                     * rendered component, even while preserving the old workspace/code.
                     */
                    onPatch: normalizedArgs.onPatch,

                    preferSnapshot: true,
                    userEdited: true,
                    workspaceOrigin: prev.workspaceOrigin ?? "user",
                };
            }
        }

      const prevKey = registerArgsKey(prev);
      const nextKey = registerArgsKey(nextArgs);

      registryRef.current.set(id, nextArgs);

      if (!had || prevKey !== nextKey) setRegistryTick((x) => x + 1);
        const targetKey = nextArgs.exerciseKey ?? id;
        const currentBound = useReviewRuntimeStore.getState().tool.boundExerciseKey;

        if (currentBound === targetKey && prevKey !== nextKey) {
            const autoRebindKey = `${id}::${targetKey}::${nextKey}`;
            if (lastRegisterAutoBindKeyRef.current !== autoRebindKey) {
                lastRegisterAutoBindKeyRef.current = autoRebindKey;
                defer(() => bindNow(id));
            }
        }
      if (requestedId === id || requestedId === targetKey) {
        setRequestedId(null);
        defer(() => bindNow(id));
      }
    },
    [clearUnbindTimer, requestedId, bindNow],
  );

  const unregisterCodeInput = useCallback(
    (id: string) => {
      if (!id) return;

      clearUnbindTimer(id);

      const targetKeyBeforeDelete = getTargetKeyForInputId(id);

      const timer = window.setTimeout(() => {
        unbindTimersRef.current.delete(id);

        registryRef.current.delete(id);
        metaRef.current.delete(id);
        setRegistryTick((x) => x + 1);
        setMetaTick((x) => x + 1);
        clearRunFeedback(id);

        const currentBound = useReviewRuntimeStore.getState().tool.boundExerciseKey;

        if (
          !registryRef.current.has(id) &&
          (currentBound === id || currentBound === targetKeyBeforeDelete)
        ) {
          if (currentBound) {
            storeUnbindExerciseTool(currentBound);
          }
          onUnbindFromToolsPanel?.();
        }
      }, 0);

      unbindTimersRef.current.set(id, timer);

      if (requestedId === id) setRequestedId(null);
    },
    [
      clearUnbindTimer,
      getTargetKeyForInputId,
      clearRunFeedback,
      requestedId,
      storeUnbindExerciseTool,
      onUnbindFromToolsPanel,
    ],
  );

  const setCodeInputMeta = useCallback((id: string, patch: Partial<CodeInputMeta>) => {
    if (!enabledRef.current) return;

    const cur = metaRef.current.get(id);
    const next: CodeInputMeta = {
      order: patch.order ?? cur?.order ?? Number.POSITIVE_INFINITY,
      eligible: patch.eligible ?? cur?.eligible ?? false,
      done: patch.done ?? cur?.done ?? false,
    };

    const same =
      cur &&
      cur.order === next.order &&
      cur.eligible === next.eligible &&
      cur.done === next.done;

    metaRef.current.set(id, next);
    if (!same) setMetaTick((x) => x + 1);
  }, []);

  const isBound = useCallback(
    (id: string) => {
      const effective = (externalBoundId ?? storeBoundId) ?? null;
      if (!effective) return false;
      if (effective === id) return true;

      const targetKey = getTargetKeyForInputId(id);
      return targetKey === effective;
    },
    [externalBoundId, storeBoundId, getTargetKeyForInputId],
  );

  const pickFirstUnanswered = useCallback((): string | null => {
    let bestId: string | null = null;
    let bestOrder = Number.POSITIVE_INFINITY;

    for (const [id, meta] of metaRef.current.entries()) {
      if (!meta.eligible) continue;
      if (meta.done) continue;

      const order = Number.isFinite(meta.order) ? meta.order : Number.POSITIVE_INFINITY;
      if (order < bestOrder) {
        bestOrder = order;
        bestId = id;
      }
    }

    return bestId;
  }, []);

  const pickFirstRegistered = useCallback((): string | null => {
    return orderRef.current.find((id) => registryRef.current.has(id)) ?? null;
  }, []);

  const previewExerciseKey = useMemo(() => {
    const firstRegistered = pickFirstRegistered();
    if (!firstRegistered) return null;

    const targetKey = getTargetKeyForInputId(firstRegistered);
    return typeof targetKey === "string" && targetKey.trim() ? targetKey : null;
  }, [registryTick, pickFirstRegistered, getTargetKeyForInputId]);

  const reconcileBinding = useCallback(() => {
    if (!enabledRef.current) return;
    if (mode === "manual") return;

    const effectiveBound = (externalBoundId ?? storeBoundId) ?? null;

    const desired =
      mode === "first_unanswered" ? pickFirstUnanswered() : pickFirstRegistered();

    if (!desired) {
      if (effectiveBound) unbindCodeInput();
      return;
    }

    const desiredTarget = getTargetKeyForInputId(desired);
    if (effectiveBound === desired || effectiveBound === desiredTarget) return;

    defer(() => bindNow(desired));
  }, [
    externalBoundId,
    storeBoundId,
    mode,
    pickFirstUnanswered,
    pickFirstRegistered,
    getTargetKeyForInputId,
    unbindCodeInput,
    bindNow,
  ]);

  useEffect(() => {
    if (!enabled) return;
    if (mode === "manual") return;
    reconcileBinding();
  }, [enabled, mode, reconcileBinding, registryTick, metaTick]);

  const requestBindNext = useCallback(
    (afterId: string) => {
      if (!enabledRef.current) return;
      if (mode === "manual") return;

      const ordered = orderRef.current.filter((id) => registryRef.current.has(id));
      const startIndex = ordered.indexOf(afterId);

      for (let i = startIndex + 1; i < ordered.length; i += 1) {
        const id = ordered[i];
        const meta = metaRef.current.get(id);
        if (!meta?.eligible) continue;
        if (meta.done) continue;

        bindNow(id);
        return;
      }

      reconcileBinding();
    },
    [mode, bindNow, reconcileBinding],
  );

  useEffect(() => {
    if (externalBoundId === undefined) return;

    const next = externalBoundId ?? null;

    if (!next) {
      lastExternalBoundBindKeyRef.current = null;
      const current = useReviewRuntimeStore.getState().tool.boundExerciseKey;
      if (current) storeUnbindExerciseTool(current);
      setRequestedId(null);
      return;
    }

    const entry = getRegistryEntryForToolKey(next);

    if (entry) {
      const externalBindKey = `${next}::${entry.id}::${entry.targetKey}`;

      /**
       * externalBoundId is route-owned. It must hydrate the actual registered
       * code input through bindNow(), not only call bindExerciseTool().
       *
       * bindExerciseTool only changes the global key; it does not copy the
       * currently mounted exercise snapshot into the Tools state. That is why
       * Check could submit stale starter code and why fixture files like data.txt
       * could be missing from the visible Tools workspace.
       */
      if (lastExternalBoundBindKeyRef.current !== externalBindKey) {
        lastExternalBoundBindKeyRef.current = externalBindKey;
        setRequestedId(null);
        void bindNow(entry.id);
      }

      return;
    }

    lastExternalBoundBindKeyRef.current = null;
    setRequestedId(next);

    const targetKey = getTargetKeyForInputId(next);
    if (targetKey) bindExerciseTool(targetKey);
  }, [
    externalBoundId,
    getRegistryEntryForToolKey,
    getTargetKeyForInputId,
    bindNow,
    bindExerciseTool,
    storeUnbindExerciseTool,
  ]);

  useEffect(() => {
    if (enabled) return;

    registryRef.current.clear();
    orderRef.current = [];
    metaRef.current.clear();
    setRequestedId(null);
    setRunFeedbackById({});
    setRegistryTick((x) => x + 1);
    setMetaTick((x) => x + 1);

    const current = useReviewRuntimeStore.getState().tool.boundExerciseKey;
    if (current) storeUnbindExerciseTool(current);
    onUnbindFromToolsPanel?.();
  }, [enabled, storeUnbindExerciseTool, onUnbindFromToolsPanel]);

  const lastResetRef = useRef<string | null>(null);
  useEffect(() => {
    if (!resetKey) return;

    if (lastResetRef.current == null) {
      lastResetRef.current = resetKey;
      return;
    }

    if (lastResetRef.current !== resetKey) {
      registryRef.current.clear();
      orderRef.current = [];
      metaRef.current.clear();

      setRequestedId(null);
      setRunFeedbackById({});
      setRegistryTick((x) => x + 1);
      setMetaTick((x) => x + 1);

      onUnbindFromToolsPanel?.();

      const current = useReviewRuntimeStore.getState().tool.boundExerciseKey;
      if (externalBoundId) bindExerciseTool(externalBoundId);
      else if (current) storeUnbindExerciseTool(current);
    }

    lastResetRef.current = resetKey;
  }, [resetKey, externalBoundId, bindExerciseTool, storeUnbindExerciseTool, onUnbindFromToolsPanel]);

  useEffect(() => {
    setBoundId(getInputIdForToolKey((externalBoundId ?? storeBoundId) ?? null) ?? null);
  }, [externalBoundId, storeBoundId, registryTick, getInputIdForToolKey]);

  const value = useMemo<ReviewToolsValue>(
    () => ({
      enabled: Boolean(enabled),

      registerCodeInput,
      unregisterCodeInput,
      requestBind,
      requestBindNext,
      unbindCodeInput,

      setCodeInputMeta,

      boundId,
      previewExerciseKey,
      isBound,
      ensureVisible: enabled ? ensureVisible : undefined,
      flushLatest: enabled
          ? async () => {
              flushToolSnapshot();
          }
          : undefined,

      getRunFeedbackEntry,
      setRunFeedback,
      clearRunFeedback,

      syncCodeInputSnapshot,
      patchCodeInput,
      sketch,
    }),
    [
      enabled,
      registerCodeInput,
      unregisterCodeInput,
      requestBind,
      requestBindNext,
      unbindCodeInput,
      setCodeInputMeta,
      boundId,
      previewExerciseKey,
      isBound,
      ensureVisible,
      flushToolSnapshot,
      getRunFeedbackEntry,
      setRunFeedback,
      clearRunFeedback,
      syncCodeInputSnapshot,
      patchCodeInput,
      sketch,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useReviewTools() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useReviewTools must be used within ReviewToolsProvider");
  }
  return ctx;
}

export function useOptionalReviewTools() {
  return useContext(Ctx);
}
