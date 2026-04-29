"use client";

import React, {useCallback, useEffect, useMemo, useRef} from "react";
import type {Exercise, SqlDialect} from "@/lib/practice/types";
import type {VectorPadState} from "@/components/vectorpad/types";

import NumericExerciseUI from "./kinds/NumericExerciseUI";
import SingleChoiceExerciseUI from "./kinds/SingleChoiceExerciseUI";
import MultiChoiceExerciseUI from "./kinds/MultiChoiceExerciseUI";
import VectorDragTargetExerciseUI from "./kinds/VectorDragTargetExerciseUI";
import VectorDragDotExerciseUI from "./kinds/VectorDragDotExerciseUI";
import CodeInputExerciseUI from "./kinds/CodeInputExerciseUI";

// ✅ NEW kinds
import TextInputExerciseUI from "./kinds/TextInputExerciseUI";
import DragReorderExerciseUI from "./kinds/DragReorderExerciseUI";
import VoiceInputExerciseUI from "./kinds/VoiceInputExerciseUI";

import type {QItem} from "./practiceType";
import MatrixInputPanel from "./MatrixInputPanel";
import {resizeGrid} from "@/lib/practice/matrixHelpers";
import FillBlankChoiceExerciseUI from "@/components/practice/kinds/FillBlankChoiceExerciseUI";
import ListenBuildExerciseUI from "@/components/practice/kinds/ListenBuildExerciseUI";
import WordBankArrangeExerciseUI from "@/components/practice/kinds/WordBankArrangeExerciseUI";
import {TFn} from "@/components/practice/PracticeShell";
import {useTranslations} from "next-intl";
import {resolveDeepTagged} from "@/i18n/resolveDeepTagged";
import {useTaggedT} from "@/i18n/tagged";
import {RunnerLanguage} from "@zoeskoul/code-contracts";
import type { LearningIdeConfig } from "@/lib/ide/learningIdeConfig";

// ✅ minimal tools API (don’t import review context from practice layer)
// ...imports unchanged
// "use client";

// import React, { useCallback, useEffect, useRef } from "react";
// keep the rest of your imports

