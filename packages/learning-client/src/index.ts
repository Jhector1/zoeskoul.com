import {
  isLearningCourseOverviewResponse,
  isLearningLessonContentResponse,
  isLearningModuleOverviewResponse,
  isLearningRuntimeLaunchResponse,
  isMyLearningResponse,
  type LearningCourseOverviewResponse,
  type LearningLessonContentResponse,
  type LearningModuleOverviewResponse,
  type LearningRuntimeLaunchResponse,
  type LearningRuntimeTarget,
  type MyLearningResponse,
} from "@zoeskoul/learning-contracts";
import {
  createApiClient,
  type ApiClientOptions,
} from "@zoeskoul/api-client";

export type {
  LearningAssignmentSummary,
  LearningCourseModuleSummary,
  LearningCourseOverviewResponse,
  LearningCourseSummary,
  LearningLessonCard,
  LearningLessonContentResponse,
  LearningLessonRuntimeCard,
  LearningLessonSection,
  LearningLessonTextCard,
  LearningLessonTopic,
  LearningLessonVideoCard,
  LearningModuleOverviewResponse,
  LearningRuntimeLaunchActivity,
  LearningRuntimeLaunchResponse,
  LearningRuntimeTarget,
  LearningModuleSectionSummary,
  LearningModuleTopicSummary,
  LearningTutoringSummary,
  MyLearningResponse,
} from "@zoeskoul/learning-contracts";

export type LearningClientOptions = {
  apiOrigin: string;
  fetchImpl?: ApiClientOptions["fetchImpl"];
};

function localeQuery(locale: string | undefined): string {
  return encodeURIComponent(locale?.trim() || "en");
}

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
      const response = await api.request<unknown>(
        `/api/student/my-learning?locale=${localeQuery(args?.locale)}`,
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

    async fetchCourseOverview(args: {
      subjectSlug: string;
      locale?: string;
      signal?: AbortSignal;
    }): Promise<LearningCourseOverviewResponse> {
      const response = await api.request<unknown>(
        `/api/student/courses/${encodeURIComponent(args.subjectSlug)}?locale=${localeQuery(args.locale)}`,
        {
          method: "GET",
          cache: "no-store",
          signal: args.signal,
        },
      );

      if (!isLearningCourseOverviewResponse(response)) {
        throw new Error("The course overview response was invalid.");
      }

      return response;
    },

    async fetchModuleOverview(args: {
      subjectSlug: string;
      moduleSlug: string;
      locale?: string;
      signal?: AbortSignal;
    }): Promise<LearningModuleOverviewResponse> {
      const response = await api.request<unknown>(
        `/api/student/courses/${encodeURIComponent(args.subjectSlug)}/modules/${encodeURIComponent(args.moduleSlug)}?locale=${localeQuery(args.locale)}`,
        {
          method: "GET",
          cache: "no-store",
          signal: args.signal,
        },
      );

      if (!isLearningModuleOverviewResponse(response)) {
        throw new Error("The module overview response was invalid.");
      }

      return response;
    },

    async fetchLessonContent(args: {
      subjectSlug: string;
      moduleSlug: string;
      locale?: string;
      signal?: AbortSignal;
    }): Promise<LearningLessonContentResponse> {
      const response = await api.request<unknown>(
        `/api/student/courses/${encodeURIComponent(args.subjectSlug)}/modules/${encodeURIComponent(args.moduleSlug)}/lesson?locale=${localeQuery(args.locale)}`,
        {
          method: "GET",
          cache: "no-store",
          signal: args.signal,
        },
      );

      if (!isLearningLessonContentResponse(response)) {
        throw new Error("The lesson content response was invalid.");
      }

      return response;
    },

    async fetchRuntimeLaunch(args: {
      subjectSlug: string;
      moduleSlug: string;
      target: LearningRuntimeTarget;
      locale?: string;
      signal?: AbortSignal;
    }): Promise<LearningRuntimeLaunchResponse> {
      const query = new URLSearchParams({
        locale: args.locale?.trim() || "en",
        version: String(args.target.version),
        sectionSlug: args.target.sectionSlug,
        topicSlug: args.target.topicSlug,
        ownerCardId: args.target.ownerCardId,
        targetKind: args.target.targetKind,
        targetId: args.target.targetId,
        runtimeKind: args.target.runtimeKind,
      });

      const response = await api.request<unknown>(
        `/api/student/courses/${encodeURIComponent(args.subjectSlug)}` +
          `/modules/${encodeURIComponent(args.moduleSlug)}` +
          `/runtime?${query.toString()}`,
        {
          method: "GET",
          cache: "no-store",
          signal: args.signal,
        },
      );

      if (!isLearningRuntimeLaunchResponse(response)) {
        throw new Error(
          "The runtime launch response was invalid.",
        );
      }

      return response;
    },
  };
}

