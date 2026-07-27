import {
  isMyLearningResponse,
  type MyLearningResponse,
} from "@zoeskoul/learning-contracts";
import {
  createApiClient,
  type ApiClientOptions,
} from "@zoeskoul/api-client";

export type {
  LearningAssignmentSummary,
  LearningCourseSummary,
  LearningTutoringSummary,
  MyLearningResponse,
} from "@zoeskoul/learning-contracts";

export type LearningClientOptions = {
  apiOrigin: string;
  fetchImpl?: ApiClientOptions["fetchImpl"];
};

export function createLearningClient(
  options: LearningClientOptions,
) {
  const api = createApiClient({
    baseOrigin: options.apiOrigin,
    fetchImpl: options.fetchImpl,
  });

  return {
    async fetchMyLearning(args?: {
      locale?: string;
      signal?: AbortSignal;
    }): Promise<MyLearningResponse> {
      const locale = args?.locale?.trim() || "en";
      const response = await api.request<unknown>(
        `/api/student/my-learning?locale=${encodeURIComponent(locale)}`,
        {
          method: "GET",
          cache: "no-store",
          signal: args?.signal,
        },
      );

      if (!isMyLearningResponse(response)) {
        throw new Error("The My Learning response was invalid.");
      }

      return response;
    },
  };
}

export type LearningClient = ReturnType<
  typeof createLearningClient
>;