// ✅ minimal tools API (don’t import review context from practice layer)
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
            lang: RunnerLanguage;
            code: string;
            stdin?: string;
            ideConfig?: LearningIdeConfig | null;

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
};
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

    updateCurrent: (patch: any) => void;
    showPrompt: boolean;

    feedback?: any;
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
        updateCurrent,
        showPrompt,
        feedback,
        explanation,
    } = props;

    const {
        registerCodeInput,
        unregisterCodeInput,
        isBound,
        boundId,
        ensureVisible,
        requestBind,
        getRunFeedbackEntry,
    } = codeTools;

    const curLang = ((current as any).codeLang ??
        exercise?.language ??
        (exercise?.fixedSqlDialect || exercise?.runtime?.datasetId ? "sql" : "python")) as RunnerLanguage;

    const curCode = (current as any).code ?? exercise.starterCode ?? "";
    const curStdin = (current as any).codeStdin ?? "";

    const isSqlExercise =
        curLang === "sql" ||
        exercise?.language === "sql" ||
        Boolean(exercise?.fixedSqlDialect) ||
        Boolean(exercise?.runtime?.datasetId) ||
        typeof exercise?.sqlSchemaSql === "string" ||
        typeof exercise?.sqlSeedSql === "string";

    const exerciseSqlDialect =
        isSqlExercise ? exercise?.fixedSqlDialect : undefined;

    const exerciseSqlDatasetId =
        isSqlExercise
            ? (typeof exercise?.runtime?.datasetId === "string"
                ? exercise.runtime.datasetId
                : typeof exercise?.sqlDatasetId === "string"
                    ? exercise.sqlDatasetId
                    : undefined)
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
    const onPatch = useCallback((patch: any) => updateCurrent(patch), [updateCurrent]);
    const registerArgs = useMemo(
        () => ({
            lang: curLang,
            code: curCode,
            stdin: curStdin,
            ideConfig: exercise.ideConfig ?? null,
            sqlDialect: curLang === "sql" ? exerciseSqlDialect : undefined,
            sqlDatasetId: curLang === "sql" ? exerciseSqlDatasetId : undefined,
            sqlSchemaSql: curLang === "sql" ? exerciseSqlSchemaSql : undefined,
            sqlSeedSql: curLang === "sql" ? exerciseSqlSeedSql : undefined,
            sqlInitialTableSnapshots:
                curLang === "sql" ? exerciseSqlInitialTableSnapshots : undefined,
            onPatch,
        }),
        [
            curLang,
            curCode,
            curStdin,
            exercise.ideConfig,
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

    // Register on mount, unregister only on actual unmount.
    useEffect(() => {
        registerCodeInput(codeInputId, registerArgs);

        return () => unregisterRef.current(codeInputId);
        // Intentionally not coupled to live register args. Live snapshot sync happens below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [codeInputId]);
    const toolsBoundToThis = isBound(codeInputId);
    const toolsUnbound = boundId == null;

    // Keep the registry snapshot fresh without treating every change like a remount.
    useEffect(() => {
        registerCodeInput(codeInputId, registerArgs);
    }, [registerCodeInput, codeInputId, registerArgs]);
    const runEntry = getRunFeedbackEntry?.(codeInputId) ?? null;
    const toolRunFeedback = runEntry?.feedback ?? null;
    const toolRunTick = runEntry?.tick ?? 0;

    return (
        <CodeInputExerciseUI
            exercise={exercise}
            code={curCode}
            stdin={curStdin}
            language={curLang}
            onChangeCode={(code) => updateCurrent({ code, ...resetCheckPatch() })}
            onChangeStdin={(codeStdin) => updateCurrent({ codeStdin, ...resetCheckPatch() })}
            onChangeLanguage={(codeLang) => updateCurrent({ codeLang, ...resetCheckPatch() })}
            disabled={lockInputs}
            checked={checked}
            ok={ok}
            readOnly={readOnly}
            variant="tools"
            toolsBound={toolsBoundToThis}
            toolsUnbound={toolsUnbound}
            autoBindMode="never"
            showPrompt={showPrompt}
            feedback={feedback ?? null}
            explanation={explanation ?? null}
            runFeedback={toolRunFeedback}
            runFeedbackTick={toolRunTick}
            onUseTools={() => {
                ensureVisible?.();
                requestBind(codeInputId);
            }}
        />
    );
}
// ...rest of ExerciseRenderer unchanged


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
                                             showPrompt = true,

                                         }: {
    exercise: Exercise;
    current: QItem;
    busy: boolean;
    isAssignmentRun: boolean;
    maxAttempts: number | null; // ✅ CHANGED
    padRef: React.MutableRefObject<VectorPadState>;
    updateCurrent: (patch: Partial<QItem>) => void;
    readOnly?: boolean;

    reviewCorrectItem?: QItem | null;

    codeRunnerMode?: "embedded" | "tools";
    codeTools?: CodeToolsApi | null;
    codeInputId?: string;
    showPrompt?: boolean;

}) {
    // const attempts = current.attempts ?? 0;
    //
    // // ✅ "any result exists" includes reveal result objects (even when ok=null)
    // const hasAnyResult = Boolean(current.submitted || current.result);
    //
    // // ✅ only treat ok as graded when boolean (reveal often sets ok=null)
    // const ok: boolean | null = typeof current.result?.ok === "boolean" ? current.result.ok : null;
    //
    // // ✅ checked for STYLING should mean "graded", not merely "result object exists"
    // // (prevents Reveal from forcing red/green states)
    // const checked = Boolean(current.submitted || ok !== null);
    //
    // const outOfAttempts = isAssignmentRun && attempts >= maxAttempts && ok !== true;
    //
    // // lock if readOnly, busy, already correct, or no attempts left
    // const lockInputs = readOnly || busy || ok === true || outOfAttempts;


    // const t = useTranslations("ExerciseRenderer");


    const maxA =
        maxAttempts == null || !Number.isFinite(maxAttempts)
            ? Number.POSITIVE_INFINITY
            : Math.max(1, Math.floor(maxAttempts));

    const attempts = (current as any).attempts ?? 0;
    // any result exists (including reveal objects)
    const hasAnyResult = Boolean((current as any).submitted || (current as any).result);

// ✅ detect reveal (your API returns revealAnswer, and we can also support revealUsed)
    const isRevealResult = Boolean(
        (current as any)?.result?.revealUsed ||
        (current as any)?.result?.revealAnswer
    );
    // const { t: tSafe } = useTaggedT(); // safe + no throw

// ✅ Translate tagged "@:..." in the whole exercise object once.
    const { raw } = useTaggedT();

    const ex = useMemo(() => {
        return resolveDeepTagged(exercise, (key) => raw(key, "")) as Exercise;
    }, [exercise, raw]);
// ✅ ok should be null on reveal (prevents red/green UI)
    const ok: boolean | null =
        !isRevealResult && typeof (current as any).result?.ok === "boolean"
            ? (current as any).result.ok
            : null;

// ✅ checked for styling only when actually graded/submitted
    const checked = Boolean((current as any).submitted || ok !== null);

// any result exists (including reveal objects)
//     const hasAnyResult = Boolean((current as any).submitted || (current as any).result);

// ok graded only when boolean
//     const ok: boolean | null =
//         typeof (current as any).result?.ok === "boolean" ? (current as any).result.ok : null;

// checked for styling = graded (or submitted)
//     const checked = Boolean((current as any).submitted || ok !== null);

// ✅ server truth for locking
    const finalized = Boolean((current as any)?.result?.finalized);

// out of attempts if server finalized OR finite cap reached
    const outOfAttempts =
        finalized || (maxA !== Number.POSITIVE_INFINITY && attempts >= maxA && ok !== true);

// lock if readOnly/busy/correct/finalized
    const lockInputs = readOnly || busy || ok === true || outOfAttempts;










    function resetCheckPatch() {
        if (readOnly) return {};
        return hasAnyResult ? {submitted: false, result: null} : {};
    }

    // -----------------------------
    // numeric
    // -----------------------------
    if (ex.kind === "numeric") {
        return (
            <NumericExerciseUI
                exercise={ex}
                value={current.num}
                onChange={(num) => updateCurrent({num, ...resetCheckPatch()})}
                disabled={lockInputs}
                checked={checked}
                ok={ok}
            />
        );
    }

    // -----------------------------
    // single_choice
    // -----------------------------
    if (ex.kind === "single_choice") {
        const reviewCorrectId =
            reviewCorrectItem && typeof (reviewCorrectItem as any).single === "string"
                ? String((reviewCorrectItem as any).single)
                : null;

        return (
            <SingleChoiceExerciseUI
                exercise={ex}
                value={current.single}
                onChange={(id) => updateCurrent({single: id, ...resetCheckPatch()})}
                disabled={lockInputs}
                checked={checked}
                ok={ok}
                reviewCorrectId={reviewCorrectId}
                // t={t}
            />
        );
    }

    // -----------------------------
    // multi_choice
    // -----------------------------
    if (ex.kind === "multi_choice") {
        const reviewCorrectIds =
            reviewCorrectItem && Array.isArray((reviewCorrectItem as any).multi)
                ? (reviewCorrectItem as any).multi.map((x: any) => String(x))
                : null;

        return (
            <MultiChoiceExerciseUI
                exercise={ex}
                value={current.multi}
                onChange={(ids) => updateCurrent({multi: ids, ...resetCheckPatch()})}
                disabled={lockInputs}
                checked={checked}
                ok={ok}
                reviewCorrectIds={reviewCorrectIds}
            />
        );
    }

    // -----------------------------
    // text_input ✅
    // -----------------------------
    if (ex.kind === "text_input") {
        const reviewCorrectText =
            reviewCorrectItem && typeof (reviewCorrectItem as any).text === "string"
                ? String((reviewCorrectItem as any).text)
                : null;

        return (
            <TextInputExerciseUI
                exercise={ex as any}
                value={(current as any).text ?? ""}
                onChange={(text) => updateCurrent({text, ...resetCheckPatch()})}
                disabled={lockInputs}
                checked={checked}
                ok={ok}
                reviewCorrectText={reviewCorrectText}
            />
        );
    }

    // -----------------------------
    // drag_reorder ✅
    // -----------------------------
    if (ex.kind === "drag_reorder") {
        const curOrder =
            Array.isArray((current as any).reorder)
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
    }   // -----------------------------
    // voice_input ✅
    // -----------------------------
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
                    updateCurrent({voiceTranscript, ...resetCheckPatch()})
                }
                disabled={lockInputs}
                checked={checked}
                ok={ok}
                reviewCorrectTranscript={reviewCorrectTranscript}
            />
        );
    }

    // -----------------------------
    // matrix_input
    // -----------------------------
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
                        ...(hasAnyResult ? {submitted: false, result: null} : {}),
                    });
                }}
                onChange={(next) =>
                    updateCurrent({
                        mat: next,
                        ...(hasAnyResult ? {submitted: false, result: null} : {}),
                    })
                }
            />
        );
    }

    // -----------------------------
    // vector_drag_target
    // -----------------------------
    if (ex.kind === "vector_drag_target") {
        return (
            <VectorDragTargetExerciseUI
                key={(ex as any).id ?? (exercise as any).key ?? current.key}
                exercise={ex}
                a={current.dragA}
                b={current.dragB}
                onChange={(a, b) => updateCurrent({dragA: a, dragB: b, ...resetCheckPatch()})}
                padRef={padRef}
                disabled={lockInputs}
            />
        );
    }
