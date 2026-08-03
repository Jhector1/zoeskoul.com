import {
  createStudentPracticeClient,
  type LearningPracticeLaunchResponse,
  type LearningPracticeValidationResponse,
  type LearningSimplePracticeAnswer,
} from "@zoeskoul/learning-client";
import type {
  LearningLessonRuntimeCard,
} from "@zoeskoul/learning-client";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  isNotMigratedError,
  isRecord,
  messageFromError,
  practiceFeedbackText,
  studentSubmissionId,
} from "./studentPracticeUi";

type PracticeOption = {
  id: string;
  label: string;
};

type LoadState =
  | {
      status: "loading";
    }
  | {
      status: "ready";
      launch: LearningPracticeLaunchResponse;
    }
  | {
      status: "unsupported";
      message: string;
    }
  | {
      status: "error";
      message: string;
    };

function practiceOptions(
  launch: LearningPracticeLaunchResponse,
): PracticeOption[] {
  const source = launch.exercise.payload.options;
  if (!Array.isArray(source)) return [];

  return source.flatMap((value) => {
    if (!isRecord(value)) return [];

    const id =
      typeof value.id === "string"
        ? value.id.trim()
        : "";
    const label =
      typeof value.label === "string"
        ? value.label.trim()
        : "";

    return id && label
      ? [{ id, label }]
      : [];
  });
}

