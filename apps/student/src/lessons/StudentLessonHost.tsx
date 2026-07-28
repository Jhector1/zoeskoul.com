import {
  buildReviewProgressPayload,
  fetchReviewProgressGET,
  saveReviewProgressPUT,
} from "@zoeskoul/learning-client";
import {
  useLessonContent,
} from "@zoeskoul/learning-client/react";
import {
  buildLessonAssessmentDoneProgress,
  buildLessonCardDoneProgress,
  buildLessonEmbeddedTryItDoneProgress,
  canAutoCompleteLessonCard,
  getTopicProgressState,
  isLessonCardComplete,
  isLessonEmbeddedTryItPassed,
  isLessonTopicComplete,
  isLessonTopicUnlocked,
  nextLessonPosition,
  previousLessonPosition,
  resolveInitialLessonTopicSlug,
  withActiveLessonTopic,
  type ReviewProgressState,
} from "@zoeskoul/learning-runtime";
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
import {
  StudentEmbeddedTryItCard,
} from "./StudentEmbeddedTryItCard";
import {
  StudentSimpleQuizCard,
} from "./StudentSimpleQuizCard";

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

type ProgressSaveState =
  | "idle"
  | "saving"
  | "saved"
  | "error";

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
  const [saveState, setSaveState] =
    useState<ProgressSaveState>("idle");
  const [saveError, setSaveError] =
    useState<string | null>(null);
  const [activeTopicSlug, setActiveTopicSlug] =
    useState<string | null>(null);
  const [activeCardIndex, setActiveCardIndex] =
    useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setProgressState({ status: "loading" });
    setSaveState("idle");
    setSaveError(null);
    setActiveTopicSlug(null);
    setActiveCardIndex(0);

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

  const progress =
    progressState.status === "ready"
      ? progressState.progress
      : null;

  useEffect(() => {
    if (!topics.length) return;

    const currentStillExists =
      activeTopicSlug &&
      topics.some(
        (topic) =>
          topic.slug === activeTopicSlug,
      );

    if (currentStillExists) return;

    setActiveTopicSlug(
      resolveInitialLessonTopicSlug(
        topics,
        progress?.activeTopicId,
      ),
    );
    setActiveCardIndex(0);
  }, [
    activeTopicSlug,
    progress?.activeTopicId,
    topics,
  ]);

  const activeTopicIndex =
    topics.findIndex(
      (topic) =>
        topic.slug === activeTopicSlug,
    );
  const activeTopic =
    activeTopicIndex >= 0
      ? topics[activeTopicIndex]
      : topics[0] ?? null;

  useEffect(() => {
    if (!activeTopic) {
      setActiveCardIndex(0);
      return;
    }

    setActiveCardIndex((current) =>
      Math.min(
        Math.max(0, current),
        Math.max(
          0,
          activeTopic.cards.length - 1,
        ),
      ),
    );
  }, [activeTopic]);

  const topicProgress = activeTopic
    ? getTopicProgressState(
        progress?.topics,
        activeTopic.slug,
      ).topic
    : null;
  const activeCard =
    activeTopic?.cards[activeCardIndex] ??
    null;
  const activeCardComplete =
    activeCard
      ? isLessonCardComplete(
          activeCard,
          topicProgress,
        )
      : false;
  const activeCardAutoCompletable =
    activeCard
      ? canAutoCompleteLessonCard(
          activeCard,
        )
      : false;
  const activeEmbeddedTryItPassed =
    activeCard?.type === "text"
      ? isLessonEmbeddedTryItPassed(
          activeCard,
          topicProgress,
        )
      : false;
  const activeCardCompletableNow =
    activeCardAutoCompletable ||
    activeEmbeddedTryItPassed;

  const previewProgress =
    progress &&
    activeTopic &&
    activeCard &&
    !activeCardComplete &&
    activeCardCompletableNow
      ? buildLessonCardDoneProgress({
          progress,
          topicSlug: activeTopic.slug,
          card: activeCard,
          topics,
        })
      : progress;

  const previewTopicProgress =
    activeTopic
      ? getTopicProgressState(
          previewProgress?.topics,
          activeTopic.slug,
        ).topic
      : null;
  const topicComplete =
    activeTopic
      ? isLessonTopicComplete(
          activeTopic.cards,
          topicProgress,
        )
      : false;
  const topicCompleteAfterAction =
    activeTopic
      ? isLessonTopicComplete(
          activeTopic.cards,
          previewTopicProgress,
        )
      : false;

  const previousPosition =
    activeTopic
      ? previousLessonPosition(
          topics,
          {
            topicIndex:
              activeTopicIndex >= 0
                ? activeTopicIndex
                : 0,
            cardIndex: activeCardIndex,
          },
        )
      : null;
  const nextPosition =
    activeTopic
      ? nextLessonPosition({
          topics,
          current: {
            topicIndex:
              activeTopicIndex >= 0
                ? activeTopicIndex
                : 0,
            cardIndex: activeCardIndex,
          },
          allowNextTopic:
            topicCompleteAfterAction,
        })
      : null;

  const canGoNext =
    Boolean(nextPosition) &&
    (
      activeCardComplete ||
      activeCardCompletableNow
    );
  const isSaving = saveState === "saving";

  async function persistProgress(
    next: ReviewProgressState,
  ): Promise<ReviewProgressState> {
    setProgressState({
      status: "ready",
      progress: next,
    });
    setSaveState("saving");
    setSaveError(null);

    try {
      const saved =
        await saveReviewProgressPUT({
          apiOrigin: props.apiOrigin,
          payload: buildReviewProgressPayload({
            subjectSlug: props.subjectSlug,
            moduleSlug: props.moduleSlug,
            locale: "en",
            state: next,
            activeTopicId:
              next.activeTopicId,
          }),
        });

      setProgressState({
        status: "ready",
        progress: saved.state,
      });
      setSaveState("saved");

      return saved.state;
    } catch (error: unknown) {
      setSaveState("error");
      setSaveError(errorMessage(error));

      /**
       * Keep the optimistic state visible. The learner can retry the same
       * action after the save error instead of losing their local navigation.
       */
      return next;
    }
  }

  function applyPosition(args: {
    topicIndex: number;
    cardIndex: number;
  }) {
    const topic = topics[args.topicIndex];
    if (!topic) return;

    setActiveTopicSlug(topic.slug);
    setActiveCardIndex(args.cardIndex);
  }

  async function selectTopic(
    topicIndex: number,
  ) {
    const topic = topics[topicIndex];
    if (!topic || isSaving) return;

    if (
      !isLessonTopicUnlocked({
        topics,
        topicIndex,
        progress,
      })
    ) {
      return;
    }

    applyPosition({
      topicIndex,
      cardIndex: 0,
    });

    if (progress) {
      await persistProgress(
        withActiveLessonTopic(
          progress,
          topic.slug,
        ),
      );
    }
  }

  async function markCurrentCardDone() {
    if (
      !progress ||
      !activeTopic ||
      !activeCard ||
      !activeCardAutoCompletable ||
      isSaving
    ) {
      return;
    }

    await persistProgress(
      buildLessonCardDoneProgress({
        progress,
        topicSlug: activeTopic.slug,
        card: activeCard,
        topics,
      }),
    );
  }

  async function completeCurrentQuiz() {
    if (
      !progress ||
      !activeTopic ||
      !activeCard ||
      activeCard.type !== "runtime" ||
      activeCard.runtimeKind !== "quiz" ||
      isSaving
    ) {
      return;
    }

    await persistProgress(
      buildLessonAssessmentDoneProgress({
        progress,
        topicSlug: activeTopic.slug,
        card: activeCard,
        topics,
      }),
    );
  }

  async function completeCurrentEmbeddedTryIt() {
    if (
      !progress ||
      !activeTopic ||
      !activeCard ||
      activeCard.type !== "text" ||
      activeCard.runtimeRequired !== true ||
      !activeCard.runtime ||
      activeCard.runtime.targetKind !==
        "embedded_try_it" ||
      activeCard.runtime.runtimeKind !==
        "try_it" ||
      isSaving
    ) {
      return;
    }

    await persistProgress(
      buildLessonEmbeddedTryItDoneProgress({
        progress,
        topicSlug: activeTopic.slug,
        card: activeCard,
        topics,
      }),
    );
  }

  async function goNext() {
    if (
      !nextPosition ||
      !canGoNext ||
      !activeTopic ||
      !activeCard ||
      isSaving
    ) {
      return;
    }

    let nextProgress = progress;

    if (
      nextProgress &&
      !activeCardComplete &&
      activeCardCompletableNow
    ) {
      nextProgress =
        buildLessonCardDoneProgress({
          progress: nextProgress,
          topicSlug: activeTopic.slug,
          card: activeCard,
          topics,
        });
    }

    const destinationTopic =
      topics[nextPosition.topicIndex];

    if (
      nextProgress &&
      destinationTopic &&
      destinationTopic.slug !==
        activeTopic.slug
    ) {
      nextProgress = withActiveLessonTopic(
        nextProgress,
        destinationTopic.slug,
      );
    }

    applyPosition(nextPosition);

    if (nextProgress) {
      await persistProgress(nextProgress);
    }
  }

  async function goPrevious() {
    if (!previousPosition || isSaving) {
      return;
    }

    const destinationTopic =
      topics[previousPosition.topicIndex];

    applyPosition(previousPosition);

    if (
      progress &&
      destinationTopic &&
      destinationTopic.slug !==
        activeTopic?.slug
    ) {
      await persistProgress(
        withActiveLessonTopic(
          progress,
          destinationTopic.slug,
        ),
      );
    }
  }

  async function openCurrentRuntime() {
    if (!activeTopic || isSaving) return;

    if (progress) {
      await persistProgress(
        withActiveLessonTopic(
          progress,
          activeTopic.slug,
        ),
      );
    }

    window.location.assign(
      `${props.websiteOrigin}/en/subjects/` +
        `${encodeURIComponent(
          props.subjectSlug,
        )}/modules/` +
        `${encodeURIComponent(
          props.moduleSlug,
        )}/learn`,
    );
  }

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

  const nextCrossesTopic =
    Boolean(
      nextPosition &&
      nextPosition.topicIndex !==
        activeTopicIndex,
    );

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

        <div className="lesson-host-status-group">
          <span className="lesson-host-live-pill">
            {progress
              ? "Progress connected"
              : "Progress temporarily unavailable"}
          </span>

          <span
            className={[
              "lesson-save-status",
              saveState === "error"
                ? "is-error"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-live="polite"
          >
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? "Saved"
                : saveState === "error"
                  ? "Save failed"
                  : ""}
          </span>
        </div>
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
                  const topicIndex =
                    topics.findIndex(
                      (candidate) =>
                        candidate.slug === topic.slug,
                    );
                  const state =
                    getTopicProgressState(
                      progress?.topics,
                      topic.slug,
                    ).topic;
                  const completed =
                    isLessonTopicComplete(
                      topic.cards,
                      state,
                    );
                  const active =
                    activeTopic?.slug === topic.slug;
                  const unlocked =
                    isLessonTopicUnlocked({
                      topics,
                      topicIndex,
                      progress,
                    });

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
                      disabled={
                        !unlocked || isSaving
                      }
                      title={
                        unlocked
                          ? undefined
                          : "Complete the previous topic first."
                      }
                      onClick={() =>
                        void selectTopic(topicIndex)
                      }
                    >
                      <span aria-hidden="true">
                        {completed
                          ? "✓"
                          : unlocked
                            ? "•"
                            : "○"}
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
          {activeTopic && activeCard ? (
            <>
              <div className="lesson-topic-heading">
                <span>
                  {activeTopic.sectionTitle}
                </span>
                <h3>{activeTopic.title}</h3>
                <p>
                  {activeTopic.summary ??
                    "Work through each lesson card in order."}
                </p>
              </div>

              <div className="lesson-card-progress">
                <span>
                  Card {activeCardIndex + 1} of{" "}
                  {activeTopic.cards.length}
                </span>
                <progress
                  value={activeCardIndex + 1}
                  max={Math.max(
                    1,
                    activeTopic.cards.length,
                  )}
                />
              </div>

              <article
                className="lesson-content-card"
                data-testid="lesson-content-card"
                data-card-id={activeCard.id}
              >
                <header className="lesson-card-header">
                  <div>
                    <span>
                      {activeCard.type === "runtime"
                        ? activeCard.runtimeKind
                        : activeCard.type}
                    </span>
                    {activeCard.title ? (
                      <h4>{activeCard.title}</h4>
                    ) : null}
                  </div>

                  <strong
                    data-testid="lesson-card-status"
                    className={
                      activeCardComplete
                        ? "is-complete"
                        : undefined
                    }
                  >
                    {activeCardComplete
                      ? "Complete"
                      : "In progress"}
                  </strong>
                </header>

                {activeCard.type === "text" ? (
                  <>
                    <RenderedLessonMarkdown
                      content={activeCard.markdown}
                    />

                    {activeCard.runtimeRequired &&
                    activeCard.runtime?.targetKind ===
                      "embedded_try_it" &&
                    activeCard.runtime.runtimeKind ===
                      "try_it" ? (
                      <StudentEmbeddedTryItCard
                        apiOrigin={props.apiOrigin}
                        subjectSlug={props.subjectSlug}
                        moduleSlug={props.moduleSlug}
                        card={activeCard}
                        passed={
                          activeEmbeddedTryItPassed
                        }
                        disabled={isSaving}
                        onPass={
                          completeCurrentEmbeddedTryIt
                        }
                        onOpenLegacy={
                          openCurrentRuntime
                        }
                      />
                    ) : activeCard.runtimeRequired ? (
                      <div className="lesson-runtime-handoff">
                        <span>
                          Complete the embedded Try It in
                          the current interactive runtime.
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            void openCurrentRuntime()
                          }
                          disabled={isSaving}
                        >
                          Open Try It
                        </button>
                      </div>
                    ) : (
                      <div className="lesson-card-actions">
                        <button
                          type="button"
                          className={
                            activeCardComplete
                              ? "is-complete"
                              : undefined
                          }
                          onClick={() =>
                            void markCurrentCardDone()
                          }
                          disabled={
                            activeCardComplete ||
                            isSaving ||
                            !progress
                          }
                        >
                          {activeCardComplete
                            ? "✓ Read"
                            : "Mark as read"}
                        </button>
                      </div>
                    )}
                  </>
                ) : activeCard.type === "video" ? (
                  <>
                    <div className="lesson-video-frame">
                      <iframe
                        src={activeCard.url}
                        title={
                          activeCard.title ??
                          "Lesson video"
                        }
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>

                    {activeCard.captionMarkdown ? (
                      <RenderedLessonMarkdown
                        content={
                          activeCard.captionMarkdown
                        }
                      />
                    ) : null}

                    <div className="lesson-card-actions">
                      <button
                        type="button"
                        className={
                          activeCardComplete
                            ? "is-complete"
                            : undefined
                        }
                        onClick={() =>
                          void markCurrentCardDone()
                        }
                        disabled={
                          activeCardComplete ||
                          isSaving ||
                          !progress
                        }
                      >
                        {activeCardComplete
                          ? "✓ Watched"
                          : "Mark watched"}
                      </button>
                    </div>
                  </>
                ) : activeCard.type === "runtime" &&
                  activeCard.runtimeKind === "quiz" ? (
                  <StudentSimpleQuizCard
                    apiOrigin={props.apiOrigin}
                    subjectSlug={props.subjectSlug}
                    moduleSlug={props.moduleSlug}
                    card={activeCard}
                    completed={activeCardComplete}
                    disabled={isSaving}
                    onComplete={completeCurrentQuiz}
                    onOpenLegacy={openCurrentRuntime}
                  />
                ) : (
                  <div className="lesson-runtime-handoff">
                    <span>
                      This {activeCard.runtimeKind} card
                      uses the current interactive runtime.
                      Your completion returns here through
                      saved progress.
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        void openCurrentRuntime()
                      }
                      disabled={isSaving}
                    >
                      Open {activeCard.runtimeKind}
                    </button>
                  </div>
                )}
              </article>

              {topicComplete &&
              !nextPosition ? (
                <section className="lesson-topic-complete">
                  <strong>Topic complete</strong>
                  <p>
                    You completed every activity in this
                    topic.
                  </p>
                </section>
              ) : null}

              <nav
                className="lesson-card-navigation"
                aria-label="Lesson card navigation"
              >
                <button
                  type="button"
                  onClick={() =>
                    void goPrevious()
                  }
                  disabled={
                    !previousPosition || isSaving
                  }
                >
                  ← Previous
                </button>

                <span>
                  {saveError ??
                    (
                      !canGoNext &&
                      nextPosition === null &&
                      !topicCompleteAfterAction
                        ? "Complete this activity to continue."
                        : ""
                    )}
                </span>

                <button
                  type="button"
                  className="is-primary"
                  data-testid="lesson-next-button"
                  onClick={() => void goNext()}
                  disabled={
                    !canGoNext || isSaving
                  }
                >
                  {nextCrossesTopic
                    ? "Next topic"
                    : "Next"}{" "}
                  →
                </button>
              </nav>

              {progressState.status === "error" ? (
                <div className="lesson-progress-warning">
                  {progressState.message}
                </div>
              ) : null}
            </>
          ) : (
            <section className="lesson-host-state">
              <strong>
                {activeTopic
                  ? "No lesson cards found"
                  : "No topics found"}
              </strong>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
