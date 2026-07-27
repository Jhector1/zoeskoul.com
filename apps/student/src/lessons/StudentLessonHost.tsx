import {
  fetchReviewProgressGET,
} from "@zoeskoul/learning-client";
import {
  useModuleOverview,
} from "@zoeskoul/learning-client/react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  modulePath,
  navigateStudentApp,
} from "../app/studentRoutes";

type ProgressState =
  Awaited<ReturnType<typeof fetchReviewProgressGET>>;

type ProgressLoadState =
  | {
      status: "loading";
    }
  | {
      status: "ready";
      progress: ProgressState;
    }
  | {
      status: "error";
      message: string;
    };

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Saved progress could not be loaded.";
}

export function StudentLessonHost(props: {
  apiOrigin: string;
  websiteOrigin: string;
  subjectSlug: string;
  moduleSlug: string;
}) {
  const moduleState = useModuleOverview({
    apiOrigin: props.apiOrigin,
    subjectSlug: props.subjectSlug,
    moduleSlug: props.moduleSlug,
    locale: "en",
  });

  const [progressState, setProgressState] =
    useState<ProgressLoadState>({
      status: "loading",
    });
  const [activeTopicSlug, setActiveTopicSlug] =
    useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setProgressState({ status: "loading" });

    void fetchReviewProgressGET({
      subjectSlug: props.subjectSlug,
      moduleSlug: props.moduleSlug,
      locale: "en",
      apiOrigin: props.apiOrigin,
      signal: controller.signal,
    })
      .then((progress) => {
        setProgressState({
          status: "ready",
          progress,
        });
      })
      .catch((error: unknown) => {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }

        setProgressState({
          status: "error",
          message: errorMessage(error),
        });
      });

    return () => {
      controller.abort();
    };
  }, [
    props.apiOrigin,
    props.moduleSlug,
    props.subjectSlug,
  ]);

  const topics = useMemo(() => {
    if (moduleState.status !== "ready") {
      return [];
    }

    return moduleState.data.sections.flatMap(
      (section) =>
        section.topics.map((topic) => ({
          ...topic,
          sectionSlug: section.slug,
          sectionTitle: section.title,
        })),
    );
  }, [moduleState]);

  const activeTopic =
    topics.find(
      (topic) =>
        topic.slug === activeTopicSlug,
    ) ??
    topics[0] ??
    null;

  useEffect(() => {
    if (
      activeTopic &&
      activeTopic.slug !== activeTopicSlug
    ) {
      setActiveTopicSlug(activeTopic.slug);
    }
  }, [activeTopic, activeTopicSlug]);

  const backHref = modulePath(
    props.subjectSlug,
    props.moduleSlug,
  );

  if (
    moduleState.status === "loading" ||
    progressState.status === "loading"
  ) {
    return (
      <section
        className="lesson-host-state"
        aria-busy="true"
      >
        <div
          className="student-state-spinner"
          aria-hidden="true"
        />
        <strong>Loading lesson</strong>
        <p>
          Loading the module outline and your saved progress.
        </p>
      </section>
    );
  }

  if (moduleState.status === "error") {
    return (
      <section className="lesson-host-state">
        <strong>Lesson unavailable</strong>
        <p>{moduleState.error}</p>
        <a
          className="course-reader-link"
          href={backHref}
          onClick={(event) =>
            navigateStudentApp(event, backHref)
          }
        >
          Back to module
        </a>
      </section>
    );
  }

  const progress =
    progressState.status === "ready"
      ? progressState.progress
      : null;
  const currentRuntimeHref =
    `${props.websiteOrigin}/en/subjects/` +
    `${encodeURIComponent(props.subjectSlug)}/modules/` +
    `${encodeURIComponent(props.moduleSlug)}/learn`;

  return (
    <div className="lesson-host">
      <nav
        className="course-reader-breadcrumbs"
        aria-label="Breadcrumb"
      >
        <a
          href={backHref}
          onClick={(event) =>
            navigateStudentApp(event, backHref)
          }
        >
          Module outline
        </a>
        <span>/</span>
        <span>{moduleState.data.module.title}</span>
      </nav>

      <header className="lesson-host-header">
        <div>
          <span className="course-reader-kicker">
            Vite lesson host
          </span>
          <h2>{moduleState.data.module.title}</h2>
          {moduleState.data.module.description ? (
            <p>
              {moduleState.data.module.description}
            </p>
          ) : null}
        </div>

        <span className="lesson-host-live-pill">
          {progress
            ? "Progress connected"
            : "Progress temporarily unavailable"}
        </span>
      </header>

      <div className="lesson-host-layout">
        <aside
          className="lesson-host-topics"
          aria-label="Lesson topics"
        >
          {moduleState.data.sections.map(
            (section) => (
              <section key={section.slug}>
                <span>{section.title}</span>

                {section.topics.map((topic) => {
                  const completed =
                    progress?.topics?.[topic.slug]
                      ?.completed === true;
                  const active =
                    activeTopic?.slug === topic.slug;

                  return (
                    <button
                      key={topic.slug}
                      type="button"
                      className={[
                        "lesson-topic-button",
                        active ? "is-active" : "",
                        completed
                          ? "is-complete"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() =>
                        setActiveTopicSlug(topic.slug)
                      }
                    >
                      <span aria-hidden="true">
                        {completed ? "✓" : "•"}
                      </span>
                      <span>{topic.title}</span>
                    </button>
                  );
                })}
              </section>
            ),
          )}
        </aside>

        <main className="lesson-host-stage">
          {activeTopic ? (
            <>
              <div className="lesson-topic-heading">
                <span>
                  {activeTopic.sectionTitle}
                </span>
                <h3>{activeTopic.title}</h3>
                <p>
                  This topic is now routed and hydrated
                  inside the Vite student application.
                </p>
              </div>

              <article className="lesson-runtime-checkpoint">
                <div>
                  <strong>
                    Lesson runtime host is active
                  </strong>
                  <p>
                    The Vite app owns the lesson URL,
                    module outline, active-topic state,
                    authentication, and database progress
                    hydration. Card rendering and IDE tools
                    are the next subsystem to move.
                  </p>
                </div>

                <a href={currentRuntimeHref}>
                  Open current card runtime
                </a>
              </article>

              {progressState.status === "error" ? (
                <div className="lesson-progress-warning">
                  {progressState.message}
                </div>
              ) : null}
            </>
          ) : (
            <section className="lesson-host-state">
              <strong>No topics found</strong>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
