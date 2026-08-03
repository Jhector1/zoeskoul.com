import {
  fetchReviewProgressGET,
  type LearningLessonCard,
} from "@zoeskoul/learning-client";
import {
  useLessonContent,
} from "@zoeskoul/learning-client/react";
import {
  LessonActivityProgress,
  LessonFloatingNavigation,
  LessonReviewShell,
  LessonTopicStage,
  type LessonReviewProgressStatus,
  type LessonReviewSectionItem,
} from "@zoeskoul/lesson-shell";
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
  saveStudentReviewProgress,
} from "./studentProgressPersistence";
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

function runtimeActivityLabel(
  kind: string,
): string {
  const normalized = String(kind ?? "activity")
    .replace(/_/g, " ")
    .trim();

  return normalized || "activity";
}

function runtimeActionLabel(
  kind: string,
): string {
  const label = runtimeActivityLabel(kind);
  return `Open ${label}`;
}

function embeddedTryItTarget(
  card: LearningLessonCard | null,
) {
  if (!card) return null;

  const target =
    card.type === "text"
      ? card.runtime
      : card.type === "runtime"
        ? card.embeddedRuntime
        : null;

  return (
    target?.targetKind ===
      "embedded_try_it" &&
    target.runtimeKind === "try_it" &&
    target.ownerCardId === card.id
  )
    ? target
    : null;
}

