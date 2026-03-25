export function computeCanReveal(args: {
    isAssignment: boolean;
    allowRevealFromKey: boolean;
    allowRevealFromAssignment: boolean;
}) {
    return args.isAssignment
        ? args.allowRevealFromAssignment && args.allowRevealFromKey
        : args.allowRevealFromKey;
}