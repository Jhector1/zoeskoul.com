function makeError(message: string, status: number, extra?: Record<string, unknown>) {
    const err = new Error(message);
    (err as any).status = status;
    if (extra) (err as any).extra = extra;
    return err;
}

export function assertAnswerKindMatchesInstance(args: {
    isReveal: boolean;
    answer?: { kind?: string } | null;
    instanceKind: string;
}) {
    if (args.isReveal) return;

    if (args.answer && args.answer.kind !== args.instanceKind) {
        throw makeError("Answer kind mismatch.", 400, {
            debug: {
                instanceKind: args.instanceKind,
                answerKind: args.answer.kind,
            },
        });
    }
}

export function assertInstanceNotFinalized(args: {
    isReveal: boolean;
    answeredAt?: Date | null;
}) {
    if (!args.isReveal && args.answeredAt) {
        throw makeError("This question is already finalized.", 409, {
            finalized: true,
        });
    }
}