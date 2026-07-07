"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import PracticeShell from "@/components/practice/PracticeShell";
import { usePracticeController } from "@/features/practice/client/usePracticeController";

type StartResult = {
  sessionId: string;
  subjectSlug: string | null;
  moduleSlug: string | null;
  experienceMode: "daily_five";
};

type DailySubjectOption = {
  subjectSlug: string;
  subjectTitle: string;
  catalogSlug: string;
  catalogTitle: string;
  eligibleExerciseCount: number;
  eligibleModuleCount: number;
};

type SelectionResponse = {
  code: "DAILY_SUBJECT_REQUIRED";
  message?: string;
  targetCount: number;
  subjects: DailySubjectOption[];
};

function DailyFiveShell({ result }: { result: StartResult }) {
  const t = useTranslations("Practice");
  const { shellProps } = usePracticeController({
    sessionId: result.sessionId,
    subjectSlug: result.subjectSlug ?? undefined,
    moduleSlug: result.moduleSlug ?? undefined,
    authoritativeSessionId: true,
    expectedExperienceMode: "daily_five",
    clientStatePersistence: "off",
  });
  return <PracticeShell {...shellProps} t={t} />;
}

function DailySubjectPicker(props: {
  subjects: DailySubjectOption[];
  targetCount: number;
  busy: boolean;
  error: string | null;
  onSelect: (subjectSlug: string) => void;
}) {
  const t = useTranslations("Practice.dailyStart");

  return (
    <main className="min-h-dvh bg-[rgb(var(--ui-bg))] px-4 py-8 text-[rgb(var(--ui-text))] sm:px-6 lg:py-12">
      <div className="mx-auto grid max-w-5xl gap-5">
        <section className="ui-page-surface overflow-hidden">
          <div className="border-b border-[rgb(var(--ui-border)/0.82)] bg-[rgb(var(--ui-surface-2)/0.72)] px-5 py-5 sm:px-7 sm:py-7">
            <div className="ui-kicker">{t("kicker")}</div>
            <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
              {t("title")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[rgb(var(--ui-text-muted))] sm:text-base">
              {t("subtitle", { count: props.targetCount })}
            </p>
          </div>

          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
            {props.subjects.map((subject) => (
              <button
                key={subject.subjectSlug}
                type="button"
                disabled={props.busy}
                onClick={() => props.onSelect(subject.subjectSlug)}
                className="group rounded-2xl border border-[rgb(var(--ui-border)/0.86)] bg-[rgb(var(--ui-surface)/0.92)] p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[rgb(var(--ui-primary)/0.46)] hover:shadow-md disabled:cursor-wait disabled:opacity-60"
              >
                <div className="text-[11px] font-black uppercase tracking-[0.16em] text-[rgb(var(--ui-text-muted)/0.8)]">
                  {subject.catalogTitle}
                </div>
                <div className="mt-2 text-lg font-black tracking-tight">
                  {subject.subjectTitle}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="ui-pill-neutral">
                    {t("exerciseCount", { count: subject.eligibleExerciseCount })}
                  </span>
                  <span className="ui-pill-neutral">
                    {t("moduleCount", { count: subject.eligibleModuleCount })}
                  </span>
                </div>
                <div className="mt-5 text-sm font-black text-[rgb(var(--ui-primary))]">
                  {props.busy ? t("starting") : t("start")}
                </div>
              </button>
            ))}
          </div>
        </section>

        {props.error ? (
          <div className="ui-surface-danger p-4 text-sm font-semibold">
            {props.error}
          </div>
        ) : null}

        {!props.subjects.length ? (
          <div className="ui-page-surface p-5 text-sm text-[rgb(var(--ui-text-muted))]">
            {t("empty", { count: props.targetCount })}
          </div>
        ) : null}
      </div>
    </main>
  );
}

export default function DailyFivePracticeClient(props: {
  locale: string;
  subjectSlug: string | null;
}) {
  const [result, setResult] = useState<StartResult | null>(null);
  const [subjects, setSubjects] = useState<DailySubjectOption[] | null>(null);
  const [targetCount, setTargetCount] = useState(3);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(
    async (subjectSlug?: string | null) => {
      setBusy(true);
      setError(null);

      try {
        const response = await fetch("/api/practice/daily/start", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locale: props.locale,
            subjectSlug: subjectSlug || undefined,
          }),
        });
        const data = await response.json().catch(() => null);

        if (
          response.ok &&
          data?.sessionId &&
          data?.experienceMode === "daily_five"
        ) {
          setSubjects(null);
          setResult(data as StartResult);
          return;
        }

        if (response.ok && data?.sessionId) {
          setError("Daily Practice received an incompatible session. Please try again.");
          return;
        }

        if (data?.code === "DAILY_SUBJECT_REQUIRED") {
          const selection = data as SelectionResponse;
          setSubjects(Array.isArray(selection.subjects) ? selection.subjects : []);
          setTargetCount(Number(selection.targetCount) || 3);
          if (subjectSlug) setError(String(selection.message ?? "Choose another subject."));
          return;
        }

        setError(String(data?.message ?? "Could not start today’s daily practice."));
      } catch {
        setError("Could not start today’s daily practice.");
      } finally {
        setBusy(false);
      }
    },
    [props.locale],
  );

  useEffect(() => {
    void start(props.subjectSlug);
  }, [props.subjectSlug, start]);

  if (result) {
    return <DailyFiveShell key={result.sessionId} result={result} />;
  }

  if (subjects) {
    return (
      <DailySubjectPicker
        subjects={subjects}
        targetCount={targetCount}
        busy={busy}
        error={error}
        onSelect={(subjectSlug) => void start(subjectSlug)}
      />
    );
  }

  if (error) {
    return (
      <div className="ui-container py-10">
        <div className="ui-surface-danger p-5">{error}</div>
      </div>
    );
  }

  return (
    <div className="ui-container py-10">
      <div className="ui-page-surface p-5">Preparing today’s daily practice…</div>
    </div>
  );
}
