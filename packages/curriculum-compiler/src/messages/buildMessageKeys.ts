export type TopicMessageScope = {
    subjectSlug: string;
    moduleSlug: string;
    topicId: string;
};

function sanitizeSegment(value: string): string {
    return String(value ?? "")
        .trim()
        .replace(/\s+/g, "-");
}

function normalizeLocalMessageBase(value: string): string {
    const base = String(value ?? "").trim();

    if (!base) {
        throw new Error("messageBase cannot be empty");
    }

    if (
        base.startsWith("topics.") ||
        base.startsWith("subjects.") ||
        base.startsWith("sketches.")
    ) {
        throw new Error(
            `messageBase must be topic-local, not fully qualified: "${base}"`,
        );
    }

    return base;
}

export function deriveExerciseLocalMessageBase(
    exerciseId: string,
    messageBase?: string,
): string {
    return normalizeLocalMessageBase(
        messageBase ?? `quiz.${sanitizeSegment(exerciseId)}`,
    );
}

export function buildTopicMessagePrefix(scope: TopicMessageScope): string {
    return [
        "topics",
        sanitizeSegment(scope.subjectSlug),
        sanitizeSegment(scope.moduleSlug),
        sanitizeSegment(scope.topicId),
    ].join(".");
}

export function buildQualifiedMessageBase(args: {
    scope: TopicMessageScope;
    localMessageBase: string;
}): string {
    return `${buildTopicMessagePrefix(args.scope)}.${normalizeLocalMessageBase(
        args.localMessageBase,
    )}`;
}

export function buildExerciseMessageKeys(args: {
    scope: TopicMessageScope;
    exerciseId: string;
    messageBase?: string;
    optionIds?: string[];
}): {
    localMessageBase: string;
    qualifiedBase: string;
    titleKey: string;
    promptKey: string;
    hintKey: string;
    help: {
        conceptKey: string;
        hint1Key: string;
        hint2Key: string;
    };
    optionKeys: Record<string, string>;
} {
    const localMessageBase = deriveExerciseLocalMessageBase(
        args.exerciseId,
        args.messageBase,
    );

    const qualifiedBase = buildQualifiedMessageBase({
        scope: args.scope,
        localMessageBase,
    });

    const optionKeys = Object.fromEntries(
        (args.optionIds ?? []).map((id) => [
            id,
            `${qualifiedBase}.options.${id}`,
        ]),
    );

    return {
        localMessageBase,
        qualifiedBase,
        titleKey: `${qualifiedBase}.title`,
        promptKey: `${qualifiedBase}.prompt`,
        hintKey: `${qualifiedBase}.hint`,
        help: {
            conceptKey: `${qualifiedBase}.help.concept`,
            hint1Key: `${qualifiedBase}.help.hint_1`,
            hint2Key: `${qualifiedBase}.help.hint_2`,
        },
        optionKeys,
    };
}