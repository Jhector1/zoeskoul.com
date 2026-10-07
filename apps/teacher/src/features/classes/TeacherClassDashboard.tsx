import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { TeacherLink } from "../../app/TeacherLink";
import { TeacherAnnouncementsPanel } from "../announcements/TeacherAnnouncementsPanel";
import {
  useTranslations,
} from "../../compat/next-intl";
import {
  createTeacherClassesClient,
  type TeacherClassDashboard as Dashboard,
  type TeacherClassProgressStatus,
} from "./teacherClassesClient";

function formatPercent(value: number) {
  return `${Math.max(0, Math.min(100, value))}%`;
}

export function TeacherClassDashboard(props: {
  apiOrigin: string;
  locale: string;
  classId: string;
  classStatus: "draft" | "open" | "closed";
  view?: "overview" | "assignments" | "gradebook";
  embedded?: boolean;
}) {
  const t = useTranslations("Teacher.classes");
  const view = props.view ?? "overview";
  const dashboardTitle =
    view === "assignments"
      ? t("dashboard.sections.assignments")
      : view === "gradebook"
        ? t("dashboard.sections.gradebook")
        : t("dashboard.title");

  const client = useMemo(
    () =>
      createTeacherClassesClient({
        apiOrigin: props.apiOrigin,
      }),
    [props.apiOrigin],
  );

  const [data, setData] =
    useState<Dashboard | null>(null);
  const [loading, setLoading] =
    useState(true);
  const [error, setError] =
    useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    void client
      .getDashboard(
        props.classId,
        props.locale,
      )
      .then(({ dashboard }) => {
        if (!cancelled) {
          setData(dashboard);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client, props.classId]);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(props.locale, {
        dateStyle: "medium",
      }),
    [props.locale],
  );

  function statusLabel(
    status: TeacherClassProgressStatus,
  ) {
    return t(`dashboard.status.${status}`);
  }

  if (loading) {
    return (
      <section className={props.embedded ? "" : "mx-auto max-w-6xl px-6 pt-6"}>
        <div className="ui-surface rounded-xl p-5 text-sm">
          {t("dashboard.loading")}
        </div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className={props.embedded ? "" : "mx-auto max-w-6xl px-6 pt-6"}>
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          {t("dashboard.errors.load")}
        </div>
      </section>
    );
  }

  return (
    <section className={props.embedded ? "" : "mx-auto max-w-6xl px-6 pt-6"}>
      <div className="mb-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {t("dashboard.kicker")}
        </div>
        <h2 className="mt-1 text-2xl font-semibold">
          {dashboardTitle}
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          {t("dashboard.subtitle")}
        </p>
      </div>



      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          [
            t("dashboard.stats.students"),
            String(data.summary.students),
          ],
          [
            t("dashboard.stats.assignments"),
            String(data.summary.assignments),
          ],
          [
            t("dashboard.stats.averageProgress"),
            formatPercent(
              data.summary.averageProgressPct,
            ),
          ],
          [
            t("dashboard.stats.averageAccuracy"),
            formatPercent(
              data.summary.averageAccuracyPct,
            ),
          ],
        ].map(([label, value]) => (
          <div
            key={label}
            className="ui-surface rounded-xl p-4"
          >
            <div className="text-xs text-neutral-500">
              {label}
            </div>
            <div className="mt-1 text-2xl font-semibold">
              {value}
            </div>
          </div>
        ))}
      </div>

      {view === "overview" ? (
        <details className="ui-surface mb-6 rounded-xl p-4">
          <summary className="cursor-pointer list-none">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-neutral-900 dark:text-white">
                  {t("dashboard.sections.announcements")}
                </div>
                <div className="mt-1 text-xs text-neutral-500 dark:text-white/55">
                  {t("dashboard.announcementsHint")}
                </div>
              </div>
              <span className="text-xs font-medium text-neutral-500">
                +
              </span>
            </div>
          </summary>
          <div className="mt-4 border-t ui-border-soft pt-4">
            <TeacherAnnouncementsPanel
              apiOrigin={props.apiOrigin}
              locale={props.locale}
              scope="class"
              targetId={props.classId}
              canPublish={props.classStatus === "open"}
            />
          </div>
        </details>
      ) : null}

      {view === "assignments" ? (


      <div className="mt-6">
        <h3 className="text-base font-semibold">
          {t("dashboard.sections.assignments")}
        </h3>

        {data.assignments.length ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {data.assignments.map((assignment) => (
              <TeacherLink
                key={assignment.id}
                href={`/assignments/${assignment.id}`}
                locale={props.locale}
                className="ui-surface block rounded-xl p-4"
              >
                <div className="font-medium">
                  {assignment.title}
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  {t("dashboard.assignmentMeta", {
                    subject: assignment.subjectTitle,
                    progress: assignment.averageProgressPct,
                  })}
                </div>
                {assignment.dueAt ? (
                  <div className="mt-2 text-xs text-neutral-500">
                    {t("dashboard.due", {
                      date: dateFormatter.format(
                        new Date(assignment.dueAt),
                      ),
                    })}
                  </div>
                ) : null}
              </TeacherLink>
            ))}
          </div>
        ) : (
          <div className="ui-surface mt-3 rounded-xl p-5 text-sm text-neutral-500">
            {t("dashboard.emptyAssignments")}
          </div>
        )}
      </div>
) : null}

      {view === "gradebook" ? (
<div className="mt-6">
        <h3 className="text-base font-semibold">
          {t("dashboard.sections.gradebook")}
        </h3>

        {!data.students.length ? (
          <div className="ui-surface mt-3 rounded-xl p-5 text-sm text-neutral-500">
            {t("dashboard.emptyStudents")}
          </div>
        ) : !data.assignments.length ? (
          <div className="ui-surface mt-3 rounded-xl p-5 text-sm text-neutral-500">
            {t("dashboard.emptyAssignments")}
          </div>
        ) : (
          <div className="ui-surface mt-3 overflow-x-auto rounded-xl">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b ui-border-soft text-xs text-[rgb(var(--ui-text-muted)/0.82)]">
                <tr>
                  <th className="px-4 py-3 font-medium">
                    {t("dashboard.columns.student")}
                  </th>
                  {data.assignments.map((assignment) => (
                    <th
                      key={assignment.id}
                      className="px-4 py-3 font-medium"
                    >
                      {assignment.title}
                    </th>
                  ))}
                  <th className="px-4 py-3 font-medium">
                    {t("dashboard.columns.activity")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.students.map((student) => (
                  <tr
                    key={student.userId}
                    className="border-b ui-border-soft last:border-0"
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium">
                        {student.name ??
                          student.email ??
                          t("dashboard.unknownStudent")}
                      </div>
                      {student.email ? (
                        <div className="mt-0.5 text-xs text-neutral-500">
                          {student.email}
                        </div>
                      ) : null}
                    </td>

                    {data.assignments.map((assignment) => {
                      const cell =
                        student.assignments.find(
                          (item) =>
                            item.assignmentId ===
                            assignment.id,
                        );

                      if (!cell) {
                        return (
                          <td
                            key={assignment.id}
                            className="px-4 py-3 text-neutral-400"
                          >
                            {t("dashboard.notAvailable")}
                          </td>
                        );
                      }

                      return (
                        <td
                          key={assignment.id}
                          className="px-4 py-3 align-top"
                        >
                          <div className="font-medium">
                            {formatPercent(
                              cell.progressPct,
                            )}
                          </div>
                          <div className="mt-0.5 text-xs text-neutral-500">
                            {statusLabel(cell.status)}
                          </div>
                          <div className="mt-0.5 text-xs text-neutral-500">
                            {t(
                              "dashboard.cellAccuracy",
                              {
                                accuracy:
                                  cell.accuracyPct,
                                attempts:
                                  cell.attempts,
                              },
                            )}
                          </div>
                        </td>
                      );
                    })}

                    <td className="px-4 py-3 text-xs text-neutral-500">
                      {student.lastActivityAt
                        ? dateFormatter.format(
                            new Date(
                              student.lastActivityAt,
                            ),
                          )
                        : t("dashboard.notAvailable")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
) : null}
    </section>
  );
}
