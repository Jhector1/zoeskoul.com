import {
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
} from "react";

import DailyFivePracticeClient from "@/routes/(public)/[locale]/(learningZone)/practice/daily/daily-five-practice-client";
import PracticeClient from "@/routes/(public)/[locale]/(learningZone)/subjects/[subjectSlug]/modules/[moduleSlug]/practice/practice-client";

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
    locale: string;
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

    void fetch(
      `/api/student-ui/practice/daily?${query.toString()}`,
      {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        const payload =
          await response
            .json()
            .catch(() => null);

        if (
          !response.ok ||
          !payload
        ) {
          throw new Error(
            String(
              payload?.error ??
              "Daily Practice could not be loaded.",
            ),
          );
        }

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
  }, [props.locale]);

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
    />
  );
}

const PRACTICE_MODES =
  new Set([
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
    "standard";
  const mode =
    PRACTICE_MODES.has(rawMode)
      ? rawMode
      : "standard";

  return (
    <PracticeClient
      subjectSlug={
        props.subjectSlug
      }
      moduleSlug={
        props.moduleSlug
      }
      sessionId={
        query.get("sessionId")
      }
      initialExperienceMode={
        mode as ComponentProps<
          typeof PracticeClient
        >["initialExperienceMode"]
      }
    />
  );
}
