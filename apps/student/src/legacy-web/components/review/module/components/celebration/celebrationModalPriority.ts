export type CelebrationModalKind = "course" | "module" | null;

export function resolveCelebrationModalKind(args: {
    courseCelebrateOpen: boolean;
    moduleCelebrateOpen: boolean;
}): CelebrationModalKind {
    if (args.courseCelebrateOpen) return "course";
    if (args.moduleCelebrateOpen) return "module";
    return null;
}
