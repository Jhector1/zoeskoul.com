"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import type { Exercise, SqlDialect } from "@/lib/practice/types";
import type { VectorPadState } from "@/components/vectorpad/types";

import NumericExerciseUI from "./kinds/NumericExerciseUI";
import SingleChoiceExerciseUI from "./kinds/SingleChoiceExerciseUI";
import MultiChoiceExerciseUI from "./kinds/MultiChoiceExerciseUI";
import VectorDragTargetExerciseUI from "./kinds/VectorDragTargetExerciseUI";
import VectorDragDotExerciseUI from "./kinds/VectorDragDotExerciseUI";
import CodeInputExerciseUI from "./kinds/CodeInputExerciseUI";
import TextInputExerciseUI from "./kinds/TextInputExerciseUI";
import DragReorderExerciseUI from "./kinds/DragReorderExerciseUI";
import VoiceInputExerciseUI from "./kinds/VoiceInputExerciseUI";

import type { QItem } from "./practiceType";
import MatrixInputPanel from "./MatrixInputPanel";
import { resizeGrid } from "@/lib/practice/matrixHelpers";
import FillBlankChoiceExerciseUI from "@/components/practice/kinds/FillBlankChoiceExerciseUI";
import ListenBuildExerciseUI from "@/components/practice/kinds/ListenBuildExerciseUI";
import { resolveDeepTagged } from "@/i18n/resolveDeepTagged";
import { useTaggedT } from "@/i18n/tagged";
import type { RunnerLanguage } from "@zoeskoul/code-contracts";
import type { LearningIdeConfig } from "@/lib/ide/learningIdeConfig";
import type { WorkspaceStateV2 } from "@/components/ide/types";
import { useReviewRuntimeStore } from "@/components/review/module/runtime/reviewRuntimeStore";
import { getExerciseStateKey } from "@/components/review/module/runtime/exerciseKeys";
import { exerciseDebug, summarizeExercisePatch, summarizeExerciseWorkspace } from "@/components/review/module/runtime/exerciseDebug";
import { resolveExerciseWorkspace, deriveEntryCode } from "@/components/review/module/runtime/exerciseWorkspaceResolver";


type SqlTableSnapshot = {
    name: string;
    columns: Array<{
        name: string;
        type?: string | null;
    }>;
    rows: unknown[][];
    rowCount: number;
};

type SqlTableSnapshots = Record<string, SqlTableSnapshot>;

type CodeInputExerciseWithSqlExtras = Extract<Exercise, { kind: "code_input" }> & {
    sqlSchemaSql?: string;
    sqlSeedSql?: string;
    sqlSetupSql?: string;
    sqlDatasetId?: string;
    sqlInitialTableSnapshots?: SqlTableSnapshots;
    topicRuntimeDefaults?: {
        fixedSqlDialect?: SqlDialect;
        datasetId?: string;
    } | null;
    moduleRuntimeDefaults?: {
        fixedSqlDialect?: SqlDialect;
        datasetId?: string;
    } | null;
};

type CodeToolsApi = {
    registerCodeInput: (
        id: string,
        args: {
            exerciseKey?: string;
            lang: RunnerLanguage;
            code: string;
            stdin?: string;
            ideConfig?: LearningIdeConfig | null;
            workspace?: WorkspaceStateV2 | null;
            ownerCardId?: string | null;
            preferSnapshot?: boolean;

            sqlDialect?: SqlDialect;
            sqlDatasetId?: string;
            sqlSchemaSql?: string;
            sqlSeedSql?: string;
            sqlInitialTableSnapshots?: SqlTableSnapshots;

            onPatch: (patch: any) => void;
        },
    ) => void;
    unregisterCodeInput: (id: string) => void;

    requestBind: (id: string) => void;
    requestBindNext: (afterId: string) => void;
    unbindCodeInput: () => void;

    isBound: (id: string) => boolean;
    boundId: string | null;

    ensureVisible?: () => void;

    getRunFeedbackEntry?: (id: string) => { feedback: any | null; tick: number } | null;
    setRunFeedback?: (id: string, feedback: any | null) => void;
    clearRunFeedback?: (id: string) => void;

    syncCodeInputSnapshot?: (id: string, patch: any) => void;
    patchCodeInput?: (id: string, patch: any) => void;
    sketch?: any;
};

