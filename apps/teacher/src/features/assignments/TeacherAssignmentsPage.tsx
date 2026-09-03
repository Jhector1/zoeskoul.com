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
  createTeacherAssignmentsClient,
  type TeacherAssignment,
} from "./teacherAssignmentsClient";

function pendingInviteCount(
  assignment: TeacherAssignment,
) {
  return assignment.invites.filter(
    (invite) =>
      !invite.acceptedAt &&
      !invite.revokedAt,
  ).length;
}

export function TeacherAssignmentsPage(props: {
  apiOrigin: string;
  locale: string;
}) {
  const t =
    useTranslations(
      "Teacher.assignments",
    );
  const client =
    useMemo(
      () =>
        createTeacherAssignmentsClient({
          apiOrigin:
            props.apiOrigin,
        }),
      [props.apiOrigin],
    );

  const [
    assignments,
    setAssignments,
  ] = useState<
    TeacherAssignment[] | null
  >(null);
  const [error, setError] =
    useState(false);

  useEffect(() => {
    let cancelled = false;

    void client
      .list(props.locale)
      .then(
        ({ assignments }) => {
          if (cancelled) {
            return;
          }

          setAssignments(
            assignments,
          );
          setError(false);
        },
      )
      .catch(() => {
        if (cancelled) {
          return;
        }

        setAssignments([]);
        setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [
    client,
    props.locale,
  ]);

  return (
    <main className="mx-auto max-w-6xl p-6">
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
            href="/classes"
            locale={props.locale}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium"
          >
            {t("classes")}
          </TeacherLink>

          <TeacherLink
            href="/assignments/new"
            locale={props.locale}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
          >
            {t("newAssignment")}
          </TeacherLink>
        </div>
      </div>

      <div className="mt-6">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
            {t("errors.load")}
          </div>
        ) : assignments === null ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
            {t("loading")}
          </div>
        ) : assignments.length ? (
          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-neutral-50 text-neutral-600">
                <tr>
                  <th className="px-4 py-3">
                    {t(
                      "table.assignment",
                    )}
                  </th>
                  <th className="px-4 py-3">
                    {t("table.course")}
                  </th>
                  <th className="px-4 py-3">
                    {t(
                      "table.audience",
                    )}
                  </th>
                  <th className="px-4 py-3">
                    {t("table.status")}
                  </th>
                  <th className="px-4 py-3">
                    {t("table.due")}
                  </th>
                  <th
                    className="px-4 py-3"
                    aria-label={t(
                      "table.actions",
                    )}
                  />
                </tr>
              </thead>

              <tbody>
                {assignments.map(
                  (assignment) => (
                    <tr
                      key={
                        assignment.id
                      }
                      className="border-t border-neutral-200"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {
                            assignment.title
                          }
                        </div>
                        <div className="text-xs text-neutral-500">
                          {
                            assignment.slug
                          }
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div>
                          {
                            assignment
                              .subject
                              .title
                          }
                        </div>
                        <div className="text-xs text-neutral-500">
                          {t(
                            `visibility.${assignment.subject.visibility}`,
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        {t(
                          "table.audienceValue",
                          {
                            students:
                              assignment
                                .users
                                .length,
                            invites:
                              pendingInviteCount(
                                assignment,
                              ),
                            groups:
                              assignment
                                .groups
                                .length,
                          },
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {t(
                          `status.${assignment.status}`,
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {assignment.dueAt
                          ? new Date(
                              assignment.dueAt,
                            ).toLocaleString(
                              props.locale,
                            )
                          : t(
                              "table.noDue",
                            )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <TeacherLink
                          href={`/assignments/${assignment.id}`}
                          locale={
                            props.locale
                          }
                          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium"
                        >
                          {t(
                            "table.edit",
                          )}
                        </TeacherLink>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
            {t("empty")}
          </div>
        )}
      </div>
    </main>
  );
}
