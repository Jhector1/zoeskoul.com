import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  createLearningClient,
  type LearningCourseOverviewResponse,
  type LearningLessonContentResponse,
  type LearningModuleOverviewResponse,
  type MyLearningResponse,
} from "./index.js";

export type AsyncLoadState<T> =
  | {
      status: "loading";
      data: null;
      error: null;
    }
  | {
      status: "ready";
      data: T;
      error: null;
    }
  | {
      status: "error";
      data: null;
      error: string;
    };

function errorMessage(
  error: unknown,
  fallback: string,
): string {
  return error instanceof Error
    ? error.message
    : fallback;
}

export function useMyLearning(args: {
  apiOrigin: string;
  locale?: string;
}): AsyncLoadState<MyLearningResponse> {
  const client = useMemo(
    () => createLearningClient({
      apiOrigin: args.apiOrigin,
    }),
    [args.apiOrigin],
  );

  const [state, setState] = useState<
    AsyncLoadState<MyLearningResponse>
  >({
    status: "loading",
    data: null,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();

    setState({
      status: "loading",
      data: null,
      error: null,
    });

    void client
      .fetchMyLearning({
        locale: args.locale,
        signal: controller.signal,
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setState({ status: "ready", data, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          data: null,
          error: errorMessage(
            error,
            "My Learning could not be loaded.",
          ),
        });
      });

    return () => controller.abort();
  }, [
    args.locale,
    client,
  ]);

  return state;
}

export function useCourseOverview(args: {
  apiOrigin: string;
  subjectSlug: string;
  locale?: string;
}): AsyncLoadState<LearningCourseOverviewResponse> {
  const client = useMemo(
    () => createLearningClient({
      apiOrigin: args.apiOrigin,
    }),
    [args.apiOrigin],
  );

  const [state, setState] = useState<
    AsyncLoadState<LearningCourseOverviewResponse>
  >({
    status: "loading",
    data: null,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();

    setState({
      status: "loading",
      data: null,
      error: null,
    });

    void client
      .fetchCourseOverview({
        subjectSlug: args.subjectSlug,
        locale: args.locale,
        signal: controller.signal,
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setState({ status: "ready", data, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          data: null,
          error: errorMessage(
            error,
            "The course overview could not be loaded.",
          ),
        });
      });

    return () => controller.abort();
  }, [
    args.locale,
    args.subjectSlug,
    client,
  ]);

  return state;
}

export function useModuleOverview(args: {
  apiOrigin: string;
  subjectSlug: string;
  moduleSlug: string;
  locale?: string;
}): AsyncLoadState<LearningModuleOverviewResponse> {
  const client = useMemo(
    () => createLearningClient({
      apiOrigin: args.apiOrigin,
    }),
    [args.apiOrigin],
  );

  const [state, setState] = useState<
    AsyncLoadState<LearningModuleOverviewResponse>
  >({
    status: "loading",
    data: null,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();

    setState({
      status: "loading",
      data: null,
      error: null,
    });

    void client
      .fetchModuleOverview({
        subjectSlug: args.subjectSlug,
        moduleSlug: args.moduleSlug,
        locale: args.locale,
        signal: controller.signal,
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setState({ status: "ready", data, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          data: null,
          error: errorMessage(
            error,
            "The module overview could not be loaded.",
          ),
        });
      });

    return () => controller.abort();
  }, [
    args.locale,
    args.moduleSlug,
    args.subjectSlug,
    client,
  ]);

  return state;
}

export function useLessonContent(args: {
  apiOrigin: string;
  subjectSlug: string;
  moduleSlug: string;
  locale?: string;
}): AsyncLoadState<LearningLessonContentResponse> {
  const client = useMemo(
    () => createLearningClient({
      apiOrigin: args.apiOrigin,
    }),
    [args.apiOrigin],
  );

  const [state, setState] = useState<
    AsyncLoadState<LearningLessonContentResponse>
  >({
    status: "loading",
    data: null,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();

    setState({
      status: "loading",
      data: null,
      error: null,
    });

    void client
      .fetchLessonContent({
        subjectSlug: args.subjectSlug,
        moduleSlug: args.moduleSlug,
        locale: args.locale,
        signal: controller.signal,
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setState({ status: "ready", data, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          data: null,
          error: errorMessage(
            error,
            "The lesson content could not be loaded.",
          ),
        });
      });

    return () => controller.abort();
  }, [
    args.locale,
    args.moduleSlug,
    args.subjectSlug,
    client,
  ]);

  return state;
}
