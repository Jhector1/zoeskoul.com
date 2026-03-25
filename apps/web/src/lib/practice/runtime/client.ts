import type { MutableRefObject } from "react";
import type { Exercise } from "@/lib/practice/types";
import type { QItem } from "@/lib/practice/uiTypes";
import type { VectorPadState } from "@/components/vectorpad/types";
import {
    fetchPracticeExercise,
    submitPracticeAnswer,
    type PracticeGetResponse,
    type PracticeValidateClientResponse,
} from "@/lib/practice/clientApi";
import {
    buildSubmitAnswerFromItem,
    cloneVec,
    initItemFromExercise,
} from "@/lib/practice/uiHelpers";
import { resolveDeepTagged } from "@/i18n/resolveDeepTagged";
import { coerceMaxAttempts } from "./helpers";
import type { PracticeRuntimeTextResolvers } from "./types";

export async function fetchResolvedPracticeItem(args: {
    request: Record<string, any>;
    signal?: AbortSignal;
    resolvers: PracticeRuntimeTextResolvers;
    savedPatch?: Partial<QItem> | null;
    transformItem?: (item: QItem, exercise: Exercise) => QItem;
}) {
    const { request, signal, resolvers, savedPatch, transformItem } = args;

    const response: PracticeGetResponse = await fetchPracticeExercise({
        ...(request as any),
        signal,
    });

    const ex = (response as any)?.exercise;
    const key = (response as any)?.key;

    if (!ex || typeof ex?.kind !== "string" || typeof key !== "string") {
        throw new Error("Malformed response from /api/practice (missing exercise/key).");
    }

    const resolvedExercise = resolveDeepTagged(
        ex as Exercise,
        resolvers.raw,
    ) as Exercise;

    let item = initItemFromExercise(resolvedExercise, key, {
        resolveText: resolvers.resolveText,
    });

    if (transformItem) {
        item = transformItem(item, resolvedExercise);
    }

    const resolvedPatch = savedPatch
        ? (resolveDeepTagged(savedPatch, resolvers.raw) as Partial<QItem>)
        : null;

    if (resolvedPatch) {
        item = { ...item, ...resolvedPatch };
    }

    return {
        response,
        exercise: resolvedExercise,
        item,
        key,
        sessionId:
            (response as any)?.sessionId != null
                ? String((response as any).sessionId)
                : null,
        run: (response as any)?.run ?? null,
        maxAttempts: coerceMaxAttempts((response as any)?.run?.maxAttempts),
    };
}

export function buildPracticeAnswer(args: {
    item: QItem;
    exercise: Exercise;
    padRef?: MutableRefObject<VectorPadState>;
}) {
    const { item, exercise, padRef } = args;

    let answer: any;
    let statePatch: Partial<QItem> | null = null;

    if (exercise.kind === "vector_drag_dot") {
        const a = cloneVec(padRef?.current?.a ?? (item as any).dragA);
        answer = { kind: "vector_drag_dot", a };
        statePatch = { dragA: a } as any;
    } else if (exercise.kind === "vector_drag_target") {
        const a = cloneVec(padRef?.current?.a ?? (item as any).dragA);
        const b = cloneVec(padRef?.current?.b ?? (item as any).dragB);
        answer = { kind: "vector_drag_target", a, b };
        statePatch = { dragA: a, dragB: b } as any;
    } else {
        answer = buildSubmitAnswerFromItem(item);
    }

    return { answer, statePatch };
}

export async function submitPracticeItem(args: {
    item: QItem;
    exercise: Exercise;
    padRef?: MutableRefObject<VectorPadState>;
    maxAttempts?: number | null;
    isLockedRun?: boolean;
}) {
    const { item, exercise, padRef, maxAttempts = null, isLockedRun = false } = args;

    const { answer, statePatch } = buildPracticeAnswer({
        item,
        exercise,
        padRef,
    });

    if (!answer) {
        throw new Error("Incomplete answer.");
    }

    const data: PracticeValidateClientResponse = await submitPracticeAnswer({
        key: item.key,
        answer,
    });

    const ok = Boolean((data as any)?.ok);
    const serverFinalized = Boolean((data as any)?.finalized);
    const serverUsed = Number((data as any)?.attempts?.used);

    const used = Number.isFinite(serverUsed)
        ? serverUsed
        : (item.attempts ?? 0) + 1;

    const finalized =
        ok ||
        serverFinalized ||
        Boolean(isLockedRun && maxAttempts != null && used >= maxAttempts);

    return {
        data,
        ok,
        used,
        finalized,
        serverFinalized,
        serverMaxAttempts: coerceMaxAttempts((data as any)?.attempts?.max),
        statePatch,
    };
}

export async function revealPracticeItem(item: QItem) {
    const data: PracticeValidateClientResponse = await submitPracticeAnswer({
        key: item.key,
        reveal: true,
    });

    const dragA =
        (data as any)?.revealAnswer?.solutionA ??
        (data as any)?.reveal?.solutionA ??
        (data as any)?.expected?.solutionA ??
        null;

    const dragB =
        (data as any)?.revealAnswer?.b ??
        (data as any)?.reveal?.b ??
        (data as any)?.expected?.b ??
        null;

    return {
        data,
        dragA: dragA ? cloneVec(dragA) : null,
        dragB: dragB ? cloneVec(dragB) : null,
    };
}