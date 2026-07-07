/**
 * Neutral tools API for any exercise experience.
 *
 * The implementation still lives in the mature review runtime today. Keeping
 * this compatibility facade lets standalone practice reuse it without making
 * new code depend on review-specific naming. The implementation can be moved
 * later without changing practice or review consumers.
 */
export {
  ReviewToolsProvider as ExerciseToolsProvider,
  useReviewTools as useExerciseTools,
  useOptionalReviewTools as useOptionalExerciseTools,
  type ReviewToolsValue as ExerciseToolsValue,
  type RegisterArgs as RegisterExerciseToolArgs,
  type RunFeedbackEntry as ExerciseRunFeedbackEntry,
} from "@/components/review/module/context/ReviewToolsContext";
