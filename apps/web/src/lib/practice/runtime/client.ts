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
import {
    normalizeWorkspaceLanguage,
    stateLanguageMatches,
} from "@/components/review/module/runtime/workspaceCodeSource";
import {
    deriveEntryCode,
    resolveExerciseWorkspace,
} from "@/components/review/module/runtime/exerciseWorkspaceResolver";

const PRACTICE_AUTHORED_CONTRACT_FIELDS = [
    "help",
    "prompt",
    "title",
    "hint",
    "starterCode",
    "starterFiles",
    "workspace",
    "files",
    "initialFiles",
    "workspaceFiles",
    "fixtureFiles",
    "fixtures",
    "fileFixtures",
    "workspaceExpectations",
    "recipe",
    "tests",
    "solutionCode",
    "solutionFiles",
    "expected",
    "messageBase",
    "language",
    "lang",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isTaggedPracticeAlias(value: unknown) {
    return typeof value === "string" && value.trim().startsWith("@:");
}

function pickLivePracticeContractValue(args: {
    resolvedValue: unknown;
    currentValue: unknown;
}) {
    const { resolvedValue, currentValue } = args;

    if (currentValue === undefined) {
        return resolvedValue;
    }

    if (
        isTaggedPracticeAlias(currentValue) &&
        resolvedValue !== undefined &&
        !isTaggedPracticeAlias(resolvedValue)
    ) {
        return resolvedValue;
    }

    return currentValue;
}

/**
 * Saved DB/local patches are learner state only.
 * The current /api/practice item is different: it is allowed to carry the live
 * authored contract for dynamic practice exercises, including starter workspace
 * fields that may not exist in a compiled manifest bundle.
 */
export function normalizeCurrentPracticeItem<T extends Partial<QItem>>(
    item: T,
    exercise: Exercise,
    currentSource?: unknown,
): T {
    if (!item) return item;

    const currentSourceRecord = isRecord(currentSource) ? currentSource : {};
    const currentExerciseRecord = isRecord(currentSourceRecord.exercise)
        ? currentSourceRecord.exercise
        : {};
    const exerciseRecord = isRecord(exercise) ? exercise : {};
    const itemRecord = isRecord(item) ? item : {};
    const normalizedExercise: Record<string, unknown> = {
        ...currentExerciseRecord,
        ...exerciseRecord,
    };

    const next: Record<string, unknown> = {
        ...itemRecord,
        exercise: normalizedExercise,
    };

    for (const field of PRACTICE_AUTHORED_CONTRACT_FIELDS) {
        const liveValue = pickLivePracticeContractValue({
            resolvedValue: normalizedExercise[field],
            currentValue: currentSourceRecord[field] ?? currentExerciseRecord[field],
        });

        if (liveValue !== undefined) {
            next[field] = liveValue;
            if (isRecord(next.exercise)) {
                next.exercise[field] = liveValue;
            }
        }
    }

    return hydrateCurrentPracticeRuntimeSnapshot(next as T, next.exercise as Exercise);
}

function isLearnerOwnedPracticeState(value: unknown) {
    if (!isRecord(value)) return false;

    return (
        value.userEdited === true ||
        value.workspaceOrigin === "user" ||
        value.workspaceOrigin === "saved"
    );
}

function hasNonBlankCodeValue(value: unknown) {
    return typeof value === "string" && value.trim().length > 0;
}

function hydrateCurrentPracticeRuntimeSnapshot<T extends Partial<QItem>>(
    item: T,
    exercise: Exercise,
): T {
    if (!item || exercise.kind !== "code_input") return item;
    if (isLearnerOwnedPracticeState(item)) return item;

    const itemAny = item as any;
    const nextLanguage = resolvedExerciseLanguage(exercise) ?? "python";
    const existingWorkspace =
        itemAny.workspace ??
        itemAny.codeWorkspace ??
        itemAny.ideWorkspace ??
        null;
    const existingStateLanguage = normalizeWorkspaceLanguage(
        itemAny.codeLang ??
        itemAny.lang ??
        itemAny.language ??
        nextLanguage,
    );
    const existingCode =
        typeof itemAny.code === "string"
            ? itemAny.code
            : typeof itemAny.source === "string"
                ? itemAny.source
                : "";
    const languageCompatibleExistingWorkspace =
        isWorkspaceStateForPatch(existingWorkspace) &&
        stateLanguageMatches(
            {
                language:
                    itemAny.codeLang ??
                    itemAny.lang ??
                    itemAny.language ??
                    nextLanguage,
            },
            nextLanguage,
            existingWorkspace,
        );

    /**
     * Dynamic /api/practice items may carry starterFiles/workspace only on the
     * live response object. Tool/runtime hydration paths expect an actual
     * workspace snapshot, so synthesize that starter-owned snapshot here before
     * any learner patches are merged or any tool binding occurs.
     */
    const starterWorkspace = resolveExerciseWorkspace({
        language: nextLanguage,
        manifest: exercise,
    });
    const shouldPreferStarterWorkspace =
        !languageCompatibleExistingWorkspace ||
        !workspaceIncludesStarterFilesForPatch({
            existingWorkspace,
            starterWorkspace,
        });
    const nextWorkspace =
        languageCompatibleExistingWorkspace && !shouldPreferStarterWorkspace
            ? existingWorkspace
            : starterWorkspace;
    const canReuseExistingStarterCode =
        hasNonBlankCodeValue(existingCode) &&
        existingStateLanguage === nextLanguage &&
        languageCompatibleExistingWorkspace;
    const nextCode = canReuseExistingStarterCode
        ? existingCode
        : (
            deriveEntryCode(nextWorkspace) ||
            String((exercise as any)?.starterCode ?? "")
        );
    const nextStdin =
        typeof nextWorkspace?.stdin === "string"
            ? nextWorkspace.stdin
            : typeof itemAny.codeStdin === "string"
                ? itemAny.codeStdin
                : typeof itemAny.stdin === "string"
                    ? itemAny.stdin
                    : String((exercise as any)?.starterStdin ?? "");

    return {
        ...itemAny,
        ...(nextWorkspace
            ? {
                workspace: nextWorkspace,
                codeWorkspace: nextWorkspace,
                ideWorkspace: nextWorkspace,
              }
            : {}),
        code: nextCode,
        source: nextCode,
        codeLang: nextLanguage,
        language: nextLanguage,
        lang: nextLanguage,
        codeStdin: nextStdin,
        stdin: nextStdin,
        userEdited: false,
        workspaceOrigin: itemAny.workspaceOrigin ?? "starter",
    } as T;
}

function isWorkspaceStateForPatch(value: unknown) {
    return (
        !!value &&
        typeof value === "object" &&
        (value as any).version === 2 &&
        Array.isArray((value as any).nodes)
    );
}

function workspaceFilePathsForPatch(workspace: unknown) {
    if (!isWorkspaceStateForPatch(workspace)) return new Set<string>();

    const nodes = (
        Array.isArray((workspace as any).nodes) ? (workspace as any).nodes : []
    ) as Array<Record<string, unknown>>;
    const byId = new Map(nodes.map((node) => [String(node.id ?? ""), node] as const));

    const pathForId = (nodeId: string | null | undefined) => {
        if (!nodeId) return "";

        const parts: string[] = [];
        let currentId: string | null = String(nodeId);

        while (currentId) {
            const node = byId.get(currentId);
            if (!node) break;

            const name = String(node.name ?? "");
            if (name) parts.unshift(name);
            currentId = node.parentId == null ? null : String(node.parentId);
        }

        return parts.join("/");
    };

    return new Set(
        nodes
            .filter((node) => node.kind === "file")
            .map((node) => pathForId(String(node.id ?? "")))
            .filter(Boolean),
    );
}

function workspaceIncludesStarterFilesForPatch(args: {
    existingWorkspace: unknown;
    starterWorkspace: unknown;
}) {
    const starterPaths = workspaceFilePathsForPatch(args.starterWorkspace);
    if (starterPaths.size === 0) return true;

    const existingPaths = workspaceFilePathsForPatch(args.existingWorkspace);
    for (const path of starterPaths) {
        if (!existingPaths.has(path)) {
            return false;
        }
    }

    return true;
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

function resolvedExerciseLanguage(exercise: Exercise) {
    if (exercise.kind !== "code_input") return null;

    const exerciseAny = exercise as any;
    const codeExercise = exercise as Extract<Exercise, { kind: "code_input" }>;
    const isSql =
        codeExercise.language === "sql" ||
        Boolean(exerciseAny?.fixedSqlDialect) ||
        Boolean(exerciseAny?.runtime?.datasetId) ||
        typeof exerciseAny?.sqlSchemaSql === "string" ||
        typeof exerciseAny?.sqlSeedSql === "string";

    return isSql
        ? "sql"
        : normalizeWorkspaceLanguage(codeExercise.language ?? "python");
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

function pickMutableSavedPracticePatch<T extends Partial<QItem> | null>(patch: T): T {
    if (!patch) return patch;

    const source = patch as any;
    const next: any = {
        single: source.single,
        multi: source.multi,
        num: source.num,
        dragA: source.dragA,
        dragB: source.dragB,
        matRows: source.matRows,
        matCols: source.matCols,
        mat: source.mat,
        result: source.result,
        submitted: source.submitted,
        attempts: source.attempts,
        code: source.code,
        source: source.source,
        codeLang: source.codeLang,
        language: source.language,
        lang: source.lang,
        codeStdin: source.codeStdin,
        stdin: source.stdin,
        workspace: source.workspace,
        codeWorkspace: source.codeWorkspace,
        ideWorkspace: source.ideWorkspace,
        text: source.text,
        reorder: source.reorder,
        reorderIds: source.reorderIds,
        feedbackDismissed: source.feedbackDismissed,
        voiceTranscript: source.voiceTranscript,
        voiceAudioId: source.voiceAudioId,
        revealed: source.revealed,
        codeRunOutput: source.codeRunOutput,
        userEdited: source.userEdited,
        workspaceOrigin: source.workspaceOrigin,
        starterHash: source.starterHash,
        updatedAt: source.updatedAt,
    };

    for (const key of Object.keys(next)) {
        if (typeof next[key] === "undefined") {
            delete next[key];
        }
    }

    // Extra guard for old persisted QItem-shaped patches.
    delete next.exercise;
    delete next.key;
    delete next.sessionId;
    delete next.title;
    delete next.prompt;
    delete next.hint;
    delete next.options;
    delete next.tokens;
    delete next.expected;
    delete next.starterCode;
    delete next.starterFiles;
    delete next.workspaceExpectations;
    delete next.recipe;
    delete next.help;
    delete next.tests;
    delete next.solutionCode;
    delete next.solutionFiles;
    delete next.messageBase;

    return next as T;
}

function sanitizeSavedPatchForResolvedExercise<T extends Partial<QItem> | null>(
    patch: T,
    exercise: Exercise,
): T {
    if (!patch) return patch;

    const mutablePatch = pickMutableSavedPracticePatch(patch);

    if (exercise.kind !== "code_input") return mutablePatch;

    const starterCode = getExerciseStarterCode(exercise);
    const expectedLanguage = resolvedExerciseLanguage(exercise);

    const patchAny = mutablePatch as any;

    const userEdited =
        patchAny.userEdited === true ||
        patchAny.workspaceOrigin === "user" ||
        patchAny.workspaceOrigin === "saved";

    /**
     * Important:
     * If this code exercise has starterCode, a passive auto/sync patch must not
     * overwrite the starter, even when the patch contains nonblank code.
     *
     * The failing SQL review tests hit this exact case: an old/sync query.sql
     * snapshot such as "1" can arrive as savedPatch and replace the freshly
     * resolved SQL starter before the editor renders.
     *
     * Real learner edits are still preserved.
     */
    if (expectedLanguage && !stateLanguageMatches(patchAny, expectedLanguage, patchAny.workspace)) {
        const next = { ...patchAny };

        delete next.code;
        delete next.source;
        delete next.workspace;
        delete next.codeWorkspace;
        delete next.ideWorkspace;
        delete next.codeStdin;
        delete next.stdin;
        delete next.language;
        delete next.lang;
        delete next.codeLang;

        return next as T;
    }

    if (userEdited) return mutablePatch;
    if (!starterCode) return patch;

    const next = { ...patchAny };

    delete next.code;
    delete next.source;
    delete next.workspace;
    delete next.codeWorkspace;
    delete next.ideWorkspace;
    delete next.codeStdin;
    delete next.stdin;
    delete next.language;
    delete next.lang;
    delete next.codeLang;

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

    let item = normalizeCurrentPracticeItem(
        initItemFromExercise(resolvedExercise, key, {
            resolveText: resolvers.resolveText,
        }),
        resolvedExercise,
        response as Record<string, unknown>,
    );

    if (transformItem) {
        item = normalizeCurrentPracticeItem(
            transformItem(item, resolvedExercise),
            resolvedExercise,
            response as Record<string, unknown>,
        );
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
        const safePatch = { ...(resolvedPatch as any) };

        /**
         * Practice keys are ephemeral signed tokens from the current /api/practice
         * response. Saved/runtime patches must never replace them.
         */
        delete safePatch.key;
        delete safePatch.sessionId;

        item = {
            ...item,
            ...safePatch,
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
