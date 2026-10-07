import {
  ApiClientError,
} from "@zoeskoul/api-client";
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
  navigate,
} from "../../compat/navigation-runtime";
import {
  createTeacherClassesClient,
} from "./teacherClassesClient";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeEmails(value: string) {
  return [
    ...new Set(
      value
        .split(/[\n,;]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

const field =
  "ui-focus-ring ui-border-soft ui-bg-surface ui-text w-full rounded-md border px-3 py-2 text-sm mt-1";

export function TeacherClassCreateWizard(props: {
  apiOrigin: string;
  locale: string;
}) {
  const t = useTranslations("Teacher.classes");
  const client = useMemo(
    () =>
      createTeacherClassesClient({
        apiOrigin: props.apiOrigin,
      }),
    [props.apiOrigin],
  );

  const [step, setStep] = useState(0);
  const [schools, setSchools] = useState<
    Array<{ id: string; name: string; slug: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    organizationId: "",
    name: "",
    description: "",
    memberEmails: "",
  });

  useEffect(() => {
    let cancelled = false;

    void client
      .listSchools()
      .then(({ schools }) => {
        if (!cancelled) {
          setSchools(schools);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSchools([]);
          setError(t("errors.loadSchools"));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client, t]);

  const emails = normalizeEmails(form.memberEmails);
  const selectedSchool = schools.find(
    (school) => school.id === form.organizationId,
  );

  const stepKeys = [
    "institution",
    "details",
    "students",
    "review",
  ] as const;

  function canContinue() {
    return step !== 1 || form.name.trim().length > 0;
  }

  async function createClass() {
    if (!form.name.trim()) {
      setStep(1);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const { group } = await client.create({
        name: form.name.trim(),
        slug: slugify(form.name),
        description: form.description.trim() || null,
        organizationId: form.organizationId || null,
        memberEmails: emails,
      });

      navigate(`/classes/${group.id}`, {
        replace: true,
        locale: props.locale,
        scroll: true,
      });
    } catch (cause) {
      if (
        cause instanceof ApiClientError &&
        cause.status === 403
      ) {
        setError(t("errors.forbidden"));
      } else {
        setError(t("errors.save"));
      }
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <div className="ui-surface rounded-xl p-6 text-sm text-neutral-500">
          {t("wizard.loading")}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {t("wizard.kicker")}
          </div>
          <h1 className="mt-1 text-2xl font-semibold">
            {t("wizard.title")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">
            {t("wizard.subtitle")}
          </p>
        </div>

        <TeacherLink
          href="/classes"
          locale={props.locale}
          className="ui-btn-secondary h-9 px-3"
        >
          {t("wizard.cancel")}
        </TeacherLink>
      </div>

      <ol className="mt-6 grid gap-2 sm:grid-cols-4">
        {stepKeys.map((key, index) => (
          <li
            key={key}
            className={[
              "rounded-lg border px-3 py-3 text-sm",
              index === step
                ? "ui-border-strong ui-bg-surface-2 text-[rgb(var(--ui-text)/0.96)]"
                : index < step
                  ? "ui-border-soft ui-bg-surface text-[rgb(var(--ui-text-muted)/0.9)]"
                  : "ui-border-soft bg-transparent text-[rgb(var(--ui-text-muted)/0.58)]",
            ].join(" ")}
          >
            <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
              {t("wizard.step", { number: index + 1 })}
            </div>
            <div className="mt-0.5 font-medium">
              {t(`wizard.steps.${key}`)}
            </div>
          </li>
        ))}
      </ol>

      {error ? (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <section className="ui-surface mt-5 rounded-xl p-6">
        {step === 0 ? (
          <div>
            <h2 className="text-lg font-semibold">
              {t("wizard.institution.title")}
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              {t("wizard.institution.body")}
            </p>

            <label className="mt-5 block text-sm font-medium">
              {t("wizard.institution.label")}
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
                <option value="">
                  {t("wizard.institution.independent")}
                </option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-3 text-xs text-neutral-500">
              {schools.length
                ? t("wizard.institution.hint")
                : t("wizard.institution.empty")}
              {" "}
              <TeacherLink
                href="/institution"
                locale={props.locale}
                className="font-medium underline underline-offset-2"
              >
                {t("wizard.institution.manage")}
              </TeacherLink>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold">
                {t("wizard.details.title")}
              </h2>
              <p className="mt-1 text-sm text-neutral-500">
                {t("wizard.details.body")}
              </p>
            </div>

            <label className="block text-sm font-medium">
              {t("editor.name")}
              <input
                autoFocus
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

            <label className="block text-sm font-medium">
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
          </div>
        ) : null}

        {step === 2 ? (
          <div>
            <h2 className="text-lg font-semibold">
              {t("wizard.students.title")}
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              {t("wizard.students.body")}
            </p>

            <label className="mt-5 block text-sm font-medium">
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
            </label>
            <div className="mt-2 text-xs text-neutral-500">
              {t("wizard.students.hint")}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div>
            <h2 className="text-lg font-semibold">
              {t("wizard.review.title")}
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              {t("wizard.review.body")}
            </p>

            <dl className="mt-5 divide-y divide-[rgb(var(--ui-border-soft)/1)] rounded-lg border ui-border-soft">
              <div className="grid gap-1 p-4 sm:grid-cols-[180px_1fr]">
                <dt className="text-sm text-neutral-500">
                  {t("wizard.review.institution")}
                </dt>
                <dd className="text-sm font-medium">
                  {selectedSchool?.name ??
                    t("wizard.institution.independent")}
                </dd>
              </div>
              <div className="grid gap-1 p-4 sm:grid-cols-[180px_1fr]">
                <dt className="text-sm text-neutral-500">
                  {t("wizard.review.name")}
                </dt>
                <dd className="text-sm font-medium">
                  {form.name}
                </dd>
              </div>
              <div className="grid gap-1 p-4 sm:grid-cols-[180px_1fr]">
                <dt className="text-sm text-neutral-500">
                  {t("wizard.review.status")}
                </dt>
                <dd className="text-sm font-medium">
                  {t("lifecycle.status.draft")}
                </dd>
              </div>
              <div className="grid gap-1 p-4 sm:grid-cols-[180px_1fr]">
                <dt className="text-sm text-neutral-500">
                  {t("wizard.review.students")}
                </dt>
                <dd className="text-sm font-medium">
                  {t("wizard.review.studentCount", {
                    count: emails.length,
                  })}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-between gap-3 border-t ui-border-soft pt-5">
          <button
            type="button"
            className="ui-btn-secondary h-9 px-4"
            disabled={step === 0 || busy}
            onClick={() => setStep((current) => Math.max(0, current - 1))}
          >
            {t("wizard.back")}
          </button>

          {step < stepKeys.length - 1 ? (
            <button
              type="button"
              className="ui-btn-primary h-9 px-4"
              disabled={!canContinue() || busy}
              onClick={() =>
                setStep((current) => Math.min(stepKeys.length - 1, current + 1))
              }
            >
              {step === 2
                ? t("wizard.reviewClass")
                : t("wizard.next")}
            </button>
          ) : (
            <button
              type="button"
              className="ui-btn-primary h-9 px-4"
              disabled={busy}
              onClick={() => void createClass()}
            >
              {busy
                ? t("wizard.creating")
                : t("wizard.create")}
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