// -----------------------------
// word_bank_arrange ✅
// -----------------------------
//     if (exercise.kind === "word_bank_arrange") {
//         const reviewCorrectValue =
//             reviewCorrectItem && typeof (reviewCorrectItem as any).text === "string"
//                 ? String((reviewCorrectItem as any).text)
//                 : (exercise as any).targetText ?? null;
//
//         return (
//             <WordBankArrangeExerciseUI
//                 exercise={exercise as any}
//                 value={(current as any).text ?? ""} // ✅ store assembled sentence here
//                 onChangeValue={(text) => updateCurrent({ text, ...resetCheckPatch() })}
//                 disabled={lockInputs}
//                 checked={checked}
//                 ok={ok}
//                 reviewCorrectValue={reviewCorrectValue}
//             />
//         );
//     }

// -----------------------------
// listen_build ✅
// -----------------------------
    if (ex.kind === "listen_build") {
        return (
            <ListenBuildExerciseUI
                exercise={ex as any}
                value={(current as any).text ?? ""} // ✅ store assembled sentence here
                onChangeValue={(text) => updateCurrent({text, ...resetCheckPatch()})}
                disabled={lockInputs}
                checked={checked}
                showTargetWhen={"never"}
                ok={ok}
            />
        );
    }

// -----------------------------
// fill_blank_choice ✅
// -----------------------------
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
                value={(current as any).text ?? ""} // ✅ store selected choice here
                onChangeValue={(text) => updateCurrent({text, single: text, ...resetCheckPatch()})}
                disabled={lockInputs}
                checked={checked}
                ok={ok}
                reviewCorrectValue={reviewCorrectValue}
                // showHint={false}
            />
        );
    }
    // -----------------------------
    // vector_drag_dot
    // -----------------------------
    if (ex.kind === "vector_drag_dot") {
        return (
            <VectorDragDotExerciseUI
                exercise={ex}
                a={current.dragA}
                onChange={(a) => updateCurrent({dragA: a, ...resetCheckPatch()})}
                padRef={padRef}
                disabled={lockInputs}
            />
        );
    }

    // -----------------------------
