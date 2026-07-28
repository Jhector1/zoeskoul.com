import {
  ControlledCodeEditor,
} from "@zoeskoul/editor-surface";
import {
  createStudentPracticeClient,
  type LearningLessonTextCard,
  type LearningPracticeLaunchResponse,
  type LearningPracticeValidationResponse,
} from "@zoeskoul/learning-client";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  readStudentPythonTryItStarter,
  type StudentPythonTryItStarter,
} from "./studentEmbeddedTryItData";
import {
  isNotMigratedError,
  messageFromError,
  practiceFeedbackText,
  studentSubmissionId,
} from "./studentPracticeUi";

type LoadState =
  | {
      status: "loading";
    }
  | {
      status: "ready";
      launch: LearningPracticeLaunchResponse;
      starter: StudentPythonTryItStarter;
    }
  | {
      status: "unsupported";
      message: string;
    }
  | {
      status: "error";
      message: string;
    };

export function StudentEmbeddedTryItCard(
  props: {
    apiOrigin: string;
    subjectSlug: string;
    moduleSlug: string;
    card: LearningLessonTextCard;
    passed: boolean;
    disabled: boolean;
    onPass: () => Promise<void>;
    onOpenLegacy: () => Promise<void>;
  },
) {
  const target =
    props.card.runtime;
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
  const [code, setCode] =
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
    const controller =
      new AbortController();

    setLoadState({
      status: "loading",
    });
    setCode("");
    setValidation(null);
    setSubmitError(null);
    setSubmitting(false);

    if (
      !target ||
      target.targetKind !==
        "embedded_try_it" ||
      target.runtimeKind !==
        "try_it" ||
      target.ownerCardId !==
        props.card.id
    ) {
      setLoadState({
        status: "unsupported",
        message:
          "This Try It still uses the current interactive runtime.",
      });

      return () => {
        controller.abort();
      };
    }

    void client
      .launch({
        subjectSlug:
          props.subjectSlug,
        moduleSlug:
          props.moduleSlug,
        target,
        locale: "en",
        signal: controller.signal,
      })
      .then((launch) => {
        if (
          controller.signal.aborted
        ) {
          return;
        }

        const starter =
          readStudentPythonTryItStarter(
            launch,
          );

        if (!starter) {
          setLoadState({
            status: "unsupported",
            message:
              "This Try It still uses the current interactive runtime.",
          });
          return;
        }

        setCode(starter.code);
        setLoadState({
          status: "ready",
          launch,
          starter,
        });
      })
      .catch((error: unknown) => {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }

        if (
          isNotMigratedError(error)
        ) {
          setLoadState({
            status: "unsupported",
            message:
              "This Try It still uses the current interactive runtime.",
          });
          return;
        }

        setLoadState({
          status: "error",
          message:
            messageFromError(
              error,
              "The Try It could not be loaded.",
            ),
        });
      });

    return () => {
      controller.abort();
    };
  }, [
    client,
    props.card.id,
    props.moduleSlug,
    props.subjectSlug,
    reloadRevision,
    target,
  ]);

  if (
    loadState.status === "loading"
  ) {
    return (
      <section
        className="student-embedded-try-it is-loading"
        aria-busy="true"
      >
        <div
          className="student-state-spinner"
          aria-hidden="true"
        />
        <strong>
          Loading Try It…
        </strong>
      </section>
    );
  }

  if (
    loadState.status ===
    "unsupported"
  ) {
    return (
      <div className="lesson-runtime-handoff">
        <span>
          {loadState.message}
        </span>
        <button
          type="button"
          onClick={() =>
            void props.onOpenLegacy()
          }
          disabled={props.disabled}
        >
          Open Try It
        </button>
      </div>
    );
  }

  if (
    loadState.status === "error"
  ) {
    return (
      <section className="student-embedded-try-it is-error">
        <strong>
          Try It unavailable
        </strong>
        <p>{loadState.message}</p>
        <div className="student-embedded-try-it-actions">
          <button
            type="button"
            onClick={() =>
              setReloadRevision(
                (revision) =>
                  revision + 1,
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
            Open current runtime
          </button>
        </div>
      </section>
    );
  }

  const {
    launch,
    starter,
  } = loadState;
  const locked =
    props.disabled ||
    props.passed ||
    submitting ||
    validation?.ok === true;
  const modelKey = [
    props.subjectSlug,
    props.moduleSlug,
    launch.target.topicSlug,
    launch.target.targetId,
  ].join("/");

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (locked) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const result =
        await client.validate({
          key: launch.key,
          answer: {
            kind: "code_input",
            language: "python",
            code,
            source: code,
            stdin: "",
            entry: "main.py",
            files: [
              {
                kind: "file",
                path: "main.py",
                content: code,
              },
            ],
          },
          submissionId:
            studentSubmissionId(),
        });

      setValidation(result);

      if (result.ok === true) {
        await props.onPass();
      }
    } catch (error: unknown) {
      setSubmitError(
        messageFromError(
          error,
          "Your code could not be checked.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="student-embedded-try-it"
      data-testid="student-embedded-try-it"
      data-owner-card-id={
        props.card.id
      }
      data-target-id={
        launch.target.targetId
      }
      onSubmit={submit}
    >
      <div className="student-embedded-try-it-heading">
        <span>
          {launch.exercise.difficulty}
        </span>
        <h5>
          {launch.exercise.title}
        </h5>
        <p>
          {launch.exercise.prompt}
        </p>
      </div>

      <div className="student-embedded-try-it-filebar">
        <strong>main.py</strong>
        <span>
          Protected Python practice
        </span>
      </div>

      <ControlledCodeEditor
        value={code}
        onChange={(next) => {
          setCode(next);
          setValidation(null);
          setSubmitError(null);
        }}
        language="python"
        modelKey={modelKey}
        fileName="main.py"
        height={
          starter.editorHeight
        }
        readOnly={locked}
        ariaLabel={
          `${launch.exercise.title} code editor`
        }
      />

      {validation ? (
        <div
          data-testid="student-embedded-try-it-feedback"
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
                : "Code checked"}
          </strong>
          <p>
            {practiceFeedbackText(
              validation,
            )}
          </p>
          {validation.attempts ? (
            <small>
              Attempts used:{" "}
              {
                validation.attempts
                  .used
              }
              {validation.attempts
                .max !== null
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

      <div className="student-embedded-try-it-actions">
        <button
          type="submit"
          data-testid="student-embedded-try-it-submit"
          disabled={locked}
        >
          {props.passed ||
          validation?.ok === true
            ? "✓ Passed"
            : submitting
              ? "Checking…"
              : "Check answer"}
        </button>

        <button
          type="button"
          className="is-secondary"
          onClick={() => {
            setCode(starter.code);
            setValidation(null);
            setSubmitError(null);
          }}
          disabled={
            locked ||
            code === starter.code
          }
        >
          Reset
        </button>

        <button
          type="button"
          className="is-secondary"
          onClick={() =>
            void props.onOpenLegacy()
          }
          disabled={
            props.disabled ||
            submitting
          }
        >
          Open current runtime
        </button>
      </div>

      {props.passed ? (
        <p className="student-embedded-try-it-next">
          Try It passed. Select Next to
          complete this reading card.
        </p>
      ) : null}
    </form>
  );
}
