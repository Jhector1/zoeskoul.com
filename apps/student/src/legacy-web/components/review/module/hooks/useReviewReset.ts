import type { ReviewModule } from "@zoeskoul/curriculum-contracts/subjects/types";
import { countAnswered } from "@zoeskoul/learning-runtime/review/module/utils";
import { useReviewRuntimeStore } from "@zoeskoul/learning-runtime/review/module/runtime/reviewRuntimeStore";
import {
    useReviewReset as useSharedReviewReset,
    type ReviewResetInjectedOwners,
    type UseReviewResetArgs as SharedUseReviewResetArgs,
} from "@zoeskoul/learner-ui/review/useReviewReset";
import { buildResetModuleProgress, buildResetTopicProgress } from "../actions";

type InjectedOwnerKey = keyof ReviewResetInjectedOwners;

type UseReviewResetArgs = Omit<
    SharedUseReviewResetArgs,
    InjectedOwnerKey | "topics"
> & {
    topics: ReviewModule["topics"] | undefined;
};

export function useReviewReset(args: UseReviewResetArgs) {
    return useSharedReviewReset({
        ...args,
        topics: args.topics,
        countAnswered: (cards, topicProgress, topicId) =>
            countAnswered(cards as any[], topicProgress, topicId),
        buildResetModuleProgress,
        buildResetTopicProgress,
        resetModuleRuntimeToCanonicalState: () =>
            useReviewRuntimeStore.getState().resetModuleToCanonicalState(),
        resetTopicRuntimeToCanonicalState: (topicId) =>
            useReviewRuntimeStore.getState().resetTopicToCanonicalState(topicId),
    });
}
