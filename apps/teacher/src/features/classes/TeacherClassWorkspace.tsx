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
} from "./teacherClassesClient";
import { TeacherClassDashboard } from "./TeacherClassDashboard";
import { TeacherClassCoursesPanel } from "./TeacherClassCoursesPanel";
import { TeacherClassEditor } from "./TeacherClassEditor";

type Tab = "overview" | "students" | "courses" | "assignments" | "gradebook" | "settings";

function currentTab(): Tab {
  const value = new URLSearchParams(window.location.search).get("tab");
  return value === "students" ||
    value === "courses" ||
    value === "assignments" ||
    value === "gradebook" ||
    value === "settings"
    ? value
    : "overview";
}

export function TeacherClassWorkspace(props: {
  apiOrigin: string;
  websiteOrigin: string;
  locale: string;
  classId: string;
}) {
  const t = useTranslations("Teacher.classes");
  const client = useMemo(
    () => createTeacherClassesClient({ apiOrigin: props.apiOrigin }),
    [props.apiOrigin],
  );
  const [group, setGroup] = useState<TeacherClass | null>(null);
  const [error, setError] = useState(false);
  const [statusError, setStatusError] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const tab = currentTab();

  useEffect(() => {
    let cancelled = false;

    void client
      .get(props.classId)
      .then(({ group }) => {
        if (!cancelled) {
          setGroup(group);
          setError(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGroup(null);
          setError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client, props.classId]);

  async function changeStatus(status: "open" | "closed") {
    if (!group) return;
    if (
      status === "closed" &&
      !window.confirm(t("lifecycle.closeConfirm"))
    ) {
      return;
    }

    setStatusBusy(true);
    setStatusError(false);
    try {
      const result = await client.setStatus(props.classId, status);
      setGroup(result.group);
    } catch {
      setStatusError(true);
    } finally {
      setStatusBusy(false);
    }
  }

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "overview", label: t("workspace.tabs.overview") },
    { key: "students", label: t("workspace.tabs.students") },
    { key: "courses", label: t("workspace.tabs.courses") },
    { key: "assignments", label: t("workspace.tabs.assignments") },

    { key: "gradebook", label: t("workspace.tabs.gradebook") },
    { key: "settings", label: t("workspace.tabs.settings") },
  ];

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <TeacherLink
            href="/classes"
            locale={props.locale}
            className="text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
          >
            ← {t("workspace.back")}
          </TeacherLink>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {t("workspace.kicker")}
            </div>
            {group ? (
              <span className="ui-pill-neutral">
                {t(`lifecycle.status.${group.status}`)}
              </span>
            ) : null}
          </div>
          <h1 className="mt-1 truncate text-2xl font-semibold">
            {group?.name ?? t("workspace.loading")}
          </h1>
          {group ? (
            <p className="mt-1 text-sm text-neutral-500">
              {group.organization?.name ?? t("standalone")}
              {" · "}
              {t("cardMeta", {
                members: group.members.length,
                assignments: group._count?.assignments ?? 0,
              })}
            </p>
          ) : null}
        </div>

        {group ? (
          <div className="flex flex-wrap gap-2">
            {group.status === "draft" ? (
              <button
                type="button"
                className="ui-btn-primary h-9 px-4"
                disabled={statusBusy}
                onClick={() => void changeStatus("open")}
              >
                {statusBusy ? t("lifecycle.updating") : t("lifecycle.actions.open")}
              </button>
            ) : group.status === "open" ? (
              <button
                type="button"
                className="ui-btn-secondary h-9 px-4"
                disabled={statusBusy}
                onClick={() => void changeStatus("closed")}
              >
                {statusBusy ? t("lifecycle.updating") : t("lifecycle.actions.close")}
              </button>
            ) : (
              <button
                type="button"
                className="ui-btn-primary h-9 px-4"
                disabled={statusBusy}
                onClick={() => void changeStatus("open")}
              >
                {statusBusy ? t("lifecycle.updating") : t("lifecycle.actions.reopen")}
              </button>
            )}
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          {t("errors.loadOne")}
        </div>
      ) : null}

      {statusError ? (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          {t("lifecycle.errors.update")}
        </div>
      ) : null}

      {group && group.status !== "open" ? (
        <div className="ui-surface-soft mt-5 rounded-xl p-4 text-sm text-neutral-600 dark:text-white/70">
          {t(`lifecycle.notice.${group.status}`)}
        </div>
      ) : null}

      <nav
        aria-label={t("workspace.navLabel")}
        className="mt-6 flex gap-1 overflow-x-auto border-b ui-border-soft"
      >
        {tabs.map((item) => (
          <TeacherLink
            key={item.key}
            href={
              item.key === "overview"
                ? `/classes/${props.classId}`
                : `/classes/${props.classId}?tab=${item.key}`
            }
            locale={props.locale}
            aria-current={tab === item.key ? "page" : undefined}
            className={[
              "-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium",
              tab === item.key
                ? "border-[rgb(var(--ui-text)/0.58)] text-[rgb(var(--ui-text)/0.96)]"
                : "border-transparent text-[rgb(var(--ui-text-muted)/0.78)] hover:text-[rgb(var(--ui-text)/0.96)]",
            ].join(" ")}
          >
            {item.label}
          </TeacherLink>
        ))}
      </nav>

      <div className="mt-6">
        {tab === "courses" ? (
          <TeacherClassCoursesPanel
            apiOrigin={props.apiOrigin}
            websiteOrigin={props.websiteOrigin}
            locale={props.locale}
            classId={props.classId}
          />
        ) : null}

        {tab === "overview" || tab === "assignments" || tab === "gradebook" ? (
          <TeacherClassDashboard
            apiOrigin={props.apiOrigin}
            locale={props.locale}
            classId={props.classId}
            classStatus={group?.status ?? "draft"}
            view={
              tab === "assignments"
                ? "assignments"
                : tab === "gradebook"
                  ? "gradebook"
                  : "overview"
            }
            embedded
          />
        ) : null}

        {tab === "students" ? (
          <TeacherClassEditor
            apiOrigin={props.apiOrigin}
            locale={props.locale}
            classId={props.classId}
            classStatus={group?.status}
            section="students"
            embedded
          />
        ) : null}

        {tab === "settings" ? (
          <TeacherClassEditor
            apiOrigin={props.apiOrigin}
            locale={props.locale}
            classId={props.classId}
            classStatus={group?.status}
            section="details"
            embedded
          />
        ) : null}
      </div>
    </main>
  );
}
