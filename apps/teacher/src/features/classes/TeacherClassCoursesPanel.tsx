"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { TeacherLink } from "../../app/TeacherLink";
import { useTranslations } from "../../compat/next-intl";
import {
  createTeacherClassesClient,
  type TeacherClassDashboard,
} from "./teacherClassesClient";

type ClassCourse = {
  subjectId: string;
  subjectSlug: string;
  subjectTitle: string;
  assignmentCount: number;
  averageProgressPct: number;
};

export function classCourseWorkspaceHref(args: {
  websiteOrigin: string;
  locale: string;
  classId: string;
  subjectSlug: string;
}) {
  return new URL(
    `/${encodeURIComponent(args.locale)}` +
      `/teacher-classes/${encodeURIComponent(args.classId)}` +
      `/subjects/${encodeURIComponent(args.subjectSlug)}`,
    args.websiteOrigin,
  ).toString();
}

export function deriveTeacherClassCourses(
  assignments: TeacherClassDashboard["assignments"],
): ClassCourse[] {
  const bySubject = new Map<
    string,
    ClassCourse & {
      progressTotal: number;
    }
  >();

  for (const assignment of assignments) {
    const current = bySubject.get(
      assignment.subjectId,
    );

    if (current) {
      current.assignmentCount += 1;
      current.progressTotal +=
        assignment.averageProgressPct;
      current.averageProgressPct =
        Math.round(
          current.progressTotal /
            current.assignmentCount,
        );
      continue;
    }

    bySubject.set(assignment.subjectId, {
      subjectId: assignment.subjectId,
      subjectSlug: assignment.subjectSlug,
      subjectTitle: assignment.subjectTitle,
      assignmentCount: 1,
      averageProgressPct:
        assignment.averageProgressPct,
      progressTotal:
        assignment.averageProgressPct,
    });
  }

  return [...bySubject.values()]
    .map(
      ({
        progressTotal: _progressTotal,
        ...course
      }) => course,
    )
    .sort((a, b) =>
      a.subjectTitle.localeCompare(
        b.subjectTitle,
      ),
    );
}

export function TeacherClassCoursesPanel(props: {
  apiOrigin: string;
  websiteOrigin: string;
  locale: string;
  classId: string;
}) {
  const t =
    useTranslations("Teacher.classes");
  const client = useMemo(
    () =>
      createTeacherClassesClient({
        apiOrigin: props.apiOrigin,
      }),
    [props.apiOrigin],
  );
  const [data, setData] =
    useState<TeacherClassDashboard | null>(
      null,
    );
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
        if (cancelled) return;
        setData(dashboard);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setData(null);
        setError(true);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    client,
    props.classId,
    props.locale,
  ]);

  const courses = useMemo(
    () =>
      deriveTeacherClassCourses(
        data?.assignments ?? [],
      ),
    [data],
  );

  if (loading) {
    return (
      <div className="ui-surface rounded-lg p-5 text-sm text-neutral-500">
        {t("courses.loading")}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
        {t("courses.error")}
      </div>
    );
  }

  return (
    <section>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">
            {t("courses.title")}
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            {t("courses.subtitle")}
          </p>
        </div>

        <TeacherLink
          href="/assignments/new"
          locale={props.locale}
          className="ui-btn ui-btn-primary h-9 px-4"
        >
          {t("courses.createAssignment")}
        </TeacherLink>
      </div>

      {courses.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {courses.map((course) => (
            <article
              key={course.subjectId}
              className="ui-surface rounded-lg p-4"
            >
              <div className="font-medium text-[rgb(var(--ui-text)/1)]">
                {course.subjectTitle}
              </div>

              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-500">
                <span>
                  {t(
                    course.assignmentCount ===
                      1
                      ? "courses.assignmentOne"
                      : "courses.assignmentMany",
                    {
                      count:
                        course.assignmentCount,
                    },
                  )}
                </span>
                <span>
                  {t("courses.progress", {
                    progress:
                      course.averageProgressPct,
                  })}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href={classCourseWorkspaceHref({
                    websiteOrigin:
                      props.websiteOrigin,
                    locale: props.locale,
                    classId: props.classId,
                    subjectSlug:
                      course.subjectSlug,
                  })}
                  className="ui-btn ui-btn-primary h-8 px-3 text-xs"
                >
                  {t(
                    "courses.openWorkspace",
                  )}
                </a>
                <TeacherLink
                  href={
                    `/assignments/new?subjectId=${encodeURIComponent(
                      course.subjectId,
                    )}&classId=${encodeURIComponent(
                      props.classId,
                    )}`
                  }
                  locale={props.locale}
                  className="ui-btn ui-btn-secondary h-8 px-3 text-xs"
                >
                  {t(
                    "courses.createAssignment",
                  )}
                </TeacherLink>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="ui-surface rounded-lg p-5">
          <div className="text-sm font-medium">
            {t("courses.empty")}
          </div>
          <p className="mt-1 text-sm text-neutral-500">
            {t("courses.emptyHint")}
          </p>
        </div>
      )}
    </section>
  );
}
