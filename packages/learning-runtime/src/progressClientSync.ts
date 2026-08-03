import type {
  ReviewProgressState,
  ReviewTopicProgress,
} from "./index";
import {
  normalizeTopicProgressKey,
} from "./progressNormalization";

function createClientSyncEmptyReviewProgress():
  ReviewProgressState {
  return {
    topics: {},
    quizVersion: 0,
    moduleCompleted: false,
    moduleCompletedAt: undefined,
  };
}

export function isReviewUserSavedState(value: any) {
    return (
        value?.userEdited === true ||
        value?.workspaceOrigin === "user" ||
        value?.workspaceOrigin === "saved"
    );
}

export function reviewSavedStateUpdatedAt(value: any) {
    const n = Number(value?.updatedAt ?? 0);
    return Number.isFinite(n) ? n : 0;
}

function numericVersion(value: unknown) {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
}

function isEmptyRecord(value: unknown) {
    return (
        !value ||
        (typeof value === "object" &&
            !Array.isArray(value) &&
            Object.keys(value as Record<string, unknown>).length === 0)
    );
}

function isAuthoritativeModuleReset(args: {
    remote: ReviewProgressState;
    local: ReviewProgressState;
}) {
    return (
        numericVersion((args.local as any).quizVersion) >
        numericVersion((args.remote as any).quizVersion) &&
        (args.local as any).moduleCompleted === false &&
        !(args.local as any).moduleCompletedAt &&
        isEmptyRecord((args.local as any).topics)
    );
}

function isAuthoritativeTopicReset(args: {
    remoteTopic: ReviewTopicProgress | undefined;
    localTopic: ReviewTopicProgress;
}) {
    const localVersion = numericVersion((args.localTopic as any).quizVersion);
    const remoteVersion = numericVersion((args.remoteTopic as any)?.quizVersion);

    return (
        localVersion > remoteVersion &&
        (args.localTopic as any).completed === false &&
        !(args.localTopic as any).completedAt
    );
}

function savedWorkspaceSummary(value: any) {
    const workspace =
        value?.workspace ?? value?.codeWorkspace ?? value?.ideWorkspace ?? value?.toolWorkspace ?? null;
    if (!workspace || workspace.version !== 2 || !Array.isArray(workspace.nodes)) {
        return { hasWorkspace: false, fileCount: 0 };
    }

    return {
        hasWorkspace: true,
        fileCount: workspace.nodes.filter((node: any) => node?.kind === "file").length,
    };
}

function chooseSavedValue<T = any>(existing: T | undefined, incoming: T | undefined): T | undefined {
    const a: any = existing;
    const b: any = incoming;

    if (a == null) return incoming;
    if (b == null) return existing;

    const aIsUser = isReviewUserSavedState(a);
    const bIsUser = isReviewUserSavedState(b);

    if (bIsUser && !aIsUser) return incoming;
    if (aIsUser && !bIsUser) return existing;

    const aUpdatedAt = reviewSavedStateUpdatedAt(a);
    const bUpdatedAt = reviewSavedStateUpdatedAt(b);

    // Canonical conflict rule: the freshest persisted record wins. File-count
    // heuristics are only a tie-breaker, never a reason for an older local copy
    // to hide a newer DB version on another computer.
    if (bUpdatedAt > aUpdatedAt) return incoming;
    if (aUpdatedAt > bUpdatedAt) return existing;

    const aWorkspace = savedWorkspaceSummary(a);
    const bWorkspace = savedWorkspaceSummary(b);

    if (aWorkspace.hasWorkspace !== bWorkspace.hasWorkspace) {
        return bWorkspace.hasWorkspace ? incoming : existing;
    }

    if (aWorkspace.fileCount !== bWorkspace.fileCount) {
        return bWorkspace.fileCount > aWorkspace.fileCount ? incoming : existing;
    }

    return incoming;
}

