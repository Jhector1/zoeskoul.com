"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { WorkspaceStateV2 } from "@/components/ide/types";
import type { WorkspaceLanguage } from "@/lib/practice/types";
import { stableJson } from "@/lib/client/persistence/stableJson";

function snapshotOfWorkspace(ws: WorkspaceStateV2 | null | undefined) {
    if (!ws) return "null";

    return stableJson({
        version: ws.version,
        language: ws.language,
        nodes: ws.nodes,
        entryFileId: ws.entryFileId,
        stdin: ws.stdin,
    });
}

export function useProjectDirtyState(
    currentWorkspace: WorkspaceStateV2 | null,
    language: WorkspaceLanguage,
) {
    const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
    const [baselineLanguage, setBaselineLanguage] = useState<WorkspaceLanguage>(language);

    const currentSnapshot = useMemo(
        () => snapshotOfWorkspace(currentWorkspace),
        [currentWorkspace],
    );

    useEffect(() => {
        if (baselineLanguage !== language) {
            setSavedSnapshot(null);
            setBaselineLanguage(language);
        }
    }, [language, baselineLanguage]);

    const isDirty = useMemo(() => {
        if (!currentWorkspace) return false;
        if (savedSnapshot == null) return true;
        return currentSnapshot !== savedSnapshot;
    }, [currentWorkspace, currentSnapshot, savedSnapshot]);

    const markSaved = useCallback(
        (ws?: WorkspaceStateV2 | null) => {
            setSavedSnapshot(snapshotOfWorkspace(ws ?? currentWorkspace));
            setBaselineLanguage(language);
        },
        [currentWorkspace, language],
    );

    const markLoaded = useCallback(
        (ws: WorkspaceStateV2 | null) => {
            setSavedSnapshot(snapshotOfWorkspace(ws));
            setBaselineLanguage(language);
        },
        [language],
    );

    const clearSavedBaseline = useCallback(() => {
        setSavedSnapshot(null);
        setBaselineLanguage(language);
    }, [language]);

    return {
        isDirty,
        markSaved,
        markLoaded,
        clearSavedBaseline,
    };
}
