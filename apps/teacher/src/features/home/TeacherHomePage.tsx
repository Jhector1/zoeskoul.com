import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  TeacherLink,
} from "../../app/TeacherLink";
import {
  useTranslations,
} from "../../compat/next-intl";
import {
  createTeacherClassesClient,
  type TeacherClass,
} from "../classes/teacherClassesClient";
import {
  loadTeacherTutoringOverview,
} from "../tutoring/teacherTutoringClient";

export function TeacherHomePage(props: {
  apiOrigin: string;
  locale: string;
}) {
  const t = useTranslations("Teacher.home");
  const classesClient = useMemo(
    () =>
      createTeacherClassesClient({
        apiOrigin: props.apiOrigin,
      }),
    [props.apiOrigin],
  );

  const [classes, setClasses] = useState<TeacherClass[] | null>(null);
  const [classesError, setClassesError] = useState(false);
  const [tutoring, setTutoring] = useState<{
    pending: number;
    scheduled: number;
  } | null>(null);
  const [tutoringError, setTutoringError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setClassesError(false);
    setTutoringError(false);

    void Promise.allSettled([
      classesClient.list(),
      loadTeacherTutoringOverview(props.apiOrigin),
    ]).then(([classesResult, tutoringResult]) => {
      if (cancelled) return;

      if (classesResult.status === "fulfilled") {
        setClasses(classesResult.value.groups);
      } else {
        setClasses(null);
        setClassesError(true);
      }

      if (tutoringResult.status === "fulfilled") {
        const requests = tutoringResult.value.requests;
        setTutoring({
          pending: requests.filter(
            (request) =>
              request.status === "requested" ||
              request.status === "assigned",
          ).length,
          scheduled: requests.filter(
            (request) => request.status === "scheduled",
          ).length,
        });
      } else {
        setTutoring(null);
        setTutoringError(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [classesClient, props.apiOrigin, refreshKey]);

  const openClasses = (classes ?? []).filter(
    (group) => group.status === "open",
  );
  const hasError = classesError || tutoringError;

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="max-w-3xl">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {t("kicker")}
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-2 text-sm leading-6 text-neutral-500">
          {t("subtitle")}
        </p>
      </div>

      <section className="mt-7 grid gap-4 md:grid-cols-3">
        <TeacherLink
          href="/classes/new"
          locale={props.locale}
          className="ui-surface group rounded-xl p-5 transition hover:-translate-y-0.5 hover:border-[rgb(var(--ui-border-strong)/0.72)] hover:bg-[rgb(var(--ui-surface-2)/1)]"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {t("actions.class.kicker")}
          </div>
          <div className="mt-2 text-lg font-semibold">
            {t("actions.class.title")}
          </div>
          <p className="mt-2 text-sm leading-6 text-neutral-500">
            {t("actions.class.body")}
          </p>
          <div className="mt-4 text-sm font-medium">
            {t("actions.class.cta")} →
          </div>
        </TeacherLink>

        <TeacherLink
          href="/tutoring"
          locale={props.locale}
          className="ui-surface group rounded-xl p-5 transition hover:-translate-y-0.5 hover:border-[rgb(var(--ui-border-strong)/0.72)] hover:bg-[rgb(var(--ui-surface-2)/1)]"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {t("actions.tutoring.kicker")}
          </div>
          <div className="mt-2 text-lg font-semibold">
            {t("actions.tutoring.title")}
          </div>
          <p className="mt-2 text-sm leading-6 text-neutral-500">
            {t("actions.tutoring.body")}
          </p>
          <div className="mt-4 text-sm font-medium">
            {t("actions.tutoring.cta")} →
          </div>
        </TeacherLink>

        <TeacherLink
          href="/institution"
          locale={props.locale}
          className="ui-surface group rounded-xl p-5 transition hover:-translate-y-0.5 hover:border-[rgb(var(--ui-border-strong)/0.72)] hover:bg-[rgb(var(--ui-surface-2)/1)]"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {t("actions.institution.kicker")}
          </div>
          <div className="mt-2 text-lg font-semibold">
            {t("actions.institution.title")}
          </div>
          <p className="mt-2 text-sm leading-6 text-neutral-500">
            {t("actions.institution.body")}
          </p>
          <div className="mt-4 text-sm font-medium">
            {t("actions.institution.cta")} →
          </div>
        </TeacherLink>
      </section>

      {hasError ? (
        <div
          className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
          role="alert"
        >
          <span>{t("loadError.message")}</span>
          <button
            type="button"
            className="ui-btn-secondary h-9 px-4"
            onClick={() => setRefreshKey((value) => value + 1)}
          >
            {t("loadError.retry")}
          </button>
        </div>
      ) : null}

      <section className="mt-8">
        <h2 className="text-lg font-semibold">{t("overview.title")}</h2>
        <p className="mt-1 text-sm text-neutral-500">
          {t("overview.subtitle")}
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="ui-surface rounded-xl p-4">
            <div className="text-xs text-neutral-500">
              {t("overview.classes")}
            </div>
            <div className="mt-1 text-2xl font-semibold">
              {classesError
                ? t("loadError.unavailable")
                : classes === null
                  ? "—"
                  : openClasses.length}
            </div>
          </div>
          <div className="ui-surface rounded-xl p-4">
            <div className="text-xs text-neutral-500">
              {t("overview.pendingTutoring")}
            </div>
            <div className="mt-1 text-2xl font-semibold">
              {tutoringError
                ? t("loadError.unavailable")
                : tutoring === null
                  ? "—"
                  : tutoring.pending}
            </div>
          </div>
          <div className="ui-surface rounded-xl p-4">
            <div className="text-xs text-neutral-500">
              {t("overview.scheduledTutoring")}
            </div>
            <div className="mt-1 text-2xl font-semibold">
              {tutoringError
                ? t("loadError.unavailable")
                : tutoring === null
                  ? "—"
                  : tutoring.scheduled}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">
            {t("recentClasses.title")}
          </h2>
          <TeacherLink
            href="/classes"
            locale={props.locale}
            className="text-sm font-medium hover:underline"
          >
            {t("recentClasses.viewAll")}
          </TeacherLink>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {classesError ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
              {t("recentClasses.error")}
            </div>
          ) : classes === null ? (
            <div className="ui-surface rounded-xl p-5 text-sm text-neutral-500">
              {t("recentClasses.loading")}
            </div>
          ) : openClasses.length ? (
            openClasses.slice(0, 4).map((group) => (
              <TeacherLink
                key={group.id}
                href={`/classes/${group.id}`}
                locale={props.locale}
                className="ui-surface block rounded-xl p-4 transition hover:border-[rgb(var(--ui-border-strong)/0.72)] hover:bg-[rgb(var(--ui-surface-2)/1)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="font-medium">{group.name}</div>
                  <span className="ui-pill-neutral shrink-0 text-xs">
                    {t(`classStatus.${group.status}`)}
                  </span>
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  {group.organization?.name ?? t("recentClasses.independent")}
                  {" · "}
                  {t("recentClasses.meta", {
                    students: group.members.length,
                    assignments: group._count?.assignments ?? 0,
                  })}
                </div>
              </TeacherLink>
            ))
          ) : (
            <div className="ui-surface rounded-xl p-5 text-sm text-neutral-500">
              {t("recentClasses.empty")}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