function mergeRecordMap<T = any>(
    existing: Record<string, T> | undefined,
    incoming: Record<string, T> | undefined,
): Record<string, T> | undefined {
    if (!existing && !incoming) return undefined;

    const out: Record<string, T> = {
        ...(existing ?? {}),
    };

    for (const [key, value] of Object.entries(incoming ?? {})) {
        out[key] = chooseSavedValue(out[key], value as T) as T;
    }

    return out;
}

function mergeTopicProgressStates(
    existing: ReviewTopicProgress | undefined,
    incoming: ReviewTopicProgress | undefined,
): ReviewTopicProgress {
    const a: any = existing ?? {};
    const b: any = incoming ?? {};

    const existingVersion = numericVersion(a.quizVersion);
    const incomingVersion = numericVersion(b.quizVersion);

    const incomingIsAuthoritativeReset =
        incomingVersion > existingVersion &&
        b.completed === false &&
        !b.completedAt;

    if (incomingIsAuthoritativeReset) {
        const runtimeB = b.runtimeStateV2 ?? {};

        return {
            ...a,
            ...b,

            quizVersion: incomingVersion,

            cardsDone: { ...(b.cardsDone ?? {}) },
            readingDone: { ...(b.readingDone ?? {}) },
            quizzesDone: { ...(b.quizzesDone ?? {}) },
            quizState: { ...(b.quizState ?? {}) },

            sketchState: { ...(b.sketchState ?? {}) },
            toolState: { ...(b.toolState ?? {}) },

            runtimeStateV2: {
                ...runtimeB,
                cards: { ...(runtimeB.cards ?? {}) },
                exercises: { ...(runtimeB.exercises ?? {}) },
            },

            completed: false,
            completedAt: undefined,
        } as ReviewTopicProgress;
    }

    const runtimeA = a.runtimeStateV2 ?? {};
    const runtimeB = b.runtimeStateV2 ?? {};

    return {
        ...a,
        ...b,

        quizVersion: Math.max(existingVersion, incomingVersion) || undefined,

        cardsDone: {
            ...(a.cardsDone ?? {}),
            ...(b.cardsDone ?? {}),
        },

        readingDone: {
            ...(a.readingDone ?? {}),
            ...(b.readingDone ?? {}),
        },

        quizzesDone: {
            ...(a.quizzesDone ?? {}),
            ...(b.quizzesDone ?? {}),
        },

        quizState: mergeRecordMap(a.quizState, b.quizState) ?? {},

        sketchState: mergeRecordMap(a.sketchState, b.sketchState) ?? {},

        toolState: mergeRecordMap(a.toolState, b.toolState) ?? {},

        runtimeStateV2: {
            ...runtimeA,
            ...runtimeB,
            cards: mergeRecordMap(runtimeA.cards, runtimeB.cards) ?? {},
            exercises: mergeRecordMap(runtimeA.exercises, runtimeB.exercises) ?? {},
        },
    };
}

export function normalizeReviewProgressForClientSync(state: ReviewProgressState | null | undefined): ReviewProgressState {
    const base = state ?? createClientSyncEmptyReviewProgress();
    const topics = (base as any).topics ?? {};
    const nextTopics: Record<string, ReviewTopicProgress> = {};

    for (const [key, topicState] of Object.entries(topics)) {
        const canonical = normalizeTopicProgressKey(key);
        nextTopics[canonical] = mergeTopicProgressStates(
            nextTopics[canonical],
            topicState as ReviewTopicProgress,
        );
    }

    const activeTopicId = normalizeTopicProgressKey((base as any).activeTopicId);

    return {
        ...base,
        activeTopicId: activeTopicId === "unknown" ? base.activeTopicId : activeTopicId,
        topics: nextTopics,
    };
}

export function getReviewProgressClientSaveRevision(state: any) {
    const n = Number(state?.__saveRevision ?? 0);
    return Number.isFinite(n) ? n : 0;
}

