import { useLayoutEffect, useRef } from "react";
import { useReviewRuntimeStore } from "@zoeskoul/learning-runtime/review/module/runtime/reviewRuntimeStore";
import { resolveMountedEditorOwner, type MountedEditorOwner } from "@zoeskoul/learning-runtime/review/mountedEditorOwner";

export function useMountedReviewEditorScope(requestedScopeKey: string) {
    const resetRevision = useReviewRuntimeStore(s => s.resetRevision);
    const editors = useReviewRuntimeStore(s => s.editorRuntimes);
    const previous = useRef<MountedEditorOwner>({
        resetRevision,
        scopeKey: requestedScopeKey,
        resetOwnerKey: null,
    });
    const next = resolveMountedEditorOwner({
        previous: previous.current,
        requestedScopeKey,
        resetRevision,
        editors,
    });
    useLayoutEffect(() => { previous.current = next; });
    return next.scopeKey;
}
