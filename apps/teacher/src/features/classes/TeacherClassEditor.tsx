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
  type TeacherClassInput,
  type TeacherClassInvite,
} from "./teacherClassesClient";
import { TeacherClassInvites } from "./TeacherClassInvites";

type FormState = {
  name: string;
  slug: string;
  description: string;
  organizationId: string;
  memberEmails: string;
};

const emptyForm: FormState = {
  name: "",
  slug: "",
  description: "",
  organizationId: "",
  memberEmails: "",
};

const field =
  "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-200";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeMemberEmails(
  value: string,
) {
  return [
    ...new Set(
      value
        .split(/[\n,;]+/)
        .map((item) =>
          item.trim().toLowerCase(),
        )
        .filter(Boolean),
    ),
  ];
}

export function TeacherClassEditor(props: {
  apiOrigin: string;
  locale: string;
  classId: string | null;
}) {
  const t =
    useTranslations(
      "Teacher.classes",
    );
  const client =
    useMemo(
      () =>
        createTeacherClassesClient({
          apiOrigin:
            props.apiOrigin,
        }),
      [props.apiOrigin],
    );

  const isNew =
    props.classId === null;

  const [form, setForm] =
    useState<FormState>(
      emptyForm,
    );
  const [loading, setLoading] =
    useState(!isNew);
  const [busy, setBusy] =
    useState(false);
  const [error, setError] =
    useState<string | null>(
      null,
    );
  const [schools, setSchools] =
    useState<
      Array<{
        id: string;
        name: string;
        slug: string;
      }>
    >([]);

  const [invites, setInvites] = useState<TeacherClassInvite[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(!isNew);
    setError(null);

    const schoolPromise =
      client.listSchools();
    const classPromise =
      props.classId
        ? client.get(props.classId)
        : Promise.resolve(null);

    void Promise.all([
      schoolPromise,
      classPromise,
    ])
      .then(
        ([
          schoolResult,
          classResult,
        ]) => {
          if (cancelled) {
            return;
          }

          setSchools(
            schoolResult.schools,
          );

          if (classResult) {
            const { group } =
              classResult;

            setForm({
              name: group.name,
              slug: group.slug,
              description:
                group.description ??
                "",
              organizationId:
                group.organizationId ??
                group.organization?.id ??
                "",
              memberEmails: [
                ...new Set([
                  ...group.members
                    .filter((row) => row.role !== "instructor")
                    .map((row) => row.user.email)
                    .filter((email): email is string => Boolean(email)),
                  ...(group.invites ?? [])
                    .filter((invite) => !invite.acceptedAt && !invite.revokedAt)
                    .map((invite) => invite.email),
                ]),
              ].join("\n"),
            });
            setInvites(group.invites ?? []);
          } else {
            setForm(emptyForm);
            setInvites([]);
          }

          setLoading(false);
        },
      )
      .catch((cause) => {
        if (cancelled) {
          return;
        }

        setError(
          cause instanceof
              ApiClientError &&
            cause.status === 404
            ? t("errors.notFound")
            : cause instanceof
                  ApiClientError &&
                cause.status === 403
              ? t("errors.forbidden")
              : t(
                  props.classId
                    ? "errors.loadOne"
                    : "errors.loadSchools",
                ),
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    client,
    isNew,
    props.classId,
    t,
  ]);

  function apiErrorMessage(
    cause: unknown,
    fallbackKey:
      | "errors.save"
      | "errors.delete",
  ) {
    if (
      cause instanceof
        ApiClientError
    ) {
      if (cause.status === 403) {
        return t(
          "errors.forbidden",
        );
      }

      const payload =
        cause.payload;

      if (
        payload &&
        typeof payload ===
          "object" &&
        "missingEmails" in payload &&
        Array.isArray(
          payload.missingEmails,
        )
      ) {
        return t(
          "errors.missingAccounts",
          {
            emails:
              payload.missingEmails
                .map(String)
                .join(", "),
          },
        );
      }
    }

    return t(fallbackKey);
  }

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);

    const input: TeacherClassInput = {
      name: form.name,
      slug:
        form.slug ||
        slugify(form.name),
      description:
        form.description ||
        null,
      organizationId:
        form.organizationId ||
        null,
      memberEmails:
        normalizeMemberEmails(
          form.memberEmails,
        ),
    };

    try {
      const { group } =
        props.classId
          ? await client.update(
              props.classId,
              input,
            )
          : await client.create(
              input,
            );

      setInvites(group.invites ?? []);
      if (props.classId) {
        setNotice(t("editor.saved"));
        setBusy(false);
        return;
      }
      navigate(
        `/classes/${group.id}`,
        {
          replace: true,
          locale: props.locale,
          scroll: true,
        },
      );
    } catch (cause) {
      setError(
        apiErrorMessage(
          cause,
          "errors.save",
        ),
      );
      setBusy(false);
    }
  }

  async function destroy() {
    if (
      !props.classId ||
      !window.confirm(
        t("editor.deleteConfirm"),
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await client.remove(
        props.classId,
      );

      navigate(
        "/classes",
        {
          replace: true,
          locale: props.locale,
          scroll: true,
        },
      );
    } catch (cause) {
      setError(
        apiErrorMessage(
          cause,
          "errors.delete",
        ),
      );
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <div className="rounded-xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
          {t("loading")}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">
              {t(
                isNew
                  ? "editor.newTitle"
                  : "editor.editTitle",
              )}
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              {t("editor.subtitle")}
            </p>
          </div>

          <div className="flex gap-2">
            {!isNew ? (
              <button
                type="button"
                onClick={() => {
                  void destroy();
                }}
                disabled={busy}
                className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-700"
              >
                {t("editor.delete")}
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => {
                void save();
              }}
              disabled={busy}
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {t(
                busy
                  ? "editor.saving"
                  : "editor.save",
              )}
            </button>
          </div>
        </div>

        {notice ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            {notice}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div className="space-y-4">
          <label className="block text-xs font-medium text-neutral-600">
            {t("editor.name")}
            <input
              className={field}
              value={form.name}
              onChange={(event) =>
                setForm(
                  (current) => ({
                    ...current,
                    name:
                      event.target.value,
                    slug:
                      current.slug ||
                      slugify(
                        event.target.value,
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
              onChange={(event) =>
                setForm(
                  (current) => ({
                    ...current,
                    slug:
                      event.target.value,
                  }),
                )
              }
            />
          </label>

          <label className="block text-xs font-medium text-neutral-600">
            {t(
              "editor.description",
            )}
            <textarea
              className={field}
              rows={3}
              value={form.description}
              onChange={(event) =>
                setForm(
                  (current) => ({
                    ...current,
                    description:
                      event.target.value,
                  }),
                )
              }
            />
          </label>

          <label className="block text-xs font-medium text-neutral-600">
            {t("editor.school")}
            <select
              className={field}
              value={
                form.organizationId
              }
              onChange={(event) =>
                setForm(
                  (current) => ({
                    ...current,
                    organizationId:
                      event.target.value,
                  }),
                )
              }
            >
              <option value="">
                {t(
                  "editor.noSchool",
                )}
              </option>
              {schools.map(
                (school) => (
                  <option
                    key={school.id}
                    value={school.id}
                  >
                    {school.name}
                  </option>
                ),
              )}
            </select>
            <span className="mt-1 block text-[11px] text-neutral-500">
              {t(
                "editor.schoolHint",
              )}
            </span>
          </label>

          <label className="block text-xs font-medium text-neutral-600">
            {t(
              "editor.studentEmails",
            )}
            <textarea
              className={field}
              rows={10}
              value={form.memberEmails}
              onChange={(event) =>
                setForm(
                  (current) => ({
                    ...current,
                    memberEmails:
                      event.target.value,
                  }),
                )
              }
            />
            <span className="mt-1 block text-[11px] text-neutral-500">
              {t("editor.emailHint")}
            </span>
          </label>

          {!isNew && props.classId ? (
            <TeacherClassInvites
              apiOrigin={props.apiOrigin}
              classId={props.classId}
              locale={props.locale}
              invites={invites}
              onNotice={setNotice}
              onError={setError}
              onInviteChanged={(email, patch) => {
                setInvites((current) =>
                  current.map((invite) =>
                    invite.email === email ? { ...invite, ...patch } : invite,
                  ),
                );
              }}
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}
