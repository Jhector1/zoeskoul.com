import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useTranslations,
} from "../../compat/next-intl";
import {
  TeacherLink,
} from "../../app/TeacherLink";
import {
  createTeacherClassesClient,
  type TeacherClass,
} from "./teacherClassesClient";

export function TeacherClassesPage(props: {
  apiOrigin: string;
  websiteOrigin: string;
  locale: string;
}) {
  const t =
    useTranslations("Teacher.classes");
  const client =
    useMemo(
      () =>
        createTeacherClassesClient({
          apiOrigin:
            props.apiOrigin,
        }),
      [props.apiOrigin],
    );

  const [groups, setGroups] =
    useState<TeacherClass[] | null>(
      null,
    );
  const [error, setError] =
    useState(false);

  useEffect(() => {
    let cancelled = false;

    void client.list()
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

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {t("kicker")}
          </div>
          <h1 className="mt-1 text-2xl font-semibold">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {t("subtitle")}
          </p>
        </div>

        <div className="flex gap-2">
          <TeacherLink
            href="/reports"
            locale={props.locale}
            className="ui-btn-secondary rounded-lg px-4 py-2 text-sm font-medium"
          >
            {t("reports")}
          </TeacherLink>

          <TeacherLink
            href="/assignments"
            locale={props.locale}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium"
          >
            {t("courseAssignments")}
          </TeacherLink>

          <TeacherLink
            href="/classes/new"
            locale={props.locale}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
          >
            {t("newGroup")}
          </TeacherLink>
        </div>
      </div>

      <div className="mt-6 grid gap-3">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
            {t("errors.load")}
          </div>
        ) : groups === null ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
            {t("loading")}
          </div>
        ) : groups.length ? (
          groups.map((group) => (
            <TeacherLink
              key={group.id}
              href={`/classes/${group.id}`}
              locale={props.locale}
              className="rounded-xl border border-neutral-200 bg-white p-4 transition hover:border-neutral-400"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium">
                    {group.name}
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {group.slug}
                    {" · "}
                    {group.organization
                      ? t("schoolValue", {
                          school:
                            group.organization.name,
                        })
                      : t("standalone")}
                  </div>
                </div>
                <div className="text-sm text-neutral-600">
                  {t("cardMeta", {
                    members:
                      group.members.length,
                    assignments:
                      group._count
                        ?.assignments ??
                      0,
                  })}
                </div>
              </div>
            </TeacherLink>
          ))
        ) : (
          <div className="rounded-xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
            {t("empty")}
          </div>
        )}
      </div>
    </main>
  );
}
