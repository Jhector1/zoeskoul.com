import {
  type MouseEventHandler,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";

export type LessonReviewSaveStatus =
  | "idle"
  | "saving"
  | "saved"
  | "error";

export type LessonReviewTopicItem = {
  id: string;
  label: string;
  summary?: string | null;
  disabled?: boolean;
  done?: boolean;
  active?: boolean;
};

export type LessonReviewSectionItem = {
  id: string;
  label: string;
  summary?: string | null;
  topics: LessonReviewTopicItem[];
};

export type LessonReviewProgressStatus =
  | "complete"
  | "active"
  | "upcoming";

function saveLabel(
  status: LessonReviewSaveStatus,
): string {
  switch (status) {
    case "saving":
      return "Saving…";
    case "saved":
      return "Saved";
    case "error":
      return "Save failed";
    default:
      return "";
  }
}

function LessonTopicSidebar(props: {
  moduleTitle: string;
  moduleDescription?: string | null;
  sections: LessonReviewSectionItem[];
  activeTopicId?: string | null;
  onSelectTopic: (topicId: string) => void;
  onClose?: () => void;
}) {
  const activeSectionId = useMemo(
    () =>
      props.sections.find((section) =>
        section.topics.some(
          (topic) =>
            topic.id === props.activeTopicId ||
            topic.active,
        ),
      )?.id ??
      props.sections[0]?.id ??
      "",
    [props.activeTopicId, props.sections],
  );
  const [openSectionId, setOpenSectionId] =
    useState(activeSectionId);

  useEffect(() => {
    if (activeSectionId) {
      setOpenSectionId(activeSectionId);
    }
  }, [activeSectionId]);

  const topics = props.sections.flatMap(
    (section) => section.topics,
  );
  const completed = topics.filter(
    (topic) => topic.done,
  ).length;
  const percent = topics.length
    ? Math.round((completed / topics.length) * 100)
    : 0;

  return (
    <div className="zoe-review-sidebar" data-testid="lesson-review-sidebar">
      <div className="zoe-review-sidebar__header">
        <div className="zoe-review-sidebar__heading-row">
          <div className="zoe-review-sidebar__heading-copy">
            <strong>{props.moduleTitle}</strong>
            {props.moduleDescription ? (
              <span>{props.moduleDescription}</span>
            ) : null}
          </div>

          {props.onClose ? (
            <button
              type="button"
              className="zoe-review-icon-button zoe-review-sidebar__close"
              onClick={props.onClose}
              aria-label="Close topics"
            >
              ×
            </button>
          ) : null}
        </div>

        <div className="zoe-review-sidebar__progress-label">
          <span>Topics</span>
          <strong>
            {completed}/{topics.length}
          </strong>
        </div>
        <div
          className="zoe-review-sidebar__progress-track"
          aria-hidden="true"
        >
          <span style={{ width: `${percent}%` }} />
        </div>
      </div>

      <div className="zoe-review-sidebar__sections">
        {props.sections.map((section) => {
          const sectionCompleted =
            section.topics.filter(
              (topic) => topic.done,
            ).length;
          const sectionDone =
            section.topics.length > 0 &&
            sectionCompleted === section.topics.length;
          const sectionStarted =
            sectionCompleted > 0 && !sectionDone;
          const sectionActive = section.topics.some(
            (topic) =>
              topic.id === props.activeTopicId ||
              topic.active,
          );
          const open = openSectionId === section.id;

          return (
            <section
              key={section.id}
              className={[
                "zoe-review-sidebar__section",
                sectionDone ? "is-complete" : "",
                sectionStarted ? "is-started" : "",
                sectionActive ? "is-active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <button
                type="button"
                className="zoe-review-sidebar__section-toggle"
                aria-expanded={open}
                onClick={() =>
                  setOpenSectionId((current) =>
                    current === section.id
                      ? ""
                      : section.id,
                  )
                }
              >
                <span
                  className={[
                    "zoe-review-sidebar__chevron",
                    open ? "is-open" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-hidden="true"
                >
                  ▸
                </span>
                <span
                  className="zoe-review-sidebar__section-dot"
                  aria-hidden="true"
                />
                <span className="zoe-review-sidebar__section-title">
                  {section.label}
                </span>
                <span className="zoe-review-sidebar__section-count">
                  {sectionDone
                    ? "✓"
                    : `${sectionCompleted}/${section.topics.length}`}
                </span>
              </button>

              {section.summary ? (
                <p className="zoe-review-sidebar__section-summary">
                  {section.summary}
                </p>
              ) : null}

              <div
                className={[
                  "zoe-review-sidebar__topic-list-wrap",
                  open ? "is-open" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="zoe-review-sidebar__topic-list">
                  {section.topics.map((topic) => (
                    <button
                      key={topic.id}
                      type="button"
                      data-topic-id={topic.id}
                      className={[
                        "zoe-review-topic-button",
                        topic.active ? "is-active" : "",
                        topic.done ? "is-complete" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      disabled={topic.disabled}
                      title={
                        topic.disabled
                          ? "Complete the previous topic first."
                          : undefined
                      }
                      onClick={() => {
                        props.onSelectTopic(topic.id);
                        props.onClose?.();
                      }}
                    >
                      <span
                        className="zoe-review-topic-button__dot"
                        aria-hidden="true"
                      />
                      <span className="zoe-review-topic-button__copy">
                        <strong>{topic.label}</strong>
                        {topic.summary ? (
                          <small>{topic.summary}</small>
                        ) : null}
                      </span>
                      {topic.done ? (
                        <span
                          className="zoe-review-topic-button__done"
                          aria-label="Complete"
                        >
                          ✓
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function LessonReviewShell(props: {
  brand?: string;
  homeHref: string;
  onHome?: MouseEventHandler<HTMLAnchorElement>;
  moduleHref: string;
  onModule?: MouseEventHandler<HTMLAnchorElement>;
  moduleTitle: string;
  moduleDescription?: string | null;
  sections: LessonReviewSectionItem[];
  activeTopicId?: string | null;
  onSelectTopic: (topicId: string) => void;
  saveStatus?: LessonReviewSaveStatus;
  saveError?: string | null;
  navigation?: ReactNode;
  children: ReactNode;
}) {
  const [mobileTopicsOpen, setMobileTopicsOpen] =
    useState(false);
  const status = props.saveStatus ?? "idle";
  const statusLabel = saveLabel(status);

  useEffect(() => {
    setMobileTopicsOpen(false);
  }, [props.activeTopicId]);

  return (
    <div className="zoe-review-shell" data-testid="student-review-shell">
      <header className="zoe-review-header">
        <a
          href={props.homeHref}
          onClick={props.onHome}
          className="zoe-review-brand"
        >
          <span className="zoe-review-brand__mark" aria-hidden="true">
            Z
          </span>
          <span className="zoe-review-brand__copy">
            <strong>{props.brand ?? "ZoeSkoul"}</strong>
            <small>Learn</small>
          </span>
        </a>

        <div className="zoe-review-header__module">
          <span>Module</span>
          <strong>{props.moduleTitle}</strong>
        </div>

        <div className="zoe-review-header__actions">
          {statusLabel ? (
            <span
              className={[
                "zoe-review-save-status",
                status === "error" ? "is-error" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              title={props.saveError ?? undefined}
              aria-live="polite"
            >
              {statusLabel}
            </span>
          ) : null}

          <a
            href={props.moduleHref}
            onClick={props.onModule}
            className="zoe-review-button zoe-review-button--secondary zoe-review-header__modules"
          >
            Modules
          </a>

          <button
            type="button"
            className="zoe-review-button zoe-review-button--secondary zoe-review-header__topics"
            onClick={() => setMobileTopicsOpen(true)}
          >
            Topics
          </button>
        </div>
      </header>

      <div className="zoe-review-shell__body">
        <aside className="zoe-review-shell__sidebar">
          <LessonTopicSidebar
            moduleTitle={props.moduleTitle}
            moduleDescription={props.moduleDescription}
            sections={props.sections}
            activeTopicId={props.activeTopicId}
            onSelectTopic={props.onSelectTopic}
          />
        </aside>

        <main className="zoe-review-shell__main">
          {props.children}
        </main>
      </div>

      {mobileTopicsOpen ? (
        <div className="zoe-review-mobile-topics" role="dialog" aria-modal="true">
          <button
            type="button"
            className="zoe-review-mobile-topics__backdrop"
            onClick={() => setMobileTopicsOpen(false)}
            aria-label="Close topics"
          />
          <aside className="zoe-review-mobile-topics__panel">
            <LessonTopicSidebar
              moduleTitle={props.moduleTitle}
              moduleDescription={props.moduleDescription}
              sections={props.sections}
              activeTopicId={props.activeTopicId}
              onSelectTopic={props.onSelectTopic}
              onClose={() => setMobileTopicsOpen(false)}
            />
          </aside>
        </div>
      ) : null}

      {props.navigation}
    </div>
  );
}

export function LessonTopicStage(props: {
  title: string;
  subtitle?: string | null;
  progress?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="zoe-review-topic-stage">
      <div className="zoe-review-topic-stage__sticky">
        <div className="zoe-review-topic-shell">
          <div className="zoe-review-topic-shell__title">
            {props.title}
          </div>
          {props.subtitle ? (
            <div className="zoe-review-topic-shell__subtitle">
              {props.subtitle}
            </div>
          ) : null}
          {props.progress}
        </div>
      </div>
      <div className="zoe-review-topic-stage__content">
        {props.children}
      </div>
    </section>
  );
}

export function LessonActivityProgress(props: {
  label?: string;
  activeIndex: number;
  statuses: LessonReviewProgressStatus[];
}) {
  if (!props.statuses.length) return null;

  const safeIndex = Math.max(
    0,
    Math.min(
      props.activeIndex,
      props.statuses.length - 1,
    ),
  );
  const label = props.label ?? "Lesson";

  return (
    <div
      className="zoe-review-activity-progress"
      role="progressbar"
      aria-label={`${label} ${safeIndex + 1} of ${props.statuses.length}`}
      aria-valuemin={1}
      aria-valuemax={props.statuses.length}
      aria-valuenow={safeIndex + 1}
      data-testid="review-learning-progress"
    >
      <strong>
        {label} {safeIndex + 1} of {props.statuses.length}
      </strong>
      <ol aria-hidden="true">
        {props.statuses.map((status, index) => (
          <li key={`${index}:${status}`}>
            {index > 0 ? (
              <span
                className={[
                  "zoe-review-activity-progress__connector",
                  props.statuses[index - 1] === "complete"
                    ? "is-complete"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
            ) : null}
            <span
              className={[
                "zoe-review-activity-progress__step",
                status === "complete" ? "is-complete" : "",
                index === safeIndex || status === "active"
                  ? "is-active"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

export function LessonFloatingNavigation(props: {
  previousLabel?: string;
  nextLabel?: string;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
  busy?: boolean;
  message?: string | null;
  onPrevious: () => void;
  onNext: () => void;
  nextTestId?: string;
}) {
  const previousDisabled =
    props.busy === true ||
    props.previousDisabled === true;
  const nextDisabled =
    props.busy === true ||
    props.nextDisabled === true;

  return (
    <div className="zoe-review-floating-nav">
      <div className="zoe-review-floating-nav__inner">
        {props.message ? (
          <div
            className="zoe-review-floating-nav__message"
            aria-live="polite"
          >
            {props.message}
          </div>
        ) : null}

        <div className="zoe-review-floating-nav__bar">
          <button
            type="button"
            className="zoe-review-button zoe-review-button--secondary"
            disabled={previousDisabled}
            onClick={props.onPrevious}
          >
            <span aria-hidden="true">←</span>
            <span>{props.previousLabel ?? "Previous"}</span>
          </button>

          <button
            type="button"
            className={[
              "zoe-review-button",
              nextDisabled
                ? "zoe-review-button--disabled"
                : "zoe-review-button--primary",
            ].join(" ")}
            disabled={nextDisabled}
            onClick={props.onNext}
            data-testid={props.nextTestId}
          >
            <span>{props.nextLabel ?? "Next"}</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
