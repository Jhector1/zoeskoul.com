import type { EditorRuntimeState } from "./module/runtime/reviewRuntimeTypes";

export type MountedEditorOwner = {
    resetRevision: number;
    scopeKey: string;
    resetOwnerKey: string | null;
};

/** Keep an explicit reset addressed to the mounted exercise across unbinding. */
export function resolveMountedEditorOwner(args: {
    previous: MountedEditorOwner;
    requestedScopeKey: string;
    resetRevision: number;
    editors: Record<string, EditorRuntimeState>;
}): MountedEditorOwner {
    const { previous, requestedScopeKey, resetRevision, editors } = args;
    const previousKey = previous.scopeKey.replace(/^card:/, "");
    const previousEditor = editors[previousKey];
    const resetOwnerKey = previous.resetRevision !== resetRevision
        ? previousEditor?.ownerKind === "exercise" &&
          previousEditor.workspaceGeneration === resetRevision &&
          (previousEditor.workspaceApplyRevision ?? 0) > 0
            ? previousKey
            : null
        : previous.resetOwnerKey;
    const requestedKey = requestedScopeKey.replace(/^card:/, "");
    const requestedEditor = editors[requestedKey];
    const resetEditor = resetOwnerKey ? editors[resetOwnerKey] : null;
    const sameTopic = resetOwnerKey?.split(":").slice(0, 4).join(":") ===
        requestedKey.split(":").slice(0, 4).join(":");
    const readingWithoutWorkspace = requestedScopeKey.startsWith("card:") &&
        (!requestedEditor || (requestedEditor.ownerKind === "card" &&
        requestedEditor.workspaceOrigin === "empty"));
    const keepResetOwner = Boolean(resetEditor && sameTopic && readingWithoutWorkspace);

    return {
        resetRevision,
        scopeKey: keepResetOwner ? resetOwnerKey! : requestedScopeKey,
        resetOwnerKey: keepResetOwner || requestedKey === resetOwnerKey
            ? resetOwnerKey
            : requestedEditor ? null : resetOwnerKey,
    };
}
