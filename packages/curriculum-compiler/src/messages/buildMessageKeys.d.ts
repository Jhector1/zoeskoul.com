export type TopicMessageScope = {
    subjectSlug: string;
    moduleSlug: string;
    topicId: string;
};
export declare function deriveExerciseLocalMessageBase(exerciseId: string, messageBase?: string): string;
export declare function buildTopicMessagePrefix(scope: TopicMessageScope): string;
export declare function buildQualifiedMessageBase(args: {
    scope: TopicMessageScope;
    localMessageBase: string;
}): string;
export declare function buildExerciseMessageKeys(args: {
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
};
//# sourceMappingURL=buildMessageKeys.d.ts.map