import {
  ApiClientError,
} from "@zoeskoul/api-client";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useTranslations,
} from "../../compat/next-intl";
import {
  navigate,
} from "../../compat/navigation-runtime";
import {
  createTeacherClassesClient,
} from "../classes/teacherClassesClient";
import {
  TeacherAssignmentInvites,
} from "./TeacherAssignmentInvites";
import {
  createTeacherAssignmentsClient,
  type TeacherAssignment,
  type TeacherAssignmentCourse,
  type TeacherAssignmentInput,
  type TeacherAssignmentStatus,
  type TeacherSolutionVisibility,
} from "./teacherAssignmentsClient";

type GroupOption = {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
};

type FormState = {
  title: string;
  slug: string;
  description: string;
  subjectId: string;
  status:
    TeacherAssignmentStatus;
  availableFrom: string;
  dueAt: string;
  solutionVisibility:
    TeacherSolutionVisibility;
  userEmails: string;
  groupIds: string[];
};

const field =
  "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-200";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(
      /[^a-z0-9]+/g,
      "-",
    )
    .replace(/^-|-$/g, "");
}

function localDateTime(
  value:
    | string
    | null
    | undefined,
) {
  if (!value) {
    return "";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "";
  }

  const pad = (part: number) =>
    String(part).padStart(
      2,
      "0",
    );

  return [
    `${date.getFullYear()}-${pad(
      date.getMonth() + 1,
    )}-${pad(date.getDate())}`,
    `${pad(
      date.getHours(),
    )}:${pad(
      date.getMinutes(),
    )}`,
  ].join("T");
}

