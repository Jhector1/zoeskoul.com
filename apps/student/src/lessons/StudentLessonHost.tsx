import {
  completedTopicKeysFromProgress,
  fetchReviewProgressGET,
  type LearningLessonCard,
} from "@zoeskoul/learning-client";
import {
  useLessonContent,
} from "@zoeskoul/learning-client/react";
import {
  lazy,
  Suspense,
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

const LessonMarkdown = lazy(async () => {
  const renderer = await import(
    "@zoeskoul/lesson-renderer"
  );

  return {
    default: renderer.LessonMarkdown,
  };
});

function RenderedLessonMarkdown(props: {
  content: string;
}) {
  return (
    <Suspense
      fallback={
        <div
          className="lesson-reading-content"
          aria-busy="true"
        >
          Loading lesson content…
        </div>
      }
    >
      <LessonMarkdown
        className="lesson-reading-content"
        content={props.content}
      />
    </Suspense>
  );
}

export function StudentLessonHost(props: {
  apiOrigin: string;
  websiteOrigin: string;
  subjectSlug: string;
  moduleSlug: string;
}) {
  const lessonState = useLessonContent({
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
    if (lessonState.status !== "ready") {
      return [];
    }

    return lessonState.data.sections.flatMap(
      (section) =>
        section.topics.map((topic) => ({
          ...topic,
          sectionSlug: section.slug,
          sectionTitle: section.title,
        })),
    );
  }, [lessonState]);

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
    lessonState.status === "loading" ||
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

  if (lessonState.status === "error") {
    return (
      <section className="lesson-host-state">
        <strong>Lesson unavailable</strong>
        <p>{lessonState.error}</p>
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
  const completedTopicKeys = useMemo(
    () =>
      completedTopicKeysFromProgress(
        progress,
      ),
    [progress],
  );
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
        <span>{lessonState.data.module.title}</span>
      </nav>

      <header className="lesson-host-header">
        <div>
          <span className="course-reader-kicker">
            Vite lesson host
          </span>
          <h2>{lessonState.data.module.title}</h2>
          {lessonState.data.module.description ? (
            <p>
              {lessonState.data.module.description}
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
          {lessonState.data.sections.map(
            (section) => (
              <section key={section.slug}>
                <span>{section.title}</span>

                {section.topics.map((topic) => {
                  const completed =
                    completedTopicKeys.has(
                      topic.slug,
                    );
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

              <div className="lesson-card-stack">
                {activeTopic.cards.length ? (
                  activeTopic.cards.map(
                    (card: LearningLessonCard) => (
                      <article
                        className="lesson-content-card"
                        key={card.id}
                      >
                        {card.title ? (
                          <h4>{card.title}</h4>
                        ) : null}

                        {card.type === "text" ? (
                          <>
                            <RenderedLessonMarkdown
                              content={card.markdown}
                            />

                            {card.runtimeRequired ? (
                              <div className="lesson-runtime-handoff">
                                <span>
                                  This reading includes an
                                  interactive Try It.
                                </span>
                                <a href={currentRuntimeHref}>
                                  Open Try It
                                </a>
                              </div>
                            ) : null}
                          </>
                        ) : card.type === "video" ? (
                          <>
                            <div className="lesson-video-frame">
                              <iframe
                                src={card.url}
                                title={
                                  card.title ??
                                  "Lesson video"
                                }
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                              />
                            </div>

                            {card.captionMarkdown ? (
                              <RenderedLessonMarkdown
                                content={card.captionMarkdown}
                              />
                            ) : null}
                          </>
                        ) : (
                          <div className="lesson-runtime-handoff">
                            <span>
                              This {card.runtimeKind} card
                              uses the current interactive
                              runtime.
                            </span>
                            <a href={currentRuntimeHref}>
                              Open {card.runtimeKind}
                            </a>
                          </div>
                        )}
                      </article>
                    ),
                  )
                ) : (
                  <section className="lesson-host-state">
                    <strong>
                      No lesson cards found
                    </strong>
                  </section>
                )}
              </div>

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
