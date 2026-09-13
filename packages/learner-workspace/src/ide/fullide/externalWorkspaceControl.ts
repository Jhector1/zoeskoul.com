export function resolveExternalWorkspaceApplyKey(args: {
    externalWorkspaceKey: string;
    initialWorkspaceKey: string;
    revision?: string | number;
}) {
    if (args.revision !== undefined) {
        return `revision:${String(args.revision)}`;
    }

    return `${args.externalWorkspaceKey}::initial:${args.initialWorkspaceKey}`;
}

export function shouldHydrateWorkspaceSnapshot(args: {
    currentKey: string;
    nextKey: string;
    lastHydratedKey: string;
    authoritative: boolean;
}) {
    return args.currentKey !== args.nextKey &&
        (args.authoritative || args.lastHydratedKey !== args.nextKey);
}

export function resolveReadyWorkspaceReplacementRevision(args: {
    revision: string | number | undefined;
    requestedWorkspaceKey: string;
    committedWorkspaceKey: string;
}) {
    return args.requestedWorkspaceKey === args.committedWorkspaceKey
        ? args.revision
        : undefined;
}
