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