// code_input ✅ ToolsPanel support
// -----------------------------
// -----------------------------
// code_input ✅ ToolsPanel support
// -----------------------------
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
                    updateCurrent={updateCurrent}
                    showPrompt={showPrompt}
                    feedback={codeFeedback}
                    explanation={codeExplanation}
                />
            );
        }

        const exCode = ex as CodeInputExerciseWithSqlExtras;
        const effectiveSqlRuntime =
            (exCode as any).runtime ??
            (exCode as any).topicRuntimeDefaults ??
            (exCode as any).moduleRuntimeDefaults ??
            null;

        const curLang = ((current as any).codeLang ??
            exCode.language ??
            "python") as RunnerLanguage;

        const curCode = (current as any).code ?? exCode.starterCode ?? "";
        const curStdin = (current as any).codeStdin ?? "";

        return (
            <CodeInputExerciseUI
                exercise={exCode}
                code={curCode}
                stdin={curStdin}
                frame="card"
                language={curLang}
                onChangeCode={(code) => updateCurrent({ code, ...resetCheckPatch() })}
                onChangeStdin={(codeStdin) => updateCurrent({ codeStdin, ...resetCheckPatch() })}
                onChangeLanguage={(codeLang) => updateCurrent({ codeLang, ...resetCheckPatch() })}
                disabled={lockInputs}
                checked={checked}
                ok={ok}
                showPrompt={showPrompt}
                readOnly={readOnly}
                variant="embedded"
                feedback={codeFeedback}
                explanation={codeExplanation}
                sqlDialect={exCode.fixedSqlDialect ?? effectiveSqlRuntime?.fixedSqlDialect}
                sqlDatasetId={exCode.runtime?.datasetId ?? effectiveSqlRuntime?.datasetId}
                sqlSchemaSql={(exCode as any).sqlSchemaSql}
                sqlSeedSql={(exCode as any).sqlSeedSql}
                sqlSetupSql={(exCode as any).sqlSetupSql}
                sqlInitialTableSnapshots={(exCode as any).sqlInitialTableSnapshots}
            />
        );
    }
}