function getStableExerciseId(args: {
    exerciseStateId?: string;
    exercise?: any;
    current?: any;
}) {
    const { exerciseStateId, exercise, current } = args;

    return (
        exerciseStateId ||
        exercise?.exerciseKey ||
        exercise?.stableKey ||
        exercise?.key ||
        current?.exerciseKey ||
        current?.stableExerciseId ||
        current?.key ||
        exercise?.id ||
      "default"
    );
}

function codeWorkspacePatch(
    workspace: WorkspaceStateV2,
    language?: RunnerLanguage | string | null,
) {
    const code = deriveEntryCode(workspace) ?? "";
    const stdin = workspace.stdin ?? "";
    const lang = (workspace.language || language || "python") as RunnerLanguage;

    return {
        workspace,
        codeWorkspace: workspace,
        ideWorkspace: workspace,
        code,
        source: code,
        stdin,
        codeStdin: stdin,
        language: lang,
        codeLang: lang,
        lang,
        userEdited: true,
        workspaceOrigin: "user",
        updatedAt: Date.now(),
    };
}

function firstNonBlank(...values: Array<string | null | undefined>) {
    for (const value of values) {
        if (typeof value === "string" && value.trim()) return value;
    }
    return undefined;
}

function CodeInputWithTools(props: {
    exercise: CodeInputExerciseWithSqlExtras;
    current: any;
    lockInputs: boolean;
    checked: boolean;
    ok: boolean | null;
    readOnly: boolean;
    resetCheckPatch: () => any;

    codeTools: CodeToolsApi;
    codeInputId: string;
    ownerCardId?: string | null;

    updateCurrent: (patch: any) => void;
    showPrompt: boolean;
    toolAutoOpen?: boolean;

    feedback?: any;
    topicId?: string;
    cardId?: string;
    subjectSlug?: string;
    moduleSlug?: string;
    sectionSlug?: string;
    exerciseStateId?: string;
    explanation?: string | null;
}) {
    const {
        exercise,
        current,
        lockInputs,
        checked,
        ok,
        readOnly,
        resetCheckPatch,
        codeTools,
        codeInputId,
        ownerCardId,
        updateCurrent,
        showPrompt,
        toolAutoOpen = true,
        feedback,
        explanation,
        subjectSlug,
        moduleSlug,
        sectionSlug,
        topicId,
        cardId,
        exerciseStateId,
    } = props;

    const {
        registerCodeInput,
        unregisterCodeInput,
        isBound,
        boundId,
        ensureVisible,
        requestBind,
        getRunFeedbackEntry,
        sketch,
    } = codeTools;

    const curLang = ((current as any).codeLang ??
        exercise?.language ??
        ((exercise as any)?.fixedSqlDialect || (exercise as any)?.runtime?.datasetId
            ? "sql"
            : "python")) as RunnerLanguage;

    const curCode = (current as any).code ?? exercise.starterCode ?? "";
    const curStdin = (current as any).codeStdin ?? "";

    const curWorkspace =
        (current as any).workspace && (current as any).workspace.version === 2
            ? ((current as any).workspace as WorkspaceStateV2)
            : (current as any).codeWorkspace && (current as any).codeWorkspace.version === 2
                ? ((current as any).codeWorkspace as WorkspaceStateV2)
                : (current as any).ideWorkspace && (current as any).ideWorkspace.version === 2
                    ? ((current as any).ideWorkspace as WorkspaceStateV2)
                    : (exercise as any).workspace && (exercise as any).workspace.version === 2
                        ? ((exercise as any).workspace as WorkspaceStateV2)
                        : (exercise as any).initialWorkspace &&
                        (exercise as any).initialWorkspace.version === 2
                            ? ((exercise as any).initialWorkspace as WorkspaceStateV2)
                            : resolveExerciseWorkspace({
                                language: curLang as any,
                                manifest: exercise,
                            });

    const stableExerciseId = getStableExerciseId({
        exerciseStateId,
        exercise,
        current,
    });

    const commonExerciseKey = getExerciseStateKey(
        {
            subjectSlug: subjectSlug || "",
            moduleSlug: moduleSlug || "",
            sectionSlug: sectionSlug,
            topicId: topicId || "",
            cardId: cardId || "",
        },
        stableExerciseId,
    );

    const exerciseKey = commonExerciseKey;

    const ensureExercise = useReviewRuntimeStore((s) => s.ensureExercise);
    const patchExercise = useReviewRuntimeStore((s) => s.patchExercise);
    const storeExercise = useReviewRuntimeStore((s) => s.exercises[exerciseKey]);

    const isSqlExercise =
        curLang === "sql" ||
        exercise?.language === "sql" ||
        Boolean((exercise as any)?.fixedSqlDialect) ||
        Boolean((exercise as any)?.runtime?.datasetId) ||
        typeof exercise?.sqlSchemaSql === "string" ||
        typeof exercise?.sqlSeedSql === "string";

    const exerciseSqlDialect = isSqlExercise ? exercise?.fixedSqlDialect : undefined;

    const exerciseSqlDatasetId =
        isSqlExercise
            ? firstNonBlank(
                (exercise as any)?.runtime?.datasetId,
                exercise?.sqlDatasetId,
                (exercise as any)?.topicRuntimeDefaults?.datasetId,
                (exercise as any)?.moduleRuntimeDefaults?.datasetId,
            )
            : undefined;

    const exerciseSqlSchemaSql =
        isSqlExercise && typeof exercise?.sqlSchemaSql === "string"
            ? exercise.sqlSchemaSql
            : undefined;

    const exerciseSqlSeedSql =
        isSqlExercise && typeof exercise?.sqlSeedSql === "string"
            ? exercise.sqlSeedSql
            : undefined;

    const exerciseSqlInitialTableSnapshots =
        isSqlExercise &&
        exercise?.sqlInitialTableSnapshots &&
        typeof exercise.sqlInitialTableSnapshots === "object"
            ? exercise.sqlInitialTableSnapshots
            : undefined;

    useEffect(() => {
        if (exercise.kind !== "code_input") return;

        ensureExercise({
            exerciseKey,
            subjectSlug: subjectSlug || "",
            moduleSlug: moduleSlug || "",
            sectionSlug: sectionSlug,
            topicId: topicId || "",
            cardId: cardId || "",
            manifest: exercise,
            saved: current,
        });
    }, [
        exerciseKey,
        exercise,
        current,
        ensureExercise,
        subjectSlug,
        moduleSlug,
        sectionSlug,
        topicId,
        cardId,
    ]);

    const onPatch = useCallback(
        (patch: any) => {
            patchExercise(exerciseKey, patch);
            updateCurrent(patch as any);
        },
        [patchExercise, exerciseKey, updateCurrent],
    );

    const activeWorkspace = storeExercise?.workspace ?? curWorkspace;
    const activeCode =
        deriveEntryCode(activeWorkspace) ??
        storeExercise?.code ??
        (current as any).code ??
        exercise.starterCode ??
        "";
    const activeStdin = activeWorkspace?.stdin ?? storeExercise?.stdin ?? (current as any).codeStdin ?? "";
    const activeLanguage = (storeExercise?.language || activeWorkspace?.language || (exercise as any).language || "python") as RunnerLanguage;
    const activeSketch = storeExercise?.sketch || null;



    const registerArgs = useMemo(
        () => ({
            exerciseKey,
            lang: activeLanguage,
            code: activeCode,
            stdin: activeStdin,
            ideConfig: exercise.ideConfig ?? null,
            workspace: activeWorkspace,
            ownerCardId,
            preferSnapshot: false,
            sqlDialect: activeLanguage === "sql" ? ((storeExercise as any)?.sqlDialect ?? exerciseSqlDialect) : undefined,
            sqlDatasetId:
                activeLanguage === "sql"
                    ? firstNonBlank((storeExercise as any)?.sqlDatasetId, exerciseSqlDatasetId)
                    : undefined,
            sqlSchemaSql:
                activeLanguage === "sql"
                    ? firstNonBlank((storeExercise as any)?.sqlSchemaSql, exerciseSqlSchemaSql)
                    : undefined,
            sqlSeedSql:
                activeLanguage === "sql"
                    ? firstNonBlank((storeExercise as any)?.sqlSeedSql, exerciseSqlSeedSql)
                    : undefined,
            sqlInitialTableSnapshots:
                activeLanguage === "sql" ? ((storeExercise as any)?.sqlInitialTableSnapshots ?? exerciseSqlInitialTableSnapshots) : undefined,
            onPatch,
        }),
        [
            exerciseKey,
            activeLanguage,
            activeCode,
            activeStdin,
            exercise.ideConfig,
            activeWorkspace,
            ownerCardId,
            exerciseSqlDialect,
            exerciseSqlDatasetId,
            exerciseSqlSchemaSql,
            exerciseSqlSeedSql,
            exerciseSqlInitialTableSnapshots,
            onPatch,
        ],
    );

    const unregisterRef = useRef(unregisterCodeInput);

    useEffect(() => {
        unregisterRef.current = unregisterCodeInput;
    }, [unregisterCodeInput]);

    useEffect(() => {
        registerCodeInput(codeInputId, registerArgs);
        return () => unregisterRef.current(codeInputId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [codeInputId]);

    const lastAutoBindKeyRef = useRef<string | null>(null);

    useEffect(() => {
        registerCodeInput(codeInputId, registerArgs);
    }, [registerCodeInput, codeInputId, registerArgs]);

    /**
     * Critical:
     * In tools mode, the right-side editor must follow the currently rendered
     * exercise. But this must be idempotent; otherwise requestBind causes a
     * Zustand update, which rerenders this component, which calls requestBind
     * again forever.
     */
    useEffect(() => {
        if (!toolAutoOpen) return;

        const autoBindKey = `${codeInputId}::${exerciseKey}`;
        if (lastAutoBindKeyRef.current === autoBindKey) return;

        lastAutoBindKeyRef.current = autoBindKey;

        queueMicrotask(() => {
            ensureVisible?.();
            requestBind(codeInputId);
        });

        // Intentionally depend only on the active exercise identity.
        // ensureVisible/requestBind/isBound can change as a result of binding
        // and must not retrigger this effect.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [toolAutoOpen, codeInputId, exerciseKey]);

    const toolsBoundToThis = isBound(codeInputId);
    const toolsUnbound = boundId == null;
    const runEntry = getRunFeedbackEntry?.(codeInputId) ?? null;
    const toolRunFeedback = runEntry?.feedback ?? null;
    const toolRunTick = runEntry?.tick ?? 0;
    const savedSketch = storeExercise?.sketch || null;

    return (
        <CodeInputExerciseUI
            exercise={exercise}
            code={activeCode}
            stdin={activeStdin}
            exerciseKey={exerciseKey}
            subjectSlug={subjectSlug}
            moduleSlug={moduleSlug}
            sectionSlug={sectionSlug}
            topicId={topicId}
            cardId={cardId}
            workspace={activeWorkspace}
            language={activeLanguage}
            sketch={activeSketch}
            savedSketch={savedSketch}
            onChangeCode={(code) =>
                onPatch({
                    code,
                    source: code,
                    userEdited: true,
                    workspaceOrigin: "user",
                    updatedAt: Date.now(),
                    ...resetCheckPatch(),
                })
            }
            onChangeStdin={(stdin) =>
                onPatch({
                    stdin,
                    codeStdin: stdin,
                    userEdited: true,
                    workspaceOrigin: "user",
                    updatedAt: Date.now(),
                    ...resetCheckPatch(),
                })
            }
            onChangeLanguage={(language) =>
                onPatch({
                    language,
                    codeLang: language,
                    lang: language,
                    userEdited: true,
                    workspaceOrigin: "user",
                    updatedAt: Date.now(),
                    ...resetCheckPatch(),
                })
            }
            onChangeWorkspace={(workspace) => {
                onPatch({
                    ...codeWorkspacePatch(workspace, activeLanguage),
                    ...resetCheckPatch(),
                });
            }}
            disabled={lockInputs}
            checked={checked}
            ok={ok}
            readOnly={readOnly}
            variant="tools"
            toolsBound={toolsBoundToThis}
            toolsUnbound={toolsUnbound}
            autoBindMode={toolAutoOpen ? "always" : "never"}
            showPrompt={showPrompt}
            feedback={feedback ?? null}
            explanation={explanation ?? null}
            runFeedback={toolRunFeedback}
            runFeedbackTick={toolRunTick}
            onUseTools={() => {
                ensureVisible?.();
                requestBind(codeInputId);
            }}
            onSketchStateChange={(state) => sketch?.saveSketchDebounced?.(exerciseKey, state, true)}
        />
    );
}

export default function ExerciseRenderer({
                                             exercise,
                                             current,
                                             busy,
                                             isAssignmentRun,
                                             maxAttempts,
                                             padRef,
                                             updateCurrent,
                                             readOnly = false,
                                             reviewCorrectItem = null,
                                             codeRunnerMode = "embedded",
                                             codeTools = null,
                                             codeInputId,
                                             codeOwnerCardId,
                                             codeToolsAutoOpen = true,
                                             showPrompt = true,

                                             subjectSlug,
                                             moduleSlug,
                                             sectionSlug,
                                             topicId,
                                             cardId,
                                             exerciseStateId,
                                         }: {
    exercise: Exercise;
    current: QItem;
    busy: boolean;
    isAssignmentRun: boolean;
    maxAttempts: number | null;
    padRef: React.MutableRefObject<VectorPadState>;
    updateCurrent: (patch: Partial<QItem>) => void;
    readOnly?: boolean;

    reviewCorrectItem?: QItem | null;

    codeRunnerMode?: "embedded" | "tools";
    codeTools?: CodeToolsApi | null;
    codeInputId?: string;
    codeOwnerCardId?: string | null;
    codeToolsAutoOpen?: boolean;
    showPrompt?: boolean;

    subjectSlug?: string;
    moduleSlug?: string;
    sectionSlug?: string;
    topicId?: string;
    cardId?: string;
    exerciseStateId?: string;
}) {
    const { raw } = useTaggedT();

    const ex = useMemo(() => {
        return resolveDeepTagged(exercise, (key) => raw(key, "")) as Exercise;
    }, [exercise, raw]);

    const ensureExercise = useReviewRuntimeStore((s) => s.ensureExercise);

    const stableExerciseId = useMemo(() => {
        return getStableExerciseId({
            exerciseStateId,
            exercise: ex as any,
            current,
        });
    }, [exerciseStateId, ex, current]);

    const exerciseKey = useMemo(() => {
        return getExerciseStateKey(
            { subjectSlug, moduleSlug, sectionSlug, topicId, cardId },
            stableExerciseId,
        );
    }, [subjectSlug, moduleSlug, sectionSlug, topicId, cardId, stableExerciseId]);

    const storeExercise = useReviewRuntimeStore((s) => s.exercises[exerciseKey]);
    const patchExercise = useReviewRuntimeStore((s) => s.patchExercise);

    useEffect(() => {
        if (ex.kind !== "code_input") return;

        ensureExercise({
            exerciseKey,
            subjectSlug: subjectSlug || "",
            moduleSlug: moduleSlug || "",
            sectionSlug,
            topicId: topicId || "",
            cardId: cardId || "",
            manifest: ex,
            saved: current,
        });
    }, [
        ex,
        exerciseKey,
        ensureExercise,
        subjectSlug,
        moduleSlug,
        sectionSlug,
        topicId,
        cardId,
        current,
    ]);

    const onPatch = useCallback(
        (patch: any) => {
            patchExercise(exerciseKey, patch);
            updateCurrent(patch as any);
        },
        [patchExercise, exerciseKey, updateCurrent],
    );

    const maxA =
        maxAttempts == null || !Number.isFinite(maxAttempts)
            ? Number.POSITIVE_INFINITY
            : Math.max(1, Math.floor(maxAttempts));

    const attempts = (current as any).attempts ?? 0;
    const hasAnyResult = Boolean((current as any).submitted || (current as any).result);

    const isRevealResult = Boolean(
        (current as any)?.result?.revealUsed ||
        (current as any)?.result?.revealAnswer,
    );

    const exRef = useRef(ex);
    exRef.current = ex;

    const ok: boolean | null =
        !isRevealResult && typeof (current as any).result?.ok === "boolean"
            ? (current as any).result.ok
            : null;

    const checked = Boolean((current as any).submitted || ok !== null);
    const finalized = Boolean((current as any)?.result?.finalized);

    const outOfAttempts =
        finalized || (maxA !== Number.POSITIVE_INFINITY && attempts >= maxA && ok !== true);

    const lockInputs = readOnly || busy || ok === true || outOfAttempts;

    function resetCheckPatch() {
        if (readOnly) return {};
        return hasAnyResult ? { submitted: false, result: null } : {};
    }

    useEffect(() => {
        if (ex.kind !== "code_input") return;

        const store = useReviewRuntimeStore.getState().exercises[exerciseKey];

        const workspace =
            store?.workspace ??
            ((current as any).workspace?.version === 2
                ? (current as any).workspace
                : (current as any).codeWorkspace?.version === 2
                    ? (current as any).codeWorkspace
                    : (current as any).ideWorkspace?.version === 2
                        ? (current as any).ideWorkspace
                        : null);

        if (!workspace || workspace.version !== 2) return;

        const workspaceCode = deriveEntryCode(workspace) ?? "";
        const workspaceStdin = workspace.stdin ?? "";

        const currentCode = (current as any).code;
        const currentStdin = (current as any).codeStdin;
        const currentWorkspace = (current as any).workspace;

        const needsSync =
            currentCode !== workspaceCode ||
            currentStdin !== workspaceStdin ||
            currentWorkspace !== workspace;

        if (!needsSync) return;

        updateCurrent({
            workspace,
            codeWorkspace: workspace,
            ideWorkspace: workspace,
            code: workspaceCode,
            source: workspaceCode,
            stdin: workspaceStdin,
            codeStdin: workspaceStdin,
            userEdited: store?.userEdited === true || store?.workspaceOrigin === "user" || store?.workspaceOrigin === "saved",
            workspaceOrigin: store?.workspaceOrigin ?? "saved",
            starterHash: store?.starterHash,
            updatedAt: store?.updatedAt ?? Date.now(),
        } as any);
    }, [ex.kind, exerciseKey, current, updateCurrent]);

    if (ex.kind === "numeric") {
        return (
            <NumericExerciseUI
                exercise={ex}
                value={current.num}
                onChange={(num) => updateCurrent({ num, ...resetCheckPatch() })}
                disabled={lockInputs}
                checked={checked}
                ok={ok}
            />
        );
    }

    if (ex.kind === "single_choice") {
        const reviewCorrectId =
            reviewCorrectItem && typeof (reviewCorrectItem as any).single === "string"
                ? String((reviewCorrectItem as any).single)
                : null;

        return (
            <SingleChoiceExerciseUI
                exercise={ex}
                value={current.single}
                onChange={(id) => updateCurrent({ single: id, ...resetCheckPatch() })}
                disabled={lockInputs}
                checked={checked}
                ok={ok}
                reviewCorrectId={reviewCorrectId}
            />
        );
    }

    if (ex.kind === "multi_choice") {
        const reviewCorrectIds =
            reviewCorrectItem && Array.isArray((reviewCorrectItem as any).multi)
                ? (reviewCorrectItem as any).multi.map((x: any) => String(x))
                : null;

        return (
            <MultiChoiceExerciseUI
                exercise={ex}
                value={current.multi}
                onChange={(ids) => updateCurrent({ multi: ids, ...resetCheckPatch() })}
                disabled={lockInputs}
                checked={checked}
                ok={ok}
                reviewCorrectIds={reviewCorrectIds}
            />
        );
    }

    if (ex.kind === "text_input") {
        const reviewCorrectText =
            reviewCorrectItem && typeof (reviewCorrectItem as any).text === "string"
                ? String((reviewCorrectItem as any).text)
                : null;

        return (
            <TextInputExerciseUI
                exercise={ex as any}
                value={(current as any).text ?? ""}
                onChange={(text) => updateCurrent({ text, ...resetCheckPatch() })}
                disabled={lockInputs}
                checked={checked}
                ok={ok}
                reviewCorrectText={reviewCorrectText}
            />
        );
    }

    if (ex.kind === "drag_reorder") {
        const curOrder = Array.isArray((current as any).reorder)
            ? (current as any).reorder.map(String)
            : Array.isArray((current as any).reorderIds)
                ? (current as any).reorderIds.map(String)
                : [];

        const reviewCorrectTokenIds =
            reviewCorrectItem && Array.isArray((reviewCorrectItem as any).reorder)
                ? (reviewCorrectItem as any).reorder.map((x: any) => String(x))
                : reviewCorrectItem && Array.isArray((reviewCorrectItem as any).reorderIds)
                    ? (reviewCorrectItem as any).reorderIds.map((x: any) => String(x))
                    : null;

        return (
            <DragReorderExerciseUI
                exercise={ex as any}
                tokenIds={curOrder}
                onChange={(ids) =>
                    updateCurrent({
                        reorder: ids,
                        ui: {
                            ...(current.ui ?? {}),
                            reorderTouched: true,
                        },
                        ...resetCheckPatch(),
                    })
                }
                disabled={lockInputs}
                checked={checked}
                ok={ok}
                reviewCorrectTokenIds={reviewCorrectTokenIds}
            />
        );
    }

    if (ex.kind === "voice_input") {
        const reviewCorrectTranscript =
            reviewCorrectItem && typeof (reviewCorrectItem as any).voiceTranscript === "string"
                ? String((reviewCorrectItem as any).voiceTranscript)
                : null;

        return (
            <VoiceInputExerciseUI
                exercise={ex as any}
                transcript={(current as any).voiceTranscript ?? ""}
                onChangeTranscript={(voiceTranscript) =>
                    updateCurrent({ voiceTranscript, ...resetCheckPatch() })
                }
                disabled={lockInputs}
                checked={checked}
                ok={ok}
                reviewCorrectTranscript={reviewCorrectTranscript}
            />
        );
    }

    if (ex.kind === "matrix_input") {
        const exAny = ex as any;
        const allowResize = true;
        const panelReadOnly = lockInputs;

        return (
            <MatrixInputPanel
                labelLatex={exAny.labelLatex ?? String.raw`\mathbf{A}=`}
                rows={current.matRows}
                cols={current.matCols}
                allowResize={allowResize}
                value={current.mat}
                readOnly={panelReadOnly}
                requiredRows={exAny.rows}
                requiredCols={exAny.cols}
                onShapeChange={(r, c) => {
                    updateCurrent({
                        matRows: r,
                        matCols: c,
                        mat: resizeGrid(current.mat, r, c),
                        ...(hasAnyResult ? { submitted: false, result: null } : {}),
                    });
                }}
                onChange={(next) =>
                    updateCurrent({
                        mat: next,
                        ...(hasAnyResult ? { submitted: false, result: null } : {}),
                    })
                }
            />
        );
    }

    if (ex.kind === "vector_drag_target") {
        return (
            <VectorDragTargetExerciseUI
                key={(ex as any).id ?? (exercise as any).key ?? current.key}
                exercise={ex}
                a={current.dragA}
                b={current.dragB}
                onChange={(a, b) => updateCurrent({ dragA: a, dragB: b, ...resetCheckPatch() })}
                padRef={padRef}
                disabled={lockInputs}
            />
        );
    }

    if (ex.kind === "listen_build") {
        return (
            <ListenBuildExerciseUI
                exercise={ex as any}
                value={(current as any).text ?? ""}
                onChangeValue={(text) => updateCurrent({ text, ...resetCheckPatch() })}
                disabled={lockInputs}
                checked={checked}
                showTargetWhen="never"
                ok={ok}
            />
        );
    }

    if (ex.kind === "fill_blank_choice") {
        const reviewCorrectValue =
            reviewCorrectItem && typeof (reviewCorrectItem as any).text === "string"
                ? String((reviewCorrectItem as any).text)
                : typeof (exercise as any).correct === "string"
                    ? String((exercise as any).correct)
                    : null;

        return (
            <FillBlankChoiceExerciseUI
                exercise={ex as any}
                value={(current as any).text ?? ""}
                onChangeValue={(text) => updateCurrent({ text, single: text, ...resetCheckPatch() })}
                disabled={lockInputs}
                checked={checked}
                ok={ok}
                reviewCorrectValue={reviewCorrectValue}
            />
        );
    }

    if (ex.kind === "vector_drag_dot") {
        return (
            <VectorDragDotExerciseUI
                exercise={ex}
                a={current.dragA}
                onChange={(a) => updateCurrent({ dragA: a, ...resetCheckPatch() })}
                padRef={padRef}
                disabled={lockInputs}
            />
        );
    }

    const resultAny = (current as any)?.result ?? null;
    const codeFeedback = resultAny?.feedback ?? null;
    const codeExplanation =
        typeof resultAny?.explanation === "string" ? resultAny.explanation : null;

    if (ex.kind === "code_input") {
        const useTools = codeRunnerMode === "tools" && !!codeTools && !!codeInputId;

        if (useTools) {
            return (
                <CodeInputWithTools
                    exercise={ex}
                    current={current}
                    lockInputs={lockInputs}
                    checked={checked}
                    ok={ok}
                    readOnly={readOnly}
                    resetCheckPatch={resetCheckPatch}
                    codeTools={codeTools!}
                    codeInputId={codeInputId!}
                    ownerCardId={codeOwnerCardId}
                    updateCurrent={updateCurrent}
                    showPrompt={showPrompt}
                    toolAutoOpen={codeToolsAutoOpen}
                    feedback={codeFeedback}
                    explanation={codeExplanation}
                    subjectSlug={subjectSlug}
                    moduleSlug={moduleSlug}
                    sectionSlug={sectionSlug}
                    topicId={topicId}
                    cardId={cardId}
                    exerciseStateId={stableExerciseId}
                />
            );
        }

        const exCode = ex as CodeInputExerciseWithSqlExtras;
        const effectiveSqlRuntime =
            (exCode as any).runtime ??
            (exCode as any).topicRuntimeDefaults ??
            (exCode as any).moduleRuntimeDefaults ??
            null;
        const effectiveSqlDatasetId = firstNonBlank(
            (storeExercise as any)?.sqlDatasetId,
            (exCode as any)?.runtime?.datasetId,
            (exCode as any)?.sqlDatasetId,
            effectiveSqlRuntime?.datasetId,
        );
        const effectiveSqlSchemaSql = firstNonBlank(
            (storeExercise as any)?.sqlSchemaSql,
            (exCode as any)?.sqlSchemaSql,
        );
        const effectiveSqlSeedSql = firstNonBlank(
            (storeExercise as any)?.sqlSeedSql,
            (exCode as any)?.sqlSeedSql,
        );

        const starterWorkspace = resolveExerciseWorkspace({
            language: ((exCode as any).language || "python") as any,
            manifest: exCode,
            saved:
                (current as any).workspace?.version === 2
                    ? (current as any).workspace
                    : (current as any).codeWorkspace?.version === 2
                        ? (current as any).codeWorkspace
                        : (current as any).ideWorkspace?.version === 2
                            ? (current as any).ideWorkspace
                            : null,
        });

        const activeWorkspace = storeExercise?.workspace ?? starterWorkspace;

        const activeCode =
            deriveEntryCode(activeWorkspace) ??
            storeExercise?.code ??
            (current as any).code ??
            (exCode as any).starterCode ??
            "";
        const activeStdin = activeWorkspace?.stdin ?? storeExercise?.stdin ?? (current as any).codeStdin ?? "";
        const activeLanguage = (storeExercise?.language || activeWorkspace?.language || (exCode as any).language || "python") as RunnerLanguage;



        return (
            <CodeInputExerciseUI
                exercise={exCode}
                code={activeCode}
                stdin={activeStdin}
                workspace={activeWorkspace}
                exerciseKey={exerciseKey}
                subjectSlug={subjectSlug}
                moduleSlug={moduleSlug}
                sectionSlug={sectionSlug}
                topicId={topicId}
                cardId={cardId}
                frame="card"
                language={activeLanguage}
                onChangeCode={(code) =>
                    onPatch({
                        code,
                        source: code,
                        userEdited: true,
                        workspaceOrigin: "user",
                        updatedAt: Date.now(),
                        ...resetCheckPatch(),
                    })
                }
                onChangeStdin={(codeStdin) =>
                    onPatch({
                        stdin: codeStdin,
                        codeStdin,
                        userEdited: true,
                        workspaceOrigin: "user",
                        updatedAt: Date.now(),
                        ...resetCheckPatch(),
                    })
                }
                onChangeLanguage={(codeLang) =>
                    onPatch({
                        language: codeLang,
                        codeLang,
                        lang: codeLang,
                        userEdited: true,
                        workspaceOrigin: "user",
                        updatedAt: Date.now(),
                        ...resetCheckPatch(),
                    })
                }
                onChangeWorkspace={(workspace) => {
                    onPatch({
                        ...codeWorkspacePatch(workspace, activeLanguage),
                        ...resetCheckPatch(),
                    });
                }}
                disabled={lockInputs}
                checked={checked}
                ok={ok}
                showPrompt={showPrompt}
                readOnly={readOnly}
                variant="embedded"
                feedback={codeFeedback}
                explanation={codeExplanation}
                sqlDialect={(storeExercise as any)?.sqlDialect ?? exCode.fixedSqlDialect ?? effectiveSqlRuntime?.fixedSqlDialect}
                sqlDatasetId={effectiveSqlDatasetId}
                sqlResultShape={
                    (storeExercise as any)?.runtime?.resultShape ??
                    (exCode as any)?.runtime?.resultShape ??
                    effectiveSqlRuntime?.resultShape
                }
                sqlSchemaSql={effectiveSqlSchemaSql}
                sqlSeedSql={effectiveSqlSeedSql}
                sqlSetupSql={(exCode as any).sqlSetupSql}
                sqlInitialTableSnapshots={(storeExercise as any)?.sqlInitialTableSnapshots ?? (exCode as any).sqlInitialTableSnapshots}
            />
        );
    }

    return null;
}