function emailsFromText(
  value: string,
) {
  return [
    ...new Set(
      value
        .split(/[\n,;]+/)
        .map((item) =>
          item
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    ),
  ];
}

function pendingInvites(
  assignment:
    TeacherAssignment | null,
) {
  return (
    assignment?.invites ?? []
  ).filter(
    (invite) =>
      !invite.acceptedAt &&
      !invite.revokedAt,
  );
}

function recipientText(
  assignment:
    TeacherAssignment,
) {
  return [
    ...new Set(
      [
        ...assignment.users.map(
          (row) =>
            row.user.email,
        ),
        ...pendingInvites(
          assignment,
        ).map(
          (invite) =>
            invite.email,
        ),
      ]
        .filter(
          (
            email,
          ): email is string =>
            Boolean(email),
        )
        .map((email) =>
          email.toLowerCase(),
        ),
    ),
  ].join("\n");
}

function formFromAssignment(
  assignment:
    TeacherAssignment,
): FormState {
  return {
    title: assignment.title,
    slug: assignment.slug,
    description:
      assignment.description ??
      "",
    subjectId:
      assignment.subjectId,
    status:
      assignment.status,
    availableFrom:
      localDateTime(
        assignment.availableFrom,
      ),
    dueAt:
      localDateTime(
        assignment.dueAt,
      ),
    solutionVisibility:
      assignment.solutionVisibility,
    userEmails:
      recipientText(
        assignment,
      ),
    groupIds:
      assignment.groups.map(
        (row) =>
          row.groupId,
      ),
  };
}

function emptyForm(
  courses:
    TeacherAssignmentCourse[],
): FormState {
  return {
    title: "",
    slug: "",
    description: "",
    subjectId:
      courses[0]?.id ?? "",
    status: "draft",
    availableFrom: "",
    dueAt: "",
    solutionVisibility:
      "instructor_only",
    userEmails: "",
    groupIds: [],
  };
}

export function TeacherAssignmentEditor(props: {
  apiOrigin: string;
  locale: string;
  assignmentId: string | null;
}) {
  const t =
    useTranslations(
      "Teacher.assignments",
    );

  const assignmentClient =
    useMemo(
      () =>
        createTeacherAssignmentsClient({
          apiOrigin:
            props.apiOrigin,
        }),
      [props.apiOrigin],
    );

  const classesClient =
    useMemo(
      () =>
        createTeacherClassesClient({
          apiOrigin:
            props.apiOrigin,
        }),
      [props.apiOrigin],
    );

  const isNew =
    props.assignmentId ===
    null;

  const [
    assignment,
    setAssignment,
  ] = useState<
    TeacherAssignment | null
  >(null);
  const [courses, setCourses] =
    useState<
      TeacherAssignmentCourse[]
    >([]);
  const [groups, setGroups] =
    useState<GroupOption[]>([]);
  const [form, setForm] =
    useState<FormState>(
      emptyForm([]),
    );
  const [loading, setLoading] =
    useState(true);
  const [busy, setBusy] =
    useState(false);
  const [error, setError] =
    useState<string | null>(
      null,
    );
  const [notice, setNotice] =
    useState<string | null>(
      null,
    );

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    const assignmentPromise =
      props.assignmentId
        ? assignmentClient.get(
            props.assignmentId,
            props.locale,
          )
        : Promise.resolve(null);

    void Promise.all([
      assignmentClient
        .editorBootstrap(
          props.locale,
        ),
      classesClient.list(),
      assignmentPromise,
    ])
      .then(
        ([
          bootstrap,
          classResult,
          assignmentResult,
        ]) => {
          if (cancelled) {
            return;
          }

          setCourses(
            bootstrap.courses,
          );

          setGroups(
            classResult.groups.map(
              (group) => ({
                id: group.id,
                name: group.name,
                slug: group.slug,
                memberCount:
                  group.members.filter(
                    (row) =>
                      row.role !==
                      "instructor",
                  ).length,
              }),
            ),
          );

          if (
            assignmentResult
          ) {
            setAssignment(
              assignmentResult
                .assignment,
            );
            setForm(
              formFromAssignment(
                assignmentResult
                  .assignment,
              ),
            );
          } else {
            setAssignment(null);
            setForm(
              emptyForm(
                bootstrap.courses,
              ),
            );
          }

          setLoading(false);
        },
      )
      .catch((cause) => {
        if (cancelled) {
          return;
        }

        setLoading(false);

        if (
          cause instanceof
            ApiClientError &&
          cause.status === 404
        ) {
          setError(
            t(
              "errors.notFound",
            ),
          );
        } else if (
          cause instanceof
            ApiClientError &&
          cause.status === 403
        ) {
          setError(
            t(
              "errors.forbidden",
            ),
          );
        } else {
          setError(
            t(
              "errors.loadEditor",
            ),
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    assignmentClient,
    classesClient,
    props.assignmentId,
    props.locale,
    t,
  ]);

  const selectedCourse =
    courses.find(
      (course) =>
        course.id ===
        form.subjectId,
    ) ?? null;

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);

    const input:
      TeacherAssignmentInput = {
        title: form.title,
        slug:
          form.slug ||
          slugify(
            form.title,
          ),
        description:
          form.description ||
          null,
        subjectId:
          form.subjectId,
        status:
          form.status,
        availableFrom:
          form.availableFrom
            ? new Date(
                form.availableFrom,
              ).toISOString()
            : null,
        dueAt:
          form.dueAt
            ? new Date(
                form.dueAt,
              ).toISOString()
            : null,
        solutionVisibility:
          form.solutionVisibility,
        userEmails:
          emailsFromText(
            form.userEmails,
          ),
        groupIds:
          form.groupIds,
      };

    try {
      const result =
        props.assignmentId
          ? await assignmentClient.update(
              props.assignmentId,
              input,
            )
          : await assignmentClient.create(
              input,
            );

      if (!props.assignmentId) {
        navigate(
          `/assignments/${result.assignment.id}`,
          {
            replace: true,
            locale:
              props.locale,
            scroll: true,
          },
        );
        return;
      }

      setAssignment(
        result.assignment,
      );

      if (
        result.pendingInvites
          .length === 1
      ) {
        setNotice(
          t(
            "notices.savedOnePending",
          ),
        );
      } else if (
        result.pendingInvites
          .length > 1
      ) {
        setNotice(
          t(
            "notices.savedManyPending",
            {
              count:
                result
                  .pendingInvites
                  .length,
            },
          ),
        );
      } else {
        setNotice(
          t(
            "notices.saved",
          ),
        );
      }
    } catch (cause) {
      if (
        cause instanceof
          ApiClientError &&
        cause.status === 403
      ) {
        setError(
          t(
            "errors.forbidden",
          ),
        );
      } else {
        setError(
          t(
            "errors.save",
          ),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function destroy() {
    if (
      !props.assignmentId ||
      !window.confirm(
        t(
          "editor.deleteConfirm",
        ),
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await assignmentClient.remove(
        props.assignmentId,
      );

      navigate(
        "/assignments",
        {
          replace: true,
          locale: props.locale,
          scroll: true,
        },
      );
    } catch {
      setError(
        t(
          "errors.delete",
        ),
      );
      setBusy(false);
    }
  }

  function patchInvite(
    email: string,
    patch: {
      expiresAt?: string;
      sentAt?: string | null;
    },
  ) {
    setAssignment(
      (current) =>
        current
          ? {
              ...current,
              invites:
                current.invites.map(
                  (invite) =>
                    invite.email ===
                    email
                      ? {
                          ...invite,
                          ...patch,
                        }
                      : invite,
                ),
            }
          : current,
    );
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <div className="rounded-xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
          {t("loadingEditor")}
        </div>
      </main>
    );
  }

  if (
    error &&
    !isNew &&
    !assignment
  ) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
          {error}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t(
                isNew
                  ? "editor.newTitle"
                  : "editor.editTitle",
              )}
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              {t(
                "editor.accessNote",
              )}
            </p>
          </div>

          <div className="flex gap-2">
            {!isNew ? (
              <button
                type="button"
                className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700"
                onClick={() => {
                  void destroy();
                }}
                disabled={busy}
              >
                {t(
                  "editor.delete",
                )}
              </button>
            ) : null}

            <button
              type="button"
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              onClick={() => {
                void save();
              }}
              disabled={
                busy ||
                !form.subjectId
              }
            >
              {t(
                busy
                  ? "editor.saving"
                  : "editor.save",
              )}
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {notice ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            {notice}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5">
            <h2 className="font-semibold">
              {t(
                "editor.content",
              )}
            </h2>

            <label className="block text-xs font-medium text-neutral-600">
              {t(
                "editor.course",
              )}
              <select
                className={field}
                value={
                  form.subjectId
                }
                onChange={(
                  event,
                ) =>
                  setForm(
                    (current) => ({
                      ...current,
                      subjectId:
                        event.target
                          .value,
                    }),
                  )
                }
              >
                {courses.map(
                  (course) => (
                    <option
                      key={
                        course.id
                      }
                      value={
                        course.id
                      }
                    >
                      {
                        course.title
                      }{" "}
                      (
                      {
                        course.slug
                      })
                    </option>
                  ),
                )}
              </select>
            </label>

            {selectedCourse ? (
              <div className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                {t(
                  "editor.courseAccess",
                  {
                    visibility:
                      t(
                        `visibility.${selectedCourse.visibility}`,
                      ),
                  },
                )}
              </div>
            ) : null}

            <label className="block text-xs font-medium text-neutral-600">
              {t(
                "editor.assignmentTitle",
              )}
              <input
                className={field}
                value={form.title}
                onChange={(
                  event,
                ) =>
                  setForm(
                    (current) => ({
                      ...current,
                      title:
                        event.target
                          .value,
                      slug:
                        current.slug ||
                        slugify(
                          event.target
                            .value,
                        ),
                    }),
                  )
                }
              />
            </label>

            <label className="block text-xs font-medium text-neutral-600">
              {t("editor.slug")}
              <input
                className={field}
                value={form.slug}
                onChange={(
                  event,
                ) =>
                  setForm(
                    (current) => ({
                      ...current,
                      slug:
                        event.target
                          .value,
                    }),
                  )
                }
              />
            </label>

            <label className="block text-xs font-medium text-neutral-600">
              {t(
                "editor.instructions",
              )}
              <textarea
                className={field}
                rows={5}
                value={
                  form.description
                }
                onChange={(
                  event,
                ) =>
                  setForm(
                    (current) => ({
                      ...current,
                      description:
                        event.target
                          .value,
                    }),
                  )
                }
              />
            </label>
          </section>

          <section className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5">
            <h2 className="font-semibold">
              {t(
                "editor.delivery",
              )}
            </h2>

            <label className="block text-xs font-medium text-neutral-600">
              {t(
                "editor.status",
              )}
              <select
                className={field}
                value={form.status}
                onChange={(
                  event,
                ) =>
                  setForm(
                    (current) => ({
                      ...current,
                      status:
                        event.target
                          .value as
                          TeacherAssignmentStatus,
                    }),
                  )
                }
              >
                <option value="draft">
                  {t(
                    "status.draft",
                  )}
                </option>
                <option value="assigned">
                  {t(
                    "status.assigned",
                  )}
                </option>
                <option value="closed">
                  {t(
                    "status.closed",
                  )}
                </option>
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-medium text-neutral-600">
                {t(
                  "editor.opens",
                )}
                <input
                  type="datetime-local"
                  className={field}
                  value={
                    form.availableFrom
                  }
                  onChange={(
                    event,
                  ) =>
                    setForm(
                      (
                        current,
                      ) => ({
                        ...current,
                        availableFrom:
                          event
                            .target
                            .value,
                      }),
                    )
                  }
                />
              </label>

              <label className="block text-xs font-medium text-neutral-600">
                {t("editor.due")}
                <input
                  type="datetime-local"
                  className={field}
                  value={
                    form.dueAt
                  }
                  onChange={(
                    event,
                  ) =>
                    setForm(
                      (
                        current,
                      ) => ({
                        ...current,
                        dueAt:
                          event
                            .target
                            .value,
                      }),
                    )
                  }
                />
              </label>
            </div>

            <label className="block text-xs font-medium text-neutral-600">
              {t(
                "editor.solutionVisibility",
              )}
              <select
                className={field}
                value={
                  form.solutionVisibility
                }
                onChange={(
                  event,
                ) =>
                  setForm(
                    (current) => ({
                      ...current,
                      solutionVisibility:
                        event.target
                          .value as
                          TeacherSolutionVisibility,
                    }),
                  )
                }
              >
                <option value="instructor_only">
                  {t(
                    "solutionVisibility.instructor_only",
                  )}
                </option>
                <option value="after_completion">
                  {t(
                    "solutionVisibility.after_completion",
                  )}
                </option>
                <option value="after_due_date">
                  {t(
                    "solutionVisibility.after_due_date",
                  )}
                </option>
                <option value="always">
                  {t(
                    "solutionVisibility.always",
                  )}
                </option>
              </select>
            </label>
          </section>

          <section className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5 lg:col-span-2">
            <h2 className="font-semibold">
              {t(
                "editor.audience",
              )}
            </h2>

            <div className="grid gap-5 lg:grid-cols-2">
              <label className="block text-xs font-medium text-neutral-600">
                {t(
                  "editor.studentEmails",
                )}
                <textarea
                  className={field}
                  rows={7}
                  placeholder={t(
                    "editor.emailPlaceholder",
                  )}
                  value={
                    form.userEmails
                  }
                  onChange={(
                    event,
                  ) =>
                    setForm(
                      (
                        current,
                      ) => ({
                        ...current,
                        userEmails:
                          event
                            .target
                            .value,
                      }),
                    )
                  }
                />
                <span className="mt-1 block text-[11px] text-neutral-500">
                  {t(
                    "editor.emailHint",
                  )}
                </span>
              </label>

              <div>
                <div className="text-xs font-medium text-neutral-600">
                  {t(
                    "editor.groups",
                  )}
                </div>

                <div className="mt-2 grid gap-2">
                  {groups.length ? (
                    groups.map(
                      (group) => {
                        const checked =
                          form.groupIds.includes(
                            group.id,
                          );

                        return (
                          <label
                            key={
                              group.id
                            }
                            className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                          >
                            <span>
                              {
                                group.name
                              }{" "}
                              <span className="text-xs text-neutral-500">
                                {t(
                                  "editor.groupMembers",
                                  {
                                    count:
                                      group.memberCount,
                                  },
                                )}
                              </span>
                            </span>

                            <input
                              type="checkbox"
                              checked={
                                checked
                              }
                              onChange={(
                                event,
                              ) =>
                                setForm(
                                  (
                                    current,
                                  ) => ({
                                    ...current,
                                    groupIds:
                                      event
                                        .target
                                        .checked
                                        ? [
                                            ...current.groupIds,
                                            group.id,
                                          ]
                                        : current.groupIds.filter(
                                            (
                                              id,
                                            ) =>
                                              id !==
                                              group.id,
                                          ),
                                  }),
                                )
                              }
                            />
                          </label>
                        );
                      },
                    )
                  ) : (
                    <div className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-500">
                      {t(
                        "editor.noGroups",
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {!isNew &&
          assignment ? (
            <TeacherAssignmentInvites
              apiOrigin={
                props.apiOrigin
              }
              assignmentId={
                assignment.id
              }
              locale={
                props.locale
              }
              invites={
                assignment.invites
              }
              enabled={
                assignment.status ===
                "assigned"
              }
              onNotice={
                setNotice
              }
              onError={
                setError
              }
              onInviteChanged={
                patchInvite
              }
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}
