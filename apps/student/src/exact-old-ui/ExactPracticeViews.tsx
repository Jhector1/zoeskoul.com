import {
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
} from "react";

import DailyFivePracticeClient from "@student/features/practice/DailyFivePracticeClient";
import PracticeClient from "@student/features/practice/client/PracticeClient";
import {
  resolveLegacyApiUrl,
} from "../compat/LegacyApiBridge";
import {
  loadDailyPracticePayload,
} from "./dailyPracticeBootstrap";

type DailyProps =
  ComponentProps<
    typeof DailyFivePracticeClient
  >;

type DailyState =
  | {
      status: "loading";
    }
  | {
      status: "ready";
      data: DailyProps;
    }
  | {
      status: "error";
      message: string;
    };

function PracticeState(props: {
  title: string;
  message: string;
  busy?: boolean;
}) {
  return (
    <main className="ui-container py-8">
      <section
        className="ui-page-surface p-6"
        aria-busy={props.busy}
      >
        <div className="ui-section-kicker">
          Practice
        </div>
        <h1 className="mt-1 ui-title-md">
          {props.title}
        </h1>
        <p className="mt-2 ui-meta">
          {props.message}
        </p>
      </section>
    </main>
  );
}

export function ExactDailyPracticeView(
  props: {
    apiOrigin: string;
    locale: string;
    catalogSlug?: string;
    subjectSlug?: string;
    moduleSlug?: string;
  },
) {
  const [state, setState] =
    useState<DailyState>({
      status: "loading",
    });

  useEffect(() => {
    const controller =
      new AbortController();
    const query =
      new URLSearchParams(
        window.location.search,
      );

    query.set(
      "locale",
      props.locale,
    );

    const requestUrl =
      resolveLegacyApiUrl({
        rawUrl:
          `/api/student-ui/practice/daily?${query.toString()}`,
        browserUrl:
          window.location.href,
        apiOrigin:
          props.apiOrigin,
      });

    void loadDailyPracticePayload({
      requestUrl,
      signal: controller.signal,
    })
      .then((payload) => {
        setState({
          status: "ready",
          data: payload as DailyProps,
        });
      })
      .catch((error: unknown) => {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }

        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Daily Practice could not be loaded.",
        });
      });

    return () => {
      controller.abort();
    };
  }, [
    props.apiOrigin,
    props.locale,
  ]);

  if (state.status === "loading") {
    return (
      <PracticeState
        title="Loading Daily Practice"
        message="Preparing your current practice path."
        busy
      />
    );
  }

  if (state.status === "error") {
    return (
      <PracticeState
        title="Daily Practice unavailable"
        message={state.message}
      />
    );
  }

  return (
    <DailyFivePracticeClient
      {...state.data}
      initialSelection={{
        ...state.data.initialSelection,
        ...(props.catalogSlug !== undefined
          ? { catalogSlug: props.catalogSlug }
          : {}),
        ...(props.subjectSlug !== undefined
          ? { subjectSlug: props.subjectSlug }
          : {}),
        ...(props.moduleSlug !== undefined
          ? { moduleSlug: props.moduleSlug }
          : {}),
        sectionSlug: "",
        topicSlug: "",
      }}
    />
  );
}

const PRACTICE_MODES =
  new Set([
    "practice",
    "standard",
    "assignment",
    "daily_five",
    "onboarding_trial",
    "challenge",
  ]);

export function ExactModulePracticeView(
  props: {
    subjectSlug: string;
    moduleSlug: string;
  },
) {
  const query = useMemo(
    () =>
      new URLSearchParams(
        window.location.search,
      ),
    [],
  );
  const rawMode =
    query.get("mode") ??
    query.get("experienceMode") ??
    (query.get("sessionId") ? "standard" : "practice");
  const mode =
    PRACTICE_MODES.has(rawMode)
      ? rawMode
      : "practice";
  const sessionId =
    query.get("sessionId");
  const practiceRunId =
    query.get("practiceRunId");
  const practiceRunStartedAt =
    query.get("practiceRunStartedAt");
  if (
    !sessionId &&
    (!practiceRunId || !practiceRunStartedAt)
  ) {
    return (
      <PracticeState
        title="Practice run unavailable"
        message="Start Practice from the Practice entry point."
      />
    );
  }

  return (
    <PracticeClient
      subjectSlug={
        props.subjectSlug
      }
      moduleSlug={
        props.moduleSlug
      }
      sessionId={sessionId}
      initialExperienceMode={
        mode as ComponentProps<
          typeof PracticeClient
        >["initialExperienceMode"]
      }
    />
  );
}
