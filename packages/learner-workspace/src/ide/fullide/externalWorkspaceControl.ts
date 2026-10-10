export function workspaceControlledContentKey(workspace: unknown) {
    if (!workspace || typeof workspace !== "object" || Array.isArray(workspace)) {
        return "null";
    }

    const record = workspace as Record<string, unknown>;
    if (record.version !== 2 || !Array.isArray(record.nodes)) {
        return "null";
    }

    return JSON.stringify({
        version: 2,
        language: record.language,
        entryFileId: record.entryFileId,
        stdin: typeof record.stdin === "string" ? record.stdin : "",
        nodes: record.nodes.map((node) => {
            if (!node || typeof node !== "object" || Array.isArray(node)) {
                return node;
            }

            const item = node as Record<string, unknown>;
            if (item.kind === "file") {
                const binary =
                    item.binary && typeof item.binary === "object" && !Array.isArray(item.binary)
                        ? item.binary as Record<string, unknown>
                        : null;

                return {
                    id: item.id,
                    kind: item.kind,
                    name: item.name,
                    parentId: item.parentId ?? null,
                    content: binary ? "" : item.content ?? "",
                    binary: binary
                        ? {
                              encoding: binary.encoding,
                              data: binary.data,
                              mimeType: binary.mimeType,
                              sizeBytes: binary.sizeBytes,
                              checksum: binary.checksum ?? null,
                          }
                        : null,
                };
            }

            return {
                id: item.id,
                kind: item.kind,
                name: item.name,
                parentId: item.parentId ?? null,
            };
        }),
    });
}

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
