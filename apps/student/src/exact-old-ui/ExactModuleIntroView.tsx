import { useModuleOverview } from "@zoeskoul/learning-client/react";

import ModuleIntroClient from "@student/features/courses/ModuleIntroClient";

function StateSurface(props: {
  title: string;
  body?: string;
}) {
  return (
    <div className="min-h-screen bg-[rgb(var(--ui-bg)/1)] text-[rgb(var(--ui-text)/1)]">
      <div className="ui-container py-6">
        <div className="mx-auto max-w-4xl ui-page-surface p-5">
          <div className="ui-kicker">Module</div>
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

export function ExactModuleIntroView(props: {
  apiOrigin: string;
  locale: string;
  subjectSlug: string;
  moduleSlug: string;
}) {
  const state = useModuleOverview({
    apiOrigin: props.apiOrigin,
    subjectSlug: props.subjectSlug,
    moduleSlug: props.moduleSlug,
    locale: props.locale,
  });

  if (state.status === "loading") {
    return (
      <StateSurface title="Loading module" />
    );
  }

  if (state.status === "error") {
    return (
      <StateSurface
        title="Module could not be loaded"
        body={state.error}
      />
    );
  }

  const {
    subject,
    module,
    stats,
  } = state.data;

  return (
    <ModuleIntroClient
      locale={props.locale}
      subject={{
        slug: subject.slug,
        title: subject.title,
        description: subject.description,
        imagePublicId:
          subject.imagePublicId ?? null,
        imageAlt: subject.imageAlt ?? null,
      }}
      module={{
        id: module.id,
        slug: module.slug,
        title: module.title,
        description: module.description,
        order: module.order,
        weekStart: module.weekStart,
        weekEnd: module.weekEnd,
        meta: {
          estimatedMinutes:
            module.meta.estimatedMinutes ??
            undefined,
          prereqs: module.meta.prereqs ?? [],
          outcomes: module.meta.outcomes ?? [],
          why: module.meta.why ?? [],
          videoUrl:
            module.meta.videoUrl ?? undefined,
        },
      }}
      stats={{
        sectionsCount: stats.sectionsCount,
        topicsCount: stats.topicsCount,
      }}
    />
  );
}