export type LearningClient = ReturnType<
  typeof createLearningClient
>;

export {
  buildReviewProgressPayload,
  completedTopicKeysFromProgress,
  createReviewProgressClient,
  emptyReviewProgress,
  fetchReviewProgressGET,
  ReviewProgressClientError,
  saveReviewProgressPUT,
} from "./reviewProgress";

export type {
  ReviewProgressClient,
  ReviewProgressClientOptions,
  ReviewProgressFetchArgs,
  ReviewProgressPayload,
  ReviewProgressSaveArgs,
  ReviewProgressSaveResponseData,
  ReviewProgressSaveResult,
} from "./reviewProgress";

// ---------------------------------------------------------------------------
// Protected Vite practice gateway client.
// ---------------------------------------------------------------------------

import {
  isLearningPracticeLaunchResponse,
  isLearningPracticeValidationResponse,
  type LearningPracticeLaunchResponse,
  type LearningPracticeValidationResponse,
  type LearningSimplePracticeAnswer,
} from "@zoeskoul/learning-contracts";

export type {
  LearningPracticeLaunchResponse,
  LearningPracticeValidationResponse,
  LearningSimplePracticeAnswer,
} from "@zoeskoul/learning-contracts";

function appendRuntimeTarget(
  search: URLSearchParams,
  target: LearningRuntimeTarget,
) {
  search.set("version", String(target.version));
  search.set("sectionSlug", target.sectionSlug);
  search.set("topicSlug", target.topicSlug);
  search.set("ownerCardId", target.ownerCardId);
  search.set("targetKind", target.targetKind);
  search.set("targetId", target.targetId);
  search.set("runtimeKind", target.runtimeKind);
}

export function createStudentPracticeClient(
  options: LearningClientOptions,
) {
  const api = createApiClient({
    baseOrigin: options.apiOrigin,
    fetchImpl: options.fetchImpl,
  });

  return {
    async launch(args: {
      subjectSlug: string;
      moduleSlug: string;
      target: LearningRuntimeTarget;
      locale?: string;
      signal?: AbortSignal;
    }): Promise<LearningPracticeLaunchResponse> {
      const search = new URLSearchParams();
      search.set(
        "locale",
        args.locale?.trim() || "en",
      );
      appendRuntimeTarget(search, args.target);

      const path =
        `/api/student/courses/${encodeURIComponent(args.subjectSlug)}` +
        `/modules/${encodeURIComponent(args.moduleSlug)}` +
        `/runtime/practice?${search.toString()}`;

      const payload = await api.request<unknown>(
        path,
        {
          method: "GET",
          cache: "no-store",
          signal: args.signal,
        },
      );

      if (
        !isLearningPracticeLaunchResponse(payload)
      ) {
        throw new Error(
          "The student practice launch response was invalid.",
        );
      }

      return payload;
    },

    async validate(args: {
      key: string;
      answer: LearningSimplePracticeAnswer;
      submissionId?: string;
      signal?: AbortSignal;
    }): Promise<LearningPracticeValidationResponse> {
      const payload = await api.request<unknown>(
        "/api/student/runtime/practice/validate",
        {
          method: "POST",
          cache: "no-store",
          signal: args.signal,
          json: {
            key: args.key,
            answer: args.answer,
            submissionId:
              args.submissionId?.trim() ||
              undefined,
          },
        },
      );

      if (
        !isLearningPracticeValidationResponse(
          payload,
        )
      ) {
        throw new Error(
          "The student practice validation response was invalid.",
        );
      }

      return payload;
    },
  };
}

export type StudentPracticeClient =
  ReturnType<typeof createStudentPracticeClient>;
