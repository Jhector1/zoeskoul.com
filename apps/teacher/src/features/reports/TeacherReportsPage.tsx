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
  type TeacherSchool,
} from "../classes/teacherClassesClient";
import {
  createTeacherReportsClient,
  type TeacherSchoolReport,
} from "./teacherReportsClient";

function percent(value: number) {
  return `${Math.max(0, Math.min(100, value))}%`;
}

export function TeacherReportsPage(props: {
  apiOrigin: string;
  locale: string;
}) {
  const t =
    useTranslations("Teacher.reports");

  const classesClient = useMemo(
    () =>
      createTeacherClassesClient({
        apiOrigin: props.apiOrigin,
      }),
    [props.apiOrigin],
  );

  const reportsClient = useMemo(
    () =>
      createTeacherReportsClient({
        apiOrigin: props.apiOrigin,
      }),
    [props.apiOrigin],
  );

  const [schools, setSchools] =
    useState<TeacherSchool[] | null>(null);
  const [schoolId, setSchoolId] =
    useState("");
  const [report, setReport] =
    useState<TeacherSchoolReport | null>(
      null,
    );
  const [loadingReport, setLoadingReport] =
    useState(false);
  const [loadError, setLoadError] =
    useState<"schools" | "report" | null>(
      null,
    );

  useEffect(() => {
    let cancelled = false;

    void classesClient
      .listSchools()
      .then(({ schools }) => {
        if (cancelled) return;
        setSchools(schools);
        setSchoolId(
          (current) =>
            current || schools[0]?.id || "",
        );
        setLoadError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setSchools([]);
        setLoadError("schools");
      });

    return () => {
      cancelled = true;
    };
  }, [classesClient]);

  useEffect(() => {
    if (!schoolId) {
      setReport(null);
      return;
    }

    let cancelled = false;
    setLoadingReport(true);
    setLoadError(null);

    void reportsClient
      .getSchoolReport(schoolId)
      .then(({ report }) => {
        if (cancelled) return;
        setReport(report);
        setLoadingReport(false);
      })
      .catch(() => {
        if (cancelled) return;
        setReport(null);
        setLoadingReport(false);
        setLoadError("report");
      });

    return () => {
      cancelled = true;
    };
  }, [reportsClient, schoolId]);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(
        props.locale,
        {
          dateStyle: "medium",
        },
      ),
    [props.locale],
  );

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {t("kicker")}
          </div>
          <h1 className="mt-1 text-2xl font-semibold">
            {t("title")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">
            {t("subtitle")}
          </p>
        </div>

        <TeacherLink
          href="/classes"
          locale={props.locale}
          className="ui-btn-secondary rounded-lg px-4 py-2 text-sm font-medium"
        >
          {t("classes")}
        </TeacherLink>
      </div>

      <div className="mt-6 max-w-md">
        <label className="text-sm font-medium">
          {t("school")}
          <select
            className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2"
            value={schoolId}
            disabled={schools === null}
            onChange={(event) =>
              setSchoolId(event.target.value)
            }
          >
            {schools === null ? (
              <option value="">
                {t("loadingSchools")}
              </option>
            ) : schools.length ? (
              schools.map((school) => (
                <option
                  key={school.id}
                  value={school.id}
                >
                  {school.name}
                </option>
              ))
            ) : (
              <option value="">
                {t("noSchools")}
              </option>
            )}
          </select>
        </label>
      </div>

      {loadError === "schools" ? (
        <div className="ui-surface-danger mt-6 rounded-xl p-5 text-sm">
          {t("errors.schools")}
        </div>
      ) : null}

      {schoolId && loadingReport ? (
        <div className="ui-surface mt-6 rounded-xl p-5 text-sm">
          {t("loadingReport")}
        </div>
      ) : null}

      {schoolId &&
      !loadingReport &&
      loadError === "report" ? (
        <div className="ui-surface-warn mt-6 rounded-xl p-5 text-sm">
          {t("errors.report")}
        </div>
      ) : null}

      {report && !loadingReport ? (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              [
                t("stats.classes"),
                String(report.summary.classes),
              ],
              [
                t("stats.students"),
                String(report.summary.students),
              ],
              [
                t("stats.assignments"),
                String(
                  report.summary.assignments,
                ),
              ],
              [
                t("stats.progress"),
                percent(
                  report.summary
                    .averageProgressPct,
                ),
              ],
              [
                t("stats.accuracy"),
                percent(
                  report.summary
                    .averageAccuracyPct,
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

          <section className="mt-7">
            <h2 className="text-lg font-semibold">
              {t("sections.classes")}
            </h2>

            {report.classes.length ? (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {report.classes.map(
                  (schoolClass) => (
                    <TeacherLink
                      key={schoolClass.id}
                      href={`/classes/${schoolClass.id}`}
                      locale={props.locale}
                      className="ui-surface block rounded-xl p-4"
                    >
                      <div className="font-medium">
                        {schoolClass.name}
                      </div>
                      <div className="mt-2 text-xs text-neutral-500">
                        {t("classMeta", {
                          students:
                            schoolClass.students,
                          assignments:
                            schoolClass.assignments,
                          progress:
                            schoolClass.averageProgressPct,
                          accuracy:
                            schoolClass.averageAccuracyPct,
                        })}
                      </div>
                    </TeacherLink>
                  ),
                )}
              </div>
            ) : (
              <div className="ui-surface mt-3 rounded-xl p-5 text-sm text-neutral-500">
                {t("emptyClasses")}
              </div>
            )}
          </section>

          <section className="mt-7">
            <h2 className="text-lg font-semibold">
              {t("sections.students")}
            </h2>

            {report.students.length ? (
              <div className="ui-surface mt-3 overflow-x-auto rounded-xl">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b border-neutral-200 text-xs text-neutral-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">
                        {t("columns.student")}
                      </th>
                      <th className="px-4 py-3 font-medium">
                        {t("columns.classes")}
                      </th>
                      <th className="px-4 py-3 font-medium">
                        {t("columns.assignments")}
                      </th>
                      <th className="px-4 py-3 font-medium">
                        {t("columns.progress")}
                      </th>
                      <th className="px-4 py-3 font-medium">
                        {t("columns.accuracy")}
                      </th>
                      <th className="px-4 py-3 font-medium">
                        {t("columns.activity")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.students.map(
                      (student) => (
                        <tr
                          key={student.userId}
                          className="border-b border-neutral-100 last:border-0"
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium">
                              {student.name ??
                                student.email ??
                                t(
                                  "unknownStudent",
                                )}
                            </div>
                            {student.email ? (
                              <div className="mt-0.5 text-xs text-neutral-500">
                                {student.email}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">
                            {student.classes}
                          </td>
                          <td className="px-4 py-3">
                            {student.assignments}
                          </td>
                          <td className="px-4 py-3">
                            {percent(
                              student.averageProgressPct,
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {t("accuracyMeta", {
                              accuracy:
                                student.accuracyPct,
                              attempts:
                                student.attempts,
                            })}
                          </td>
                          <td className="px-4 py-3 text-xs text-neutral-500">
                            {student.lastActivityAt
                              ? dateFormatter.format(
                                  new Date(
                                    student.lastActivityAt,
                                  ),
                                )
                              : t("notAvailable")}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="ui-surface mt-3 rounded-xl p-5 text-sm text-neutral-500">
                {t("emptyStudents")}
              </div>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
