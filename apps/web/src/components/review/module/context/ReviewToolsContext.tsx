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
import type { WorkspaceLanguage, SqlDialect } from "@/lib/practice/types";
import { useReviewRuntimeStore } from "../runtime/reviewRuntimeStore";
import { useDebouncedSketchState } from "../hooks/useDebouncedSketchState";

type SqlTableSnapshot = {
  name: string;
  columns: Array<{ name: string; type?: string | null }>;
  rows: unknown[][];
  rowCount: number;
};

type SqlTableSnapshots = Record<string, SqlTableSnapshot>;

export type RegisterArgs = {
  lang: WorkspaceLanguage;
  code: string;
  stdin?: string;
  ideConfig?: LearningIdeConfig | null;
  workspace?: WorkspaceStateV2 | null;
  ownerCardId?: string | null;
  exerciseKey?: string;
  preferSnapshot?: boolean;

  sqlDialect?: SqlDialect;
  sqlDatasetId?: string;
  sqlSchemaSql?: string;
  sqlSeedSql?: string;
  sqlInitialTableSnapshots?: SqlTableSnapshots;

  onPatch: (patch: any) => void;
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
  isBound: (id: string) => boolean;

  ensureVisible?: () => void;

  getRunFeedbackEntry: (id: string) => RunFeedbackEntry | null;
  setRunFeedback: (id: string, feedback: CodeFeedback | null) => void;
  clearRunFeedback: (id: string) => void;

  syncCodeInputSnapshot: (id: string, patch: any) => void;
  patchCodeInput: (id: string, patch: any) => void;

  sketch?: any;
};

const Ctx = createContext<ReviewToolsValue | null>(null);

