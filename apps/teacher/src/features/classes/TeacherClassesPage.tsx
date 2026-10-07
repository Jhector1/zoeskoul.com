import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { TeacherLink } from "../../app/TeacherLink";
import { useTranslations } from "../../compat/next-intl";
import {
  createTeacherClassesClient,
  type TeacherClass,
  type TeacherClassStatus,
} from "./teacherClassesClient";

const lifecycleOrder: TeacherClassStatus[] = ["open", "draft", "closed"];

export function TeacherClassesPage(props: {
  apiOrigin: string;
  websiteOrigin: string;
  locale: string;
}) {
  const t = useTranslations("Teacher.classes");
  const client = useMemo(
    () => createTeacherClassesClient({ apiOrigin: props.apiOrigin }),
    [props.apiOrigin],
  );

  const [groups, setGroups] = useState<TeacherClass[] | null>(null);
  const [filter, setFilter] = useState<TeacherClassStatus>("open");
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void client
      .list()
      .then(({ groups }) => {
        if (!cancelled) {
          setGroups(groups);
          setError(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGroups([]);
          setError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client]);

  const counts = useMemo(() => {
    const next: Record<TeacherClassStatus, number> = {
      draft: 0,
      open: 0,
      closed: 0,
    };
    for (const group of groups ?? []) next[group.status] += 1;
    return next;
  }, [groups]);

  const visibleGroups = (groups ?? []).filter((group) => group.status === filter);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {t("kicker")}
          </div>
          <h1 className="mt-1 text-2xl font-semibold">{t("title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">
            {t("subtitle")}
          </p>
        </div>

        <div className="flex gap-2">
          <TeacherLink
            href="/institution"
            locale={props.locale}
            className="ui-btn-secondary h-9 px-4"
          >
            {t("schoolAdmin")}
          </TeacherLink>
          <TeacherLink
            href="/classes/new"
            locale={props.locale}
            className="ui-btn-primary h-9 px-4"
          >
            {t("newGroup")}
          </TeacherLink>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label={t("lifecycle.filterLabel")}>
        {lifecycleOrder.map((status) => (
          <button
            key={status}
            type="button"
            role="tab"
            aria-selected={filter === status}
            onClick={() => setFilter(status)}
            className={[
              "rounded-lg border px-3 py-2 text-sm font-medium",
              filter === status
                ? "ui-border-strong ui-bg-surface-2 text-[rgb(var(--ui-text)/0.96)]"
                : "ui-border-soft text-[rgb(var(--ui-text-muted)/0.82)] hover:border-[rgb(var(--ui-border-strong)/0.72)] hover:text-[rgb(var(--ui-text)/0.96)]",
            ].join(" ")}
          >
            {t(`lifecycle.status.${status}`)} · {counts[status]}
          </button>
        ))}
      </div>

      <div className="mt-5">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold">
            {t(`lifecycle.sections.${filter}`)}
          </h2>
          {groups !== null ? (
            <div className="text-xs text-neutral-500">
              {t("classCount", { count: visibleGroups.length })}
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
              {t("errors.load")}
            </div>
          ) : groups === null ? (
            <div className="ui-surface rounded-xl p-6 text-sm text-neutral-500">
              {t("loading")}
            </div>
          ) : visibleGroups.length ? (
            visibleGroups.map((group) => (
              <TeacherLink
                key={group.id}
                href={`/classes/${group.id}`}
                locale={props.locale}
                className="ui-surface block rounded-lg p-4 transition-colors hover:bg-[rgb(var(--ui-surface-2)/1)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {group.name}
                    </div>
                    <div className="mt-1 text-xs text-neutral-500">
                      {group.organization?.name ?? t("standalone")}
                    </div>
                  </div>
                  <span className="ui-pill-neutral shrink-0">
                    {t(`lifecycle.status.${group.status}`)}
                  </span>
                </div>

                {group.description ? (
                  <p className="mt-3 text-sm leading-6 text-neutral-500">
                    {group.description}
                  </p>
                ) : null}

                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="text-xs text-neutral-500">
                    {t("cardMeta", {
                      members: group.members.length,
                      assignments: group._count?.assignments ?? 0,
                    })}
                  </div>
                  <span className="text-sm font-medium">
                    {t("openWorkspace")}
                  </span>
                </div>
              </TeacherLink>
            ))
          ) : (
            <div className="ui-surface rounded-xl p-6 text-sm text-neutral-500">
              <div className="font-medium text-neutral-900 dark:text-white">
                {t(`lifecycle.empty.${filter}.title`)}
              </div>
              <p className="mt-1">{t(`lifecycle.empty.${filter}.body`)}</p>
              {filter === "draft" ? (
                <TeacherLink
                  href="/classes/new"
                  locale={props.locale}
                  className="ui-btn-primary mt-4 inline-flex h-9 px-4"
                >
                  {t("newGroup")}
                </TeacherLink>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
