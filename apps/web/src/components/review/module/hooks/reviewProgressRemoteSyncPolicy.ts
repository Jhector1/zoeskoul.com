import { shouldPersistWorkspaceMutation } from "@/lib/review/workspacePersistenceContract";

export function shouldTrackReviewRuntimeMutation(args: {
    readOnly: boolean;
    applyingRemote: boolean;
}) {
    return shouldPersistWorkspaceMutation({
        readOnly: args.readOnly,
        hydrated: true,
        applyingRemote: args.applyingRemote,
        hasAuthoritativeContent: true,
        wouldReplaceNonEmptyWithEmpty: false,
    });
}

export function canPollReviewRemoteProgress(args: {
    readOnly: boolean;
    localDirty: boolean;
    remoteSyncInFlight: boolean;
    saveInFlight: boolean;
    hasPendingSave: boolean;
}) {
    if (args.remoteSyncInFlight || args.saveInFlight) return false;

    // A read-only workspace cannot own local edits. Runtime churn caused by
    // mounting Monaco, rebinding Tools, or hydrating a remote workspace must
    // never prevent it from receiving the tutor's next saved snapshot.
    if (args.readOnly) return true;

    return !args.localDirty && !args.hasPendingSave;
}

export function shouldApplyRemoteReviewWorkspace(args: {
    readOnly: boolean;
    reason: string;
    looksLikeBetterCandidate: boolean;
}) {
    const isRemoteRefresh =
        args.reason !== "initial" && args.reason !== "runtime-contract-ready";

    // In a read-only master/reference/learner view, the server-owned snapshot is
    // authoritative even when the tutor's newest code is shorter than the old
    // code. Editable learner work still keeps the conservative restore guard.
    return (args.readOnly && isRemoteRefresh) || args.looksLikeBetterCandidate;
}
