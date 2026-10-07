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
  type TeacherClassStatus,
} from "./teacherClassesClient";
import { TeacherClassInvites } from "./TeacherClassInvites";

type FormState = {
  name: string;
  slug: string;
  description: string;
  organizationId: string;
  memberEmails: string;
};

type EditorSection = "all" | "details" | "students";

const emptyForm: FormState = {
  name: "",
  slug: "",
  description: "",
  organizationId: "",
  memberEmails: "",
};

const field =
  "ui-focus-ring ui-border-soft ui-bg-surface ui-text w-full rounded-md border px-3 py-2 text-sm mt-1";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeMemberEmails(value: string) {
  return [
    ...new Set(
      value
        .split(/[\n,;]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export function TeacherClassEditor(props: {
  apiOrigin: string;
  locale: string;
  classId: string | null;
  classStatus?: TeacherClassStatus;
  section?: EditorSection;
  embedded?: boolean;
}) {
  const t = useTranslations("Teacher.classes");
  const client = useMemo(
    () =>
      createTeacherClassesClient({
        apiOrigin: props.apiOrigin,
      }),
    [props.apiOrigin],
  );

  const isNew = props.classId === null;
  const section = props.section ?? "all";
  const showDetails = section === "all" || section === "details";
  const showStudents = section === "all" || section === "students";

  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schools, setSchools] = useState<
    Array<{ id: string; name: string; slug: string }>
  >([]);
  const [invites, setInvites] = useState<TeacherClassInvite[]>([]);
  const [classStatus, setClassStatus] = useState<TeacherClassStatus>("draft");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(!isNew);
    setError(null);

    const schoolPromise = client.listSchools();
    const classPromise = props.classId
      ? client.get(props.classId)
      : Promise.resolve(null);

    void Promise.all([schoolPromise, classPromise])
      .then(([schoolResult, classResult]) => {
        if (cancelled) return;

        setSchools(schoolResult.schools);

        if (classResult) {
          const { group } = classResult;
          setForm({
            name: group.name,
            slug: group.slug,
            description: group.description ?? "",
            organizationId:
              group.organizationId ?? group.organization?.id ?? "",
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
          setClassStatus(group.status);
        } else {
          setForm(emptyForm);
          setInvites([]);
          setClassStatus("draft");
        }

        setLoading(false);
      })
      .catch((cause) => {
        if (cancelled) return;

        setError(
          cause instanceof ApiClientError && cause.status === 404
            ? t("errors.notFound")
            : cause instanceof ApiClientError && cause.status === 403
              ? t("errors.forbidden")
              : t(props.classId ? "errors.loadOne" : "errors.loadSchools"),
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [client, isNew, props.classId, t]);

  function apiErrorMessage(
    cause: unknown,
    fallbackKey: "errors.save" | "errors.delete",
  ) {
    if (cause instanceof ApiClientError) {
      if (cause.status === 403) return t("errors.forbidden");

      const payload = cause.payload;
      if (
        payload &&
        typeof payload === "object" &&
        "missingEmails" in payload &&
        Array.isArray(payload.missingEmails)
      ) {
        return t("errors.missingAccounts", {
          emails: payload.missingEmails.map(String).join(", "),
        });
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
      slug: form.slug || slugify(form.name),
      description: form.description || null,
      organizationId: form.organizationId || null,
      memberEmails: normalizeMemberEmails(form.memberEmails),
    };

    try {
      const { group } = props.classId
        ? await client.update(props.classId, input)
        : await client.create(input);

      setInvites(group.invites ?? []);
      setClassStatus(group.status);
      if (props.classId) {
        setNotice(t("editor.saved"));
        setBusy(false);
        return;
      }

      navigate(`/classes/${group.id}`, {
        replace: true,
        locale: props.locale,
        scroll: true,
      });
    } catch (cause) {
      setError(apiErrorMessage(cause, "errors.save"));
      setBusy(false);
    }
  }

  async function destroy() {
    if (
      !props.classId ||
      !window.confirm(t("editor.deleteConfirm"))
    ) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await client.remove(props.classId);
      navigate("/classes", {
        replace: true,
        locale: props.locale,
        scroll: true,
      });
    } catch (cause) {
      setError(apiErrorMessage(cause, "errors.delete"));
      setBusy(false);
    }
  }

  if (loading) {
    const loadingBody = (
      <div className="ui-surface rounded-xl p-6 text-sm text-neutral-500">
        {t("loading")}
      </div>
    );
    return props.embedded ? (
      <section>{loadingBody}</section>
    ) : (
      <main className="mx-auto max-w-3xl p-6">{loadingBody}</main>
    );
  }

  const title =
    section === "students"
      ? t("editor.studentsTitle")
      : section === "details"
        ? t("editor.detailsTitle")
        : t(isNew ? "editor.newTitle" : "editor.editTitle");

  const body = (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-neutral-500">
            {section === "students"
              ? t("editor.studentsSubtitle")
              : section === "details"
                ? t("editor.detailsSubtitle")
                : t("editor.subtitle")}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="ui-btn-primary h-9 px-4 disabled:opacity-50"
          >
            {t(busy ? "editor.saving" : "editor.save")}
          </button>
        </div>
      </div>

      {notice ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          {notice}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {showDetails ? (
        <div className="space-y-4">
          <label className="block text-xs font-medium text-neutral-600 dark:text-white/65">
            {t("editor.name")}
            <input
              className={["ui-input-ide", (field)].filter(Boolean).join(" ")}
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </label>

          <label className="block text-xs font-medium text-neutral-600 dark:text-white/65">
            {t("editor.description")}
            <textarea
              className={field}
              rows={4}
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </label>

          <label className="block text-xs font-medium text-neutral-600 dark:text-white/65">
            {t("editor.school")}
            <select
              className={field}
              value={form.organizationId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  organizationId: event.target.value,
                }))
              }
            >
              <option value="">{t("editor.noSchool")}</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-neutral-500">
              {t("editor.schoolHint")}
            </span>
          </label>
        </div>
      ) : null}

      {showStudents ? (
        <div className="space-y-4">
          <label className="block text-xs font-medium text-neutral-600 dark:text-white/65">
            {t("editor.studentEmails")}
            <textarea
              className={field}
              rows={10}
              value={form.memberEmails}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  memberEmails: event.target.value,
                }))
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
              classStatus={props.classStatus ?? classStatus}
              onNotice={setNotice}
              onError={setError}
              onInviteChanged={(email, patch) => {
                setInvites((current) =>
                  current.map((invite) =>
                    invite.email === email
                      ? { ...invite, ...patch }
                      : invite,
                  ),
                );
              }}
            />
          ) : null}
        </div>
      ) : null}

      {!isNew && showDetails ? (
        <section className="rounded-xl border border-red-200 p-5 dark:border-red-500/25">
          <h3 className="font-semibold text-red-700 dark:text-red-300">
            {t("editor.dangerTitle")}
          </h3>
          <p className="mt-1 text-sm text-neutral-500">
            {t("editor.dangerBody")}
          </p>
          <button
            type="button"
            onClick={() => void destroy()}
            disabled={busy}
            className="mt-4 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50 dark:border-red-500/40 dark:text-red-300"
          >
            {t("editor.delete")}
          </button>
        </section>
      ) : null}
    </div>
  );

  return props.embedded ? (
    <section className="max-w-3xl">{body}</section>
  ) : (
    <main className="mx-auto max-w-3xl p-6">{body}</main>
  );
}