export function mergeReviewProgressForConflictRetry(
    remoteState: ReviewProgressState | null | undefined,
    localState: ReviewProgressState | null | undefined,
): ReviewProgressState {
    const remote = normalizeReviewProgressForClientSync(remoteState ?? createClientSyncEmptyReviewProgress());
    const local = normalizeReviewProgressForClientSync(localState ?? createClientSyncEmptyReviewProgress());

    /**
     * Reset Module is authoritative.
     * Do not merge remote completed topics back into local topics: {}.
     */
    if (isAuthoritativeModuleReset({ remote, local })) {
        return {
            ...local,
            quizVersion: Math.max(
                numericVersion((remote as any).quizVersion),
                numericVersion((local as any).quizVersion),
            ),
            moduleCompleted: false,
            moduleCompletedAt: undefined,
            topics: {},
            activeTopicId: normalizeTopicProgressKey(
                (local as any).activeTopicId ?? (remote as any).activeTopicId,
            ),
            __saveRevision: Math.max(
                getReviewProgressClientSaveRevision(remote),
                getReviewProgressClientSaveRevision(local),
                Date.now(),
            ),
        } as ReviewProgressState;
    }

    const nextTopics: Record<string, ReviewTopicProgress> = {
        ...(remote.topics ?? {}),
    };

    let hasAuthoritativeTopicReset = false;

    const localTopicEntries = Object.entries(
        local.topics ?? {},
    ) as Array<[string, ReviewTopicProgress]>;

    for (const [topicKey, localTopic] of localTopicEntries) {
        const canonicalTopicKey = normalizeTopicProgressKey(topicKey);
        const remoteTopic = nextTopics[canonicalTopicKey];

        if (
            isAuthoritativeTopicReset({
                remoteTopic,
                localTopic,
            })
        ) {
            hasAuthoritativeTopicReset = true;
            nextTopics[canonicalTopicKey] = localTopic;
            continue;
        }

        nextTopics[canonicalTopicKey] = mergeTopicProgressStates(
            remoteTopic,
            localTopic,
        );
    }

    const localExplicitlyClearsModule =
        (local as any).moduleCompleted === false &&
        !(local as any).moduleCompletedAt;

    const moduleCompleted =
        hasAuthoritativeTopicReset || localExplicitlyClearsModule
            ? false
            : Boolean(
                (remote as any).moduleCompleted || (local as any).moduleCompleted,
            );

    const moduleCompletedAt =
        hasAuthoritativeTopicReset || localExplicitlyClearsModule
            ? undefined
            : pickLatestIsoLike(
                (remote as any).moduleCompletedAt,
                (local as any).moduleCompletedAt,
            );

    return {
        ...remote,
        ...local,
        quizVersion: Math.max(
            numericVersion((remote as any).quizVersion),
            numericVersion((local as any).quizVersion),
        ),
        moduleCompleted,
        moduleCompletedAt,
        activeTopicId: normalizeTopicProgressKey(
            (local as any).activeTopicId ?? (remote as any).activeTopicId,
        ),
        topics: nextTopics,
        __saveRevision: Math.max(
            getReviewProgressClientSaveRevision(remote),
            getReviewProgressClientSaveRevision(local),
            Date.now(),
        ),
    } as ReviewProgressState;
}

function timeMsLike(value: unknown) {
    const n = Number(new Date(String(value ?? "")));
    return Number.isFinite(n) ? n : 0;
}

function pickLatestIsoLike(a: unknown, b: unknown) {
    const aMs = timeMsLike(a);
    const bMs = timeMsLike(b);
    if (!aMs && !bMs) return undefined;
    return bMs >= aMs ? (b as string | undefined) : (a as string | undefined);
}

export function withoutReviewProgressSaveRevision(value: any): any {
    if (Array.isArray(value)) {
        return value.map((item) => withoutReviewProgressSaveRevision(item));
    }

    if (value && typeof value === "object") {
        const out: Record<string, any> = {};
        for (const [key, item] of Object.entries(value)) {
            if (key === "__saveRevision") continue;
            out[key] = withoutReviewProgressSaveRevision(item);
        }
        return out;
    }

    return value;
}