export function StudentSimpleQuizCard(props: {
  apiOrigin: string;
  subjectSlug: string;
  moduleSlug: string;
  card: LearningLessonRuntimeCard;
  completed: boolean;
  disabled: boolean;
  onComplete: () => Promise<void>;
  onOpenLegacy: () => Promise<void>;
}) {
  const client = useMemo(
    () =>
      createStudentPracticeClient({
        apiOrigin: props.apiOrigin,
      }),
    [props.apiOrigin],
  );
  const [reloadRevision, setReloadRevision] =
    useState(0);
  const [loadState, setLoadState] =
    useState<LoadState>({
      status: "loading",
    });
  const [singleOptionId, setSingleOptionId] =
    useState("");
  const [multiOptionIds, setMultiOptionIds] =
    useState<string[]>([]);
  const [numericValue, setNumericValue] =
    useState("");
  const [validation, setValidation] =
    useState<LearningPracticeValidationResponse | null>(
      null,
    );
  const [submitError, setSubmitError] =
    useState<string | null>(null);
  const [submitting, setSubmitting] =
    useState(false);

  useEffect(() => {
    const controller = new AbortController();

    setLoadState({ status: "loading" });
    setSingleOptionId("");
    setMultiOptionIds([]);
    setNumericValue("");
    setValidation(null);
    setSubmitError(null);
    setSubmitting(false);

    void client
      .launch({
        subjectSlug: props.subjectSlug,
        moduleSlug: props.moduleSlug,
        target: props.card.runtime,
        locale: "en",
        signal: controller.signal,
      })
      .then((launch) => {
        if (controller.signal.aborted) return;

        if (
          launch.exercise.kind !== "single_choice" &&
          launch.exercise.kind !== "multi_choice" &&
          launch.exercise.kind !== "numeric"
        ) {
          setLoadState({
            status: "unsupported",
            message:
              "This quiz opens in the full ZoeSkoul workspace.",
          });
          return;
        }

        setLoadState({
          status: "ready",
          launch,
        });
      })
      .catch((error: unknown) => {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }

        if (isNotMigratedError(error)) {
          setLoadState({
            status: "unsupported",
            message:
              "This quiz opens in the full ZoeSkoul workspace.",
          });
          return;
        }

        setLoadState({
          status: "error",
          message: messageFromError(
            error,
            "The quiz could not be loaded.",
          ),
        });
      });

    return () => {
      controller.abort();
    };
  }, [
    client,
    props.card.runtime.ownerCardId,
    props.card.runtime.targetId,
    props.card.runtime.topicSlug,
    props.moduleSlug,
    props.subjectSlug,
    reloadRevision,
  ]);

  if (loadState.status === "loading") {
    return (
      <section
        className="student-simple-quiz is-loading"
        aria-busy="true"
      >
        <div
          className="student-state-spinner"
          aria-hidden="true"
        />
        <strong>Loading quiz…</strong>
      </section>
    );
  }

  if (loadState.status === "unsupported") {
    return (
      <div className="lesson-runtime-handoff">
        <span>{loadState.message}</span>
        <button
          type="button"
          onClick={() =>
            void props.onOpenLegacy()
          }
          disabled={props.disabled}
        >
          Open quiz
        </button>
      </div>
    );
  }

  if (loadState.status === "error") {
    return (
      <section className="student-simple-quiz is-error">
        <strong>Quiz unavailable</strong>
        <p>{loadState.message}</p>
        <div className="student-simple-quiz-actions">
          <button
            type="button"
            onClick={() =>
              setReloadRevision(
                (revision) => revision + 1,
              )
            }
            disabled={props.disabled}
          >
            Try again
          </button>
          <button
            type="button"
            className="is-secondary"
            onClick={() =>
              void props.onOpenLegacy()
            }
            disabled={props.disabled}
          >
            Open workspace
          </button>
        </div>
      </section>
    );
  }

  const { launch } = loadState;
  const { exercise } = launch;
  const options = practiceOptions(launch);
  const locked =
    props.disabled ||
    props.completed ||
    submitting ||
    validation?.ok === true;

  let answer: LearningSimplePracticeAnswer | null =
    null;

  if (
    exercise.kind === "single_choice" &&
    singleOptionId
  ) {
    answer = {
      kind: "single_choice",
      optionId: singleOptionId,
    };
  } else if (
    exercise.kind === "multi_choice" &&
    multiOptionIds.length > 0
  ) {
    answer = {
      kind: "multi_choice",
      optionIds: [...multiOptionIds].sort(),
    };
  } else if (
    exercise.kind === "numeric" &&
    numericValue.trim()
  ) {
    const value = Number(numericValue);
    if (Number.isFinite(value)) {
      answer = {
        kind: "numeric",
        value,
      };
    }
  }

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!answer || locked) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const result = await client.validate({
        key: launch.key,
        answer,
        submissionId:
          studentSubmissionId(),
      });

      setValidation(result);

      if (result.ok === true) {
        await props.onComplete();
      }
    } catch (error: unknown) {
      setSubmitError(
        messageFromError(
          error,
          "Your answer could not be checked.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="student-simple-quiz"
      data-testid="student-simple-quiz"
      data-owner-card-id={
        props.card.runtime.ownerCardId
      }
      data-exercise-kind={exercise.kind}
      onSubmit={submit}
    >
      <div className="student-simple-quiz-heading">
        <span>{exercise.difficulty}</span>
        <h5>{exercise.title}</h5>
        <p>{exercise.prompt}</p>
      </div>

      {exercise.kind === "single_choice" ? (
        <fieldset disabled={locked}>
          <legend>Choose one answer</legend>
          <div className="student-simple-quiz-options">
            {options.map((option) => (
              <label key={option.id}>
                <input
                  type="radio"
                  data-option-id={option.id}
                  name={`quiz-${props.card.id}`}
                  value={option.id}
                  checked={
                    singleOptionId === option.id
                  }
                  onChange={() =>
                    setSingleOptionId(option.id)
                  }
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : exercise.kind === "multi_choice" ? (
        <fieldset disabled={locked}>
          <legend>Choose every correct answer</legend>
          <div className="student-simple-quiz-options">
            {options.map((option) => (
              <label key={option.id}>
                <input
                  type="checkbox"
                  data-option-id={option.id}
                  value={option.id}
                  checked={multiOptionIds.includes(
                    option.id,
                  )}
                  onChange={() =>
                    setMultiOptionIds((current) =>
                      current.includes(option.id)
                        ? current.filter(
                            (id) => id !== option.id,
                          )
                        : [...current, option.id],
                    )
                  }
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <label className="student-simple-quiz-number">
          <span>Your answer</span>
          <input
            type="number"
            step="any"
            value={numericValue}
            onChange={(event) =>
              setNumericValue(event.target.value)
            }
            disabled={locked}
          />
        </label>
      )}

      {(
        exercise.kind === "single_choice" ||
        exercise.kind === "multi_choice"
      ) && options.length === 0 ? (
        <div className="student-simple-quiz-feedback is-error">
          This quiz does not contain learner-visible options.
        </div>
      ) : null}

      {validation ? (
        <div
          data-testid="student-simple-quiz-feedback"
          className={[
            "student-simple-quiz-feedback",
            validation.ok === true
              ? "is-correct"
              : validation.ok === false
                ? "is-incorrect"
                : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-live="polite"
        >
          <strong>
            {validation.ok === true
              ? "Correct"
              : validation.ok === false
                ? "Try again"
                : "Answer checked"}
          </strong>
          <p>{practiceFeedbackText(validation)}</p>
          {validation.attempts ? (
            <small>
              Attempts used:{" "}
              {validation.attempts.used}
              {validation.attempts.max !== null
                ? ` of ${validation.attempts.max}`
                : ""}
            </small>
          ) : null}
        </div>
      ) : null}

      {submitError ? (
        <div
          className="student-simple-quiz-feedback is-error"
          aria-live="polite"
        >
          {submitError}
        </div>
      ) : null}

      <div className="student-simple-quiz-actions">
        <button
          type="submit"
          data-testid="student-simple-quiz-submit"
          disabled={
            locked ||
            !answer ||
            (
              (
                exercise.kind === "single_choice" ||
                exercise.kind === "multi_choice"
              ) &&
              options.length === 0
            )
          }
        >
          {props.completed || validation?.ok === true
            ? "✓ Complete"
            : submitting
              ? "Checking…"
              : "Check answer"}
        </button>

        <button
          type="button"
          className="is-secondary"
          onClick={() =>
            void props.onOpenLegacy()
          }
          disabled={props.disabled || submitting}
        >
          Open workspace
        </button>
      </div>
    </form>
  );
}