function workspaceKeyOf(workspace: WorkspaceStateV2 | null | undefined) {
  return JSON.stringify(workspace ?? null);
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

function firstNonBlank(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}
function isRealUserWorkspaceEdit(patch: any) {
    return (
        patch?.userEdited === true ||
        patch?.workspaceOrigin === "user" ||
        patch?.updateOrigin === "user" ||
        patch?.dismissFeedbackOnEdit === true ||
        patch?.preferSnapshot === true
    );
}
function registerArgsKey(args: RegisterArgs | undefined) {
  if (!args) return "";

  return JSON.stringify({
    exerciseKey: args.exerciseKey ?? null,
    lang: args.lang,
    code: args.code,
    stdin: args.stdin ?? "",
    ideConfig: args.ideConfig ?? null,
    workspace: args.workspace ?? null,
    ownerCardId: args.ownerCardId ?? null,
    preferSnapshot: Boolean(args.preferSnapshot),
    sqlDialect: args.sqlDialect ?? null,
    sqlDatasetId: args.sqlDatasetId ?? null,
    sqlSchemaSql: args.sqlSchemaSql ?? null,
    sqlSeedSql: args.sqlSeedSql ?? null,
    sqlInitialTableSnapshots: args.sqlInitialTableSnapshots ?? null,
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
  onBindToToolsPanel: (args: { id: string } & RegisterArgs) => void;
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
  const [registryTick, setRegistryTick] = useState(0);
  const [metaTick, setMetaTick] = useState(0);
  const [runFeedbackById, setRunFeedbackById] = useState<Record<string, RunFeedbackEntry>>({});

  const storeBoundId = useReviewRuntimeStore((s) => s.tool.boundExerciseKey);
  const bindExerciseTool = useReviewRuntimeStore((s) => s.bindExerciseTool);
  const storeUnbindExerciseTool = useReviewRuntimeStore((s) => s.unbindExerciseTool);
  const patchExercise = useReviewRuntimeStore((s) => s.patchExercise);
  const setFlushToolSnapshotCallback = useReviewRuntimeStore((s) => s.setFlushToolSnapshotCallback);

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
    return () => {
      for (const timer of unbindTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      unbindTimersRef.current.clear();
    };
  }, []);

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
            const userEdited = snap.preferSnapshot === true;

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
            } as any);
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

      if (current !== targetKey) {
        flushByToolKey(current);
      }

      ensureVisible?.();
      onBindToToolsPanel({ id, ...snap, exerciseKey: targetKey });
      bindExerciseTool(targetKey);
      setRequestedId(null);
    },
    [ensureVisible, onBindToToolsPanel, bindExerciseTool, flushByToolKey],
  );

  const syncCodeInputSnapshot = useCallback(
    (id: string, patch: any) => {
      if (!id) return;

      const cur = registryRef.current.get(id);
      if (!cur) return;

      const workspace =
        patch?.workspace && typeof patch.workspace === "object"
          ? (patch.workspace as WorkspaceStateV2)
          : patch?.codeWorkspace && typeof patch.codeWorkspace === "object"
            ? (patch.codeWorkspace as WorkspaceStateV2)
            : patch?.ideWorkspace && typeof patch.ideWorkspace === "object"
              ? (patch.ideWorkspace as WorkspaceStateV2)
              : cur.workspace;

      const next: RegisterArgs = {
        ...cur,
        exerciseKey: patch?.exerciseKey ?? cur.exerciseKey,
        lang: patch?.codeLang ?? patch?.language ?? cur.lang,
        code:
          getWorkspaceEntryCode(workspace) ??
          (typeof patch?.code === "string" ? patch.code : cur.code),
        stdin:
          typeof patch?.codeStdin === "string"
            ? patch.codeStdin
            : typeof patch?.stdin === "string"
              ? patch.stdin
              : cur.stdin,
        ideConfig: patch?.ideConfig ?? cur.ideConfig,
        workspace,
        preferSnapshot: patch?.preferSnapshot === true,
        sqlDialect: patch?.codeSqlDialect ?? patch?.sqlDialect ?? cur.sqlDialect,
        sqlDatasetId: firstNonBlank(
          typeof patch?.sqlDatasetId === "string" ? patch.sqlDatasetId : undefined,
          cur.sqlDatasetId,
        ),
        sqlSchemaSql: firstNonBlank(
          typeof patch?.sqlSchemaSql === "string" ? patch.sqlSchemaSql : undefined,
          cur.sqlSchemaSql,
        ),
        sqlSeedSql: firstNonBlank(
          typeof patch?.sqlSeedSql === "string" ? patch.sqlSeedSql : undefined,
          cur.sqlSeedSql,
        ),
        sqlInitialTableSnapshots:
          patch?.sqlInitialTableSnapshots && typeof patch.sqlInitialTableSnapshots === "object"
            ? patch.sqlInitialTableSnapshots
            : cur.sqlInitialTableSnapshots,
      };

      registryRef.current.set(id, next);
      cur.onPatch?.(patch);

        const targetKey = next.exerciseKey ?? id;
        const userEdited = isRealUserWorkspaceEdit(patch);

        const feedbackDismissPatch =
            patch?.dismissFeedbackOnEdit === true && patch?.feedbackDismissed === true
                ? {
                    submitted: false,
                    feedbackDismissed: true,
                    dismissFeedbackOnEdit: true,
                    userEdited: true,
                    updateOrigin: "user",
                    workspaceOrigin: "user",
                }
                : {};

        patchExercise(targetKey, {
            language: next.lang,
            lang: next.lang,
            workspace: next.workspace ?? undefined,
            codeWorkspace: next.workspace ?? undefined,
            ideWorkspace: next.workspace ?? undefined,
            stdin: next.stdin ?? "",
            codeStdin: next.stdin ?? "",
            code: getWorkspaceEntryCode(next.workspace) ?? next.code,
            ...(userEdited
                ? {
                    userEdited: true,
                    workspaceOrigin: "user",
                }
                : {}),
            ...feedbackDismissPatch,
        } as any);
    },
    [patchExercise],
  );

    const patchCodeInput = useCallback(
        (id: string, patch: any) => {
            if (!id) return;

            clearRunFeedback(id);
            syncCodeInputSnapshot(id, {
                ...patch,
                preferSnapshot: true,
                userEdited: true,
                updateOrigin: "user",
                workspaceOrigin: "user",
            });
        },
        [clearRunFeedback, syncCodeInputSnapshot],
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

      if (current === targetKey) {
        setRequestedId(null);
        return;
      }

      bindNow(id);
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

      let nextArgs: RegisterArgs = args;

      if (prev?.preferSnapshot) {
        const incomingMatchesPatchedSnapshot =
          prev.lang === args.lang &&
          prev.code === args.code &&
          (prev.stdin ?? "") === (args.stdin ?? "") &&
          workspaceKeyOf(prev.workspace ?? null) === workspaceKeyOf(args.workspace ?? null);

        nextArgs = incomingMatchesPatchedSnapshot
          ? { ...args, preferSnapshot: false }
          : {
              ...args,
              lang: prev.lang,
              code: prev.code,
              stdin: prev.stdin,
              workspace: prev.workspace,
              preferSnapshot: true,
            };
      }

      const prevKey = registerArgsKey(prev);
      const nextKey = registerArgsKey(nextArgs);

      registryRef.current.set(id, nextArgs);

      if (!had || prevKey !== nextKey) setRegistryTick((x) => x + 1);

      if (requestedId === id) {
        defer(() => bindNow(id));
      }
    },
    [clearUnbindTimer, requestedId, bindNow],
  );

  const unregisterCodeInput = useCallback(
    (id: string) => {
      if (!id) return;

      const targetKeyBeforeDelete = getTargetKeyForInputId(id);

      registryRef.current.delete(id);
      metaRef.current.delete(id);
      setRegistryTick((x) => x + 1);
      setMetaTick((x) => x + 1);
      clearRunFeedback(id);

      const timer = window.setTimeout(() => {
        unbindTimersRef.current.delete(id);

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
      const current = useReviewRuntimeStore.getState().tool.boundExerciseKey;
      if (current) storeUnbindExerciseTool(current);
      setRequestedId(null);
      return;
    }

    const targetKey = getTargetKeyForInputId(next);
    if (targetKey) bindExerciseTool(targetKey);
  }, [externalBoundId, getTargetKeyForInputId, bindExerciseTool, storeUnbindExerciseTool]);

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

  const value = useMemo<ReviewToolsValue>(
    () => ({
      enabled: Boolean(enabled),

      registerCodeInput,
      unregisterCodeInput,
      requestBind,
      requestBindNext,
      unbindCodeInput,

      setCodeInputMeta,

      boundId: getInputIdForToolKey((externalBoundId ?? storeBoundId) ?? null) ?? null,
      isBound,
      ensureVisible: enabled ? ensureVisible : undefined,

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
      externalBoundId,
      storeBoundId,
      getInputIdForToolKey,
      isBound,
      ensureVisible,
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
