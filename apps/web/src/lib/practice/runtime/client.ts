import type { MutableRefObject } from "react";
import type { Exercise } from "@/lib/practice/types";
import type { QItem, PracticeHelpEntry } from "@/lib/practice/uiTypes";
import type { VectorPadState } from "@/components/vectorpad/types";
import {
    fetchPracticeExercise,
    fetchPracticeHelp,
    submitPracticeAnswer,
    type PracticeGetResponse,
    type PracticeHelpClientResponse,
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
import {
    DEFAULT_PRACTICE_HELP_POLICY,
    normalizePracticeHelpPolicy,
} from "@/lib/practice/help/steps";

function isWorkspaceStateForPatch(value: unknown) {
    return (
        !!value &&
        typeof value === "object" &&
        (value as any).version === 2 &&
        Array.isArray((value as any).nodes)
    );
}

function getWorkspaceEntryCodeForPatch(workspace: any) {
    if (!isWorkspaceStateForPatch(workspace)) return null;

    const entryId = workspace.entryFileId || workspace.activeFileId;
    const file = workspace.nodes.find(
        (node: any) => node?.kind === "file" && node.id === entryId,
    );

    return file?.kind === "file" ? String(file.content ?? "") : null;
}

function normalizeCodePatchFromWorkspace<T extends Partial<QItem> | null>(patch: T): T {
    if (!patch) return patch;

    const workspace =
        (patch as any).workspace ??
        (patch as any).codeWorkspace ??
        (patch as any).ideWorkspace ??
        null;

    const workspaceCode = getWorkspaceEntryCodeForPatch(workspace);
    if (workspaceCode == null) return patch;

    const workspaceStdin =
        typeof workspace?.stdin === "string" ? workspace.stdin : undefined;

    const workspaceLanguage =
        typeof workspace?.language === "string" ? workspace.language : undefined;

    return {
        ...(patch as any),
        code: workspaceCode,
        source: workspaceCode,
        ...(workspaceStdin !== undefined
            ? {
                stdin: workspaceStdin,
                codeStdin: workspaceStdin,
              }
            : {}),
        ...(workspaceLanguage
            ? {
                language: workspaceLanguage,
                codeLang: workspaceLanguage,
              }
            : {}),
    } as T;
}
function getExerciseStarterCode(exercise: Exercise) {
    return String((exercise as any)?.starterCode ?? "").trim();
}

function isBlankWorkspacePatch(value: unknown) {
    if (
        !value ||
        typeof value !== "object" ||
        (value as any).version !== 2 ||
        !Array.isArray((value as any).nodes)
    ) {
        return true;
    }

    const entryId = (value as any).entryFileId || (value as any).activeFileId;
    const file =
        (value as any).nodes.find(
            (node: any) => node?.kind === "file" && node.id === entryId,
        ) ??
        (value as any).nodes.find((node: any) => node?.kind === "file");

    const content = file?.kind === "file" ? String(file.content ?? "") : "";

    return !content.trim();
}

function sanitizeSavedPatchForResolvedExercise<T extends Partial<QItem> | null>(
    patch: T,
    exercise: Exercise,
): T {
    if (!patch) return patch;
    if (exercise.kind !== "code_input") return patch;

    const starterCode = getExerciseStarterCode(exercise);
    if (!starterCode) return patch;

    const patchAny = patch as any;

    const userEdited =
        patchAny.userEdited === true ||
        patchAny.workspaceOrigin === "user" ||
        patchAny.workspaceOrigin === "saved";

    /**
     * Important:
     * If this code exercise has starterCode, a blank auto/sync patch must not
     * overwrite the starter. This happens when an old saved/runtime patch contains
     * code: "" or an empty workspace before starterCode was added.
     *
     * Real user edits are still preserved.
     */
    if (userEdited) return patch;

    const next = { ...patchAny };

    if (typeof next.code === "string" && !next.code.trim()) {
        delete next.code;
    }

    if (typeof next.source === "string" && !next.source.trim()) {
        delete next.source;
    }

    if (isBlankWorkspacePatch(next.workspace)) {
        delete next.workspace;
    }

    if (isBlankWorkspacePatch(next.codeWorkspace)) {
        delete next.codeWorkspace;
    }

    if (isBlankWorkspacePatch(next.ideWorkspace)) {
        delete next.ideWorkspace;
    }

    return next as T;
}
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

    const resolvedPatch = sanitizeSavedPatchForResolvedExercise(
        normalizeCodePatchFromWorkspace(
            savedPatch
                ? (resolveDeepTagged(savedPatch, resolvers.raw) as Partial<QItem>)
                : null,
        ),
        resolvedExercise,
    );

    if (resolvedPatch) {
        item = {
            ...item,
            ...resolvedPatch,
            help: {
                ...item.help,
                ...(resolvedPatch.help ?? {}),
                entries: {
                    ...item.help.entries,
                    ...(resolvedPatch.help?.entries ?? {}),
                },
            },
        };
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
        helpPolicy: normalizePracticeHelpPolicy(
            (response as any)?.run?.help ?? null,
            Boolean((response as any)?.run?.allowReveal ?? true),
        ),
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

export async function requestPracticeHelpItem(args: {
    item: QItem;
    exercise: Exercise;
    stepKey: string;
    padRef?: MutableRefObject<VectorPadState>;
}) {
    const { item, exercise, stepKey } = args;

    const userAnswer =
        exercise.kind === "vector_drag_dot"
            ? { kind: "vector_drag_dot", a: cloneVec(args.padRef?.current?.a ?? item.dragA) }
            : exercise.kind === "vector_drag_target"
                ? {
                    kind: "vector_drag_target",
                    a: cloneVec(args.padRef?.current?.a ?? item.dragA),
                    b: cloneVec(args.padRef?.current?.b ?? item.dragB),
                }
                : buildSubmitAnswerFromItem(item) ?? null;

    const data: PracticeHelpClientResponse = await fetchPracticeHelp({
        key: item.key,
        stepKey,
        userAnswer,
    });

    const reveal = data.reveal ?? null;

    const entry: PracticeHelpEntry = {
        key: stepKey,
        label: data.step?.label ?? stepKey,
        kind: data.step?.kind ?? undefined,
        content: data.content ?? null,
        reveal,
        source: data.source ?? null,
        openedAt: Date.now(),
    };

    const dragA =
        reveal?.solutionA ??
        reveal?.targetA ??
        null;

    const dragB =
        reveal?.b ??
        null;

    return {
        data,
        entry,
        dragA: dragA ? cloneVec(dragA) : null,
        dragB: dragB ? cloneVec(dragB) : null,
    };
}

// export { coerceMaxAttempts } from "./helpers";
// export * from "./session";
// export * from "./types";