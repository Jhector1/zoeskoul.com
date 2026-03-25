"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { WorkspaceStateV2 } from "@/components/ide/types";
import type { CodeLanguage } from "@/lib/practice/types";

function snapshotOfWorkspace(ws: WorkspaceStateV2 | null | undefined) {
    return JSON.stringify(ws ?? null);
}

export function useProjectDirtyState(
    currentWorkspace: WorkspaceStateV2 | null,
    language: CodeLanguage,
) {
    const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
    const [baselineLanguage, setBaselineLanguage] = useState<CodeLanguage>(language);

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