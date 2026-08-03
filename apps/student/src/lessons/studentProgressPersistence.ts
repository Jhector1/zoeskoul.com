import {
  buildReviewProgressPayload,
  fetchReviewProgressGET,
  saveReviewProgressPUT,
  type ReviewProgressSaveResult,
} from "@zoeskoul/learning-client";
import {
  mergeReviewProgressForConflictRetry,
  type ReviewProgressState,
} from "@zoeskoul/learning-runtime";

function errorStatus(
  error: unknown,
): number {
  if (
    typeof error !== "object" ||
    error === null
  ) {
    return 0;
  }

  const status = Number(
    (error as {
      status?: unknown;
    }).status,
  );

  return Number.isFinite(status)
    ? status
    : 0;
}

export async function saveStudentReviewProgress(
  args: {
    apiOrigin: string;
    subjectSlug: string;
    moduleSlug: string;
    locale: string;
    state: ReviewProgressState;
    endpoint?: string;
    signal?: AbortSignal;
    fetchProgress?:
      typeof fetchReviewProgressGET;
    saveProgress?:
      typeof saveReviewProgressPUT;
  },
): Promise<ReviewProgressSaveResult> {
  const fetchProgress =
    args.fetchProgress ??
    fetchReviewProgressGET;
  const saveProgress =
    args.saveProgress ??
    saveReviewProgressPUT;

  const saveState = (
    state: ReviewProgressState,
  ) =>
    saveProgress({
      apiOrigin: args.apiOrigin,
      payload:
        buildReviewProgressPayload({
          subjectSlug:
            args.subjectSlug,
          moduleSlug:
            args.moduleSlug,
          locale: args.locale,
          state,
          activeTopicId:
            state.activeTopicId,
        }),
      ...(args.endpoint
        ? {
            endpoint: args.endpoint,
          }
        : {}),
      ...(args.signal
        ? {
            signal: args.signal,
          }
        : {}),
    });

  try {
    return await saveState(args.state);
  } catch (error: unknown) {
    if (errorStatus(error) !== 409) {
      throw error;
    }

    const remote =
      await fetchProgress({
        apiOrigin: args.apiOrigin,
        subjectSlug:
          args.subjectSlug,
        moduleSlug:
          args.moduleSlug,
        locale: args.locale,
        ...(args.endpoint
          ? {
              endpoint:
                args.endpoint,
            }
          : {}),
        ...(args.signal
          ? {
              signal:
                args.signal,
            }
          : {}),
      });

    return saveState(
      mergeReviewProgressForConflictRetry(
        remote,
        args.state,
      ),
    );
  }
}
