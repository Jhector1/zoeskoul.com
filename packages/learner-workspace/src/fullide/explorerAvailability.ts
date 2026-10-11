export function resolveExerciseExplorerAvailability(args: {
    explorerEnabled: boolean;
    exerciseStateKey?: string | null;
    learnerVisibleFileCount: number;
    canCreateFiles: boolean;
    maxFiles: number;
}): boolean {
    if (!args.explorerEnabled) return false;
    if (!args.exerciseStateKey) return true;
    if (args.learnerVisibleFileCount > 1) return true;

    return (
        args.canCreateFiles &&
        args.learnerVisibleFileCount < args.maxFiles
    );
}