function completionMessage(
  card: LearningLessonCard | null,
): string {
  if (!card) {
    return "Complete this activity to continue.";
  }

  if (embeddedTryItTarget(card)) {
    return "Complete this Try It to continue.";
  }

  if (card.type === "runtime") {
    return (
      `Complete this ${runtimeActivityLabel(
        card.runtimeKind,
      )} to continue.`
    );
  }

  if (card.type === "video") {
    return "Mark this video as watched to continue.";
  }

  if (card.runtimeRequired) {
    return "Complete this Try It to continue.";
  }

  return "Mark this lesson as read to continue.";
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
    activeCard &&
    (
      activeCard.type === "text" ||
      activeCard.type === "runtime"
    ) &&
    embeddedTryItTarget(activeCard)
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
        await saveStudentReviewProgress({
          apiOrigin: props.apiOrigin,
          subjectSlug: props.subjectSlug,
          moduleSlug: props.moduleSlug,
          locale: "en",
          state: next,
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
      (
        activeCard.type !== "text" &&
        activeCard.type !== "runtime"
      ) ||
      !embeddedTryItTarget(
        activeCard,
      ) ||
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
        className="lesson-review-state-page"
        aria-busy="true"
      >
        <div
          className="student-state-spinner"
          aria-hidden="true"
        />
        <strong>Loading lesson</strong>
        <p>
          Loading the lesson and your saved progress.
        </p>
      </section>
    );
  }

  if (lessonState.status === "error") {
    return (
      <section className="lesson-review-state-page">
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

  const shellSections: LessonReviewSectionItem[] =
    lessonState.data.sections.map((section) => ({
      id: section.slug,
      label: section.title,
      topics: section.topics.map((topic) => {
        const topicIndex = topics.findIndex(
          (candidate) =>
            candidate.slug === topic.slug,
        );
        const state = getTopicProgressState(
          progress?.topics,
          topic.slug,
        ).topic;

        return {
          id: topic.slug,
          label: topic.title,
          summary: topic.summary,
          done: isLessonTopicComplete(
            topic.cards,
            state,
          ),
          active:
            activeTopic?.slug === topic.slug,
          disabled: !isLessonTopicUnlocked({
            topics,
            topicIndex,
            progress,
          }),
        };
      }),
    }));

  const activityStatuses: LessonReviewProgressStatus[] =
    activeTopic
      ? activeTopic.cards.map((card, index) => {
          if (
            isLessonCardComplete(
              card,
              topicProgress,
            )
          ) {
            return "complete";
          }

          return index === activeCardIndex
            ? "active"
            : "upcoming";
        })
      : [];

  const navigationMessage =
    saveError ??
    (
      !canGoNext &&
      !topicCompleteAfterAction
        ? completionMessage(activeCard)
        : null
    );

  return (
    <LessonReviewShell
      homeHref="/learning"
      onHome={(event) =>
        navigateStudentApp(event, "/learning")
      }
      moduleHref={backHref}
      onModule={(event) =>
        navigateStudentApp(event, backHref)
      }
      moduleTitle={lessonState.data.module.title}
      moduleDescription={
        lessonState.data.module.description
      }
      sections={shellSections}
      activeTopicId={activeTopic?.slug ?? null}
      onSelectTopic={(topicId) => {
        const topicIndex = topics.findIndex(
          (topic) => topic.slug === topicId,
        );

        if (topicIndex >= 0) {
          void selectTopic(topicIndex);
        }
      }}
      saveStatus={saveState}
      saveError={saveError}
      navigation={
        activeTopic && activeCard ? (
          <LessonFloatingNavigation
            previousDisabled={!previousPosition}
            nextDisabled={!canGoNext}
            busy={isSaving}
            message={navigationMessage}
            onPrevious={() => void goPrevious()}
            onNext={() => void goNext()}
            nextLabel={
              nextCrossesTopic
                ? "Next topic"
                : "Next"
            }
            nextTestId="lesson-next-button"
          />
        ) : null
      }
    >
      {activeTopic && activeCard ? (
        <LessonTopicStage
          title={activeTopic.title}
          subtitle={
            activeTopic.summary ??
            "Work through each lesson card in order."
          }
          progress={
            <LessonActivityProgress
              label="Lesson"
              activeIndex={activeCardIndex}
              statuses={activityStatuses}
            />
          }
        >
          <div className="student-review-topic-content">
            <article
              className="lesson-content-card"
              data-testid="lesson-content-card"
              data-card-id={activeCard.id}
            >
              {activeCard.title ? (
                <header className="lesson-card-title">
                  <h4>{activeCard.title}</h4>
                  {activeCardComplete ? (
                    <span aria-label="Complete">✓</span>
                  ) : null}
                </header>
              ) : null}

              <span
                data-testid="lesson-card-status"
                className="lesson-card-status-sr"
              >
                {activeCardComplete
                  ? "Complete"
                  : "In progress"}
              </span>

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
                      <div>
                        <strong>Try It</strong>
                        <span>
                          Continue this activity in the full
                          ZoeSkoul workspace.
                        </span>
                      </div>
                      <button
                        type="button"
                        className="is-primary"
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
                activeCard.runtimeKind === "sketch" &&
                embeddedTryItTarget(
                  activeCard,
                ) ? (
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
                  <div>
                    <strong>
                      {runtimeActivityLabel(
                        activeCard.runtimeKind,
                      )}
                    </strong>
                    <span>
                      Continue this activity in the full
                      ZoeSkoul workspace.
                    </span>
                  </div>
                  <button
                    type="button"
                    className="is-primary"
                    onClick={() =>
                      void openCurrentRuntime()
                    }
                    disabled={isSaving}
                  >
                    {runtimeActionLabel(
                      activeCard.runtimeKind,
                    )}
                  </button>
                </div>
              )}
            </article>

            {topicComplete && !nextPosition ? (
              <section className="lesson-topic-complete">
                <strong>Topic complete</strong>
                <p>
                  You completed every activity in this
                  topic.
                </p>
              </section>
            ) : null}

            {progressState.status === "error" ? (
              <div className="lesson-progress-warning">
                {progressState.message}
              </div>
            ) : null}
          </div>
        </LessonTopicStage>
      ) : (
        <section className="lesson-host-state">
          <strong>
            {activeTopic
              ? "No lesson cards found"
              : "No topics found"}
          </strong>
        </section>
      )}
    </LessonReviewShell>
  );
}
