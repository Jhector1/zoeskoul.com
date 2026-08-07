import { useCourseOverview } from "@zoeskoul/learning-client/react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import SubjectModulesClient from "@student/features/courses/SubjectModulesClient";

type ModuleOverview = {
  subject: {
    slug: string;
    title: string;
    description: string | null;
  };
  module: {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    order: number;
    weekStart: number | null;
    weekEnd: number | null;
  };
  sections: Array<{
    slug: string;
    title: string;
    description: string | null;
    topics: Array<{
      slug: string;
      title: string;
    }>;
  }>;
};

type ModuleState =
  | { status: "loading" }
  | {
      status: "ready";
      values: Record<string, ModuleOverview>;
    }
  | { status: "error"; error: string };

function LoadingSurface(props: {
  title: string;
  body?: string;
}) {
  return (
    <div className="min-h-screen bg-[rgb(var(--ui-bg)/1)] text-[rgb(var(--ui-text)/1)]">
      <div className="ui-container py-6">
        <div className="mx-auto max-w-4xl ui-page-surface p-5">
          <div className="ui-kicker">Courses</div>
          <h1 className="ui-title-md mt-2">
            {props.title}
          </h1>
          {props.body ? (
            <p className="ui-meta mt-2">
              {props.body}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ExactSubjectModulesView(props: {
  apiOrigin: string;
  locale: string;
  subjectSlug: string;
  canUnlockAll: boolean;
}) {
  const course = useCourseOverview({
    apiOrigin: props.apiOrigin,
    subjectSlug: props.subjectSlug,
    locale: props.locale,
  });

  const [moduleState, setModuleState] =
    useState<ModuleState>({ status: "loading" });

  useEffect(() => {
    if (course.status !== "ready") {
      setModuleState({ status: "loading" });
      return;
    }

    const controller = new AbortController();

    void Promise.all(
      course.data.modules.map(async (module) => {
        const url = new URL(
          `/api/student/courses/${encodeURIComponent(
            props.subjectSlug,
          )}/modules/${encodeURIComponent(module.slug)}`,
          props.apiOrigin,
        );

        url.searchParams.set("locale", props.locale);

        const response = await fetch(url, {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });

        const payload = await response
          .json()
          .catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            payload.error ??
              `Module request failed (${response.status}).`,
          );
        }

        return [
          module.slug,
          payload as ModuleOverview,
        ] as const;
      }),
    )
      .then((entries) => {
        if (controller.signal.aborted) return;

        setModuleState({
          status: "ready",
          values: Object.fromEntries(entries),
        });
      })
      .catch((error) => {
        if (
          controller.signal.aborted ||
          error?.name === "AbortError"
        ) {
          return;
        }

        setModuleState({
          status: "error",
          error:
            error instanceof Error
              ? error.message
              : "Course modules could not be loaded.",
        });
      });

    return () => controller.abort();
  }, [
    course.status,
    course.status === "ready"
      ? course.data.modules
          .map((module) => module.slug)
          .join("|")
      : "",
    props.apiOrigin,
    props.locale,
    props.subjectSlug,
  ]);

  const exactProps = useMemo(() => {
    if (
      course.status !== "ready" ||
      moduleState.status !== "ready"
    ) {
      return null;
    }

    const sections: Array<{
      id: string;
      slug: string;
      title: string;
      description: string | null;
      order: number | null;
      moduleId: string | null;
    }> = [];

    const topicIdsByModuleDbId: Record<
      string,
      string[]
    > = {};

    const topicIdsBySectionId: Record<
      string,
      string[]
    > = {};

    for (const module of course.data.modules) {
      const overview =
        moduleState.values[module.slug];

      const moduleTopicIds: string[] = [];

      for (
        let sectionIndex = 0;
        sectionIndex < (overview?.sections.length ?? 0);
        sectionIndex += 1
      ) {
        const section =
          overview.sections[sectionIndex];
        const sectionId =
          `${module.id}:${section.slug}`;
        const topicIds = section.topics.map(
          (topic) => topic.slug,
        );

        moduleTopicIds.push(...topicIds);

        sections.push({
          id: sectionId,
          slug: section.slug,
          title: section.title,
          description: section.description,
          order: sectionIndex,
          moduleId: module.id,
        });

        topicIdsBySectionId[sectionId] =
          topicIds;
      }

      topicIdsByModuleDbId[module.id] =
        moduleTopicIds;
    }

    return {
      locale: props.locale,
      subjectSlug: course.data.subject.slug,
      subjectTitle: course.data.subject.title,
      subjectDescription:
        course.data.subject.description,
      modules: course.data.modules.map(
        (module) => ({
          id: module.id,
          slug: module.slug,
          title: module.title,
          description: module.description,
          order: module.order,
          weekStart: module.weekStart,
          weekEnd: module.weekEnd,
        }),
      ),
      sections,
      topicIdsByModuleDbId,
      topicIdsBySectionId,
      canUnlockAll: props.canUnlockAll,
      accessByModuleSlug: Object.fromEntries(
        course.data.modules.map((module) => [
          module.slug,
          module.access,
        ]),
      ),
    };
  }, [
    course,
    moduleState,
    props.canUnlockAll,
    props.locale,
  ]);

  if (course.status === "loading") {
    return (
      <LoadingSurface title="Loading course" />
    );
  }

  if (course.status === "error") {
    return (
      <LoadingSurface
        title="Course could not be loaded"
        body={course.error}
      />
    );
  }

  if (moduleState.status === "loading") {
    return (
      <LoadingSurface title="Loading modules" />
    );
  }

  if (moduleState.status === "error") {
    return (
      <LoadingSurface
        title="Modules could not be loaded"
        body={moduleState.error}
      />
    );
  }

  if (!exactProps) {
    return (
      <LoadingSurface title="Loading course" />
    );
  }

  return <SubjectModulesClient {...exactProps} />;
}
