export function controlledWorkspaceResetBoundary(
    exerciseStateKey: string | null | undefined,
): string {
    const normalized = String(exerciseStateKey ?? "").trim();
    const match = /:reset:(\d+)$/.exec(normalized);
    return match ? `reset:${match[1]}` : "reset:none";
}

export function buildFullIdeSessionRemountKey(args: {
    actorKey: string;
    runtimeLanguage: string | null | undefined;
    initialProjectId?: string | null;
    scopeKey?: string | null;
    exerciseStateKey?: string | null;
    controlledWorkspace: boolean;
}) {
    const actorKey = String(args.actorKey ?? "").trim() || "guest";
    const runtimeLanguage =
        String(args.runtimeLanguage ?? "unknown").trim().toLowerCase() ||
        "unknown";
    const initialProjectId =
        String(args.initialProjectId ?? "local").trim() || "local";

    if (args.controlledWorkspace) {
        const resetBoundary = controlledWorkspaceResetBoundary(
            args.exerciseStateKey,
        );
        return [
            actorKey,
            runtimeLanguage,
            initialProjectId,
            "controlled-workspace",
            resetBoundary,
        ].join("::");
    }

    const scopeKey = String(args.scopeKey ?? "global").trim() || "global";
    const exerciseStateKey =
        String(args.exerciseStateKey ?? "none").trim() || "none";

    return [
        actorKey,
        runtimeLanguage,
        initialProjectId,
        scopeKey,
        exerciseStateKey,
    ].join("::");
}
