import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useTranslations,
} from "../../compat/next-intl";
import {
  createTeacherSchoolCoursesClient,
  type TeacherSchoolCourse,
} from "./teacherSchoolCoursesClient";

export function TeacherSchoolCoursesPanel(
  props: {
    apiOrigin: string;
    locale: string;
    schoolId: string;
    canManage: boolean;
  },
) {
  const t =
    useTranslations(
      "Teacher.schoolCourses",
    );

  const client = useMemo(
    () =>
      createTeacherSchoolCoursesClient({
        apiOrigin: props.apiOrigin,
      }),
    [props.apiOrigin],
  );

  const [courses, setCourses] =
    useState<
      TeacherSchoolCourse[]
    >([]);
  const [loading, setLoading] =
    useState(true);
  const [busyId, setBusyId] =
    useState<string | null>(null);
  const [error, setError] =
    useState<string | null>(null);
  const [notice, setNotice] =
    useState<string | null>(null);

  async function load() {
    const result =
      await client.list(
        props.schoolId,
        props.locale,
      );
    setCourses(result.courses);
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    void client
      .list(
        props.schoolId,
        props.locale,
      )
      .then((result) => {
        if (!active) return;
        setCourses(result.courses);
      })
      .catch(() => {
        if (!active) return;
        setError(
          t("errors.load"),
        );
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    client,
    props.schoolId,
    props.locale,
    t,
  ]);

  async function change(
    course: TeacherSchoolCourse,
  ) {
    setBusyId(course.id);
    setError(null);
    setNotice(null);

    try {
      if (course.enabled) {
        await client.disable(
          props.schoolId,
          course.id,
        );
        setNotice(
          t("notices.removed"),
        );
      } else {
        await client.enable(
          props.schoolId,
          course.id,
        );
        setNotice(
          t("notices.added"),
        );
      }

      await load();
    } catch {
      setError(
        course.enabled
          ? t("errors.remove")
          : t("errors.add"),
      );
    } finally {
      setBusyId(null);
    }
  }

  const enabledCount =
    courses.filter(
      (course) => course.enabled,
    ).length;

  return (
    <section className="ui-surface mt-6 rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide opacity-60">
            {t("kicker")}
          </div>
          <h2 className="mt-1 text-xl font-semibold">
            {t("title")}
          </h2>
          <p className="mt-1 max-w-2xl text-sm opacity-70">
            {t("description")}
          </p>
        </div>

        <div className="ui-pill-neutral rounded-full px-3 py-1 text-xs font-medium">
          {t("enabledCount", {
            count: enabledCount,
          })}
        </div>
      </div>

      {error ? (
        <div className="ui-surface-soft mt-4 rounded-xl p-3 text-sm">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="ui-surface-soft mt-4 rounded-xl p-3 text-sm">
          {notice}
        </div>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm opacity-70">
          {t("loading")}
        </p>
      ) : courses.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {courses.map(
            (course) => (
              <article
                key={course.id}
                className="ui-surface-soft rounded-xl p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">
                      {course.title}
                    </div>
                    <div className="mt-1 text-xs opacity-60">
                      {course.slug}
                    </div>
                  </div>

                  <span
                    className={
                      course.enabled
                        ? "ui-badge-good rounded-full px-2 py-1 text-xs"
                        : "ui-pill-neutral rounded-full px-2 py-1 text-xs"
                    }
                  >
                    {course.enabled
                      ? t("status.enabled")
                      : t("status.available")}
                  </span>
                </div>

                {course.description ? (
                  <p className="mt-3 text-sm opacity-70">
                    {course.description}
                  </p>
                ) : null}

                {props.canManage ? (
                  <button
                    type="button"
                    disabled={
                      busyId ===
                      course.id
                    }
                    className={
                      course.enabled
                        ? "ui-btn-secondary mt-4 rounded-lg px-3 py-2 text-sm"
                        : "ui-btn-primary mt-4 rounded-lg px-3 py-2 text-sm"
                    }
                    onClick={() =>
                      void change(course)
                    }
                  >
                    {busyId ===
                    course.id
                      ? t("saving")
                      : course.enabled
                        ? t("actions.remove")
                        : t("actions.add")}
                  </button>
                ) : null}
              </article>
            ),
          )}
        </div>
      ) : (
        <p className="mt-4 text-sm opacity-70">
          {t("empty")}
        </p>
      )}

      {!props.canManage ? (
        <p className="mt-4 text-xs opacity-60">
          {t("readOnly")}
        </p>
      ) : null}
    </section>
  );
}
