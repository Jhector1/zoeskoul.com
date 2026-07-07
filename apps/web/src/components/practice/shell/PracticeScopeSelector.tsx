"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTaggedT } from "@/i18n/tagged";

type PracticeModuleOption = {
  slug: string;
  title: string;
};

type PracticeSubjectOption = {
  slug: string;
  title: string;
  modules: PracticeModuleOption[];
};

type CatalogSubjectsPayload = {
  subjects?: Array<{
    slug?: string;
    title?: string;
    modules?: Array<{ slug?: string; title?: string }>;
  }>;
};

function normalizeSubjects(payload: CatalogSubjectsPayload | null): PracticeSubjectOption[] {
  if (!Array.isArray(payload?.subjects)) return [];

  return payload.subjects
    .map((subject) => ({
      slug: String(subject.slug ?? "").trim(),
      title: String(subject.title ?? subject.slug ?? "").trim(),
      modules: Array.isArray(subject.modules)
        ? subject.modules
            .map((module) => ({
              slug: String(module.slug ?? "").trim(),
              title: String(module.title ?? module.slug ?? "").trim(),
            }))
            .filter((module) => module.slug)
        : [],
    }))
    .filter((subject) => subject.slug && subject.modules.length > 0);
}

export default function PracticeScopeSelector({
  locale,
  subjectSlug,
  moduleSlug,
  enabled,
  catalogVisible = true,
  showModule = true,
  lockedReason,
}: {
  locale: string;
  subjectSlug?: string;
  moduleSlug?: string;
  enabled: boolean;
  catalogVisible?: boolean;
  showModule?: boolean;
  lockedReason?: string | null;
}) {
  const router = useRouter();
  const t = useTranslations("Practice.workspace");
  const tagged = useTaggedT();
  const [subjects, setSubjects] = useState<PracticeSubjectOption[]>([]);
  const [loading, setLoading] = useState(catalogVisible);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!catalogVisible) {
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    void fetch("/api/catalog/subjects", {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Practice subjects request failed (${response.status}).`);
        }
        return (await response.json()) as CatalogSubjectsPayload;
      })
      .then((payload) => {
        if (!controller.signal.aborted) {
          setSubjects(normalizeSubjects(payload));
        }
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        console.error("[practice scope selector]", cause);
        setError(t("subjectsUnavailable"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [catalogVisible, t]);

  const activeSubject = useMemo(
    () => subjects.find((subject) => subject.slug === subjectSlug) ?? null,
    [subjectSlug, subjects],
  );

  const navigate = (nextSubject: string, nextModule: string) => {
    if (!enabled || !nextSubject || !nextModule) return;
    router.push(
      `/${encodeURIComponent(locale)}/subjects/${encodeURIComponent(nextSubject)}` +
        `/modules/${encodeURIComponent(nextModule)}/practice`,
      { scroll: false },
    );
  };

  const statusLabel = enabled
    ? t("subscriber")
    : catalogVisible
      ? t("locked")
      : t("fixed");

  return (
    <div className="ui-surface-muted p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="ui-meta-strong">{t("scopeTitle")}</div>
        <span className="ui-pill-neutral">{statusLabel}</span>
      </div>

      {catalogVisible ? (
        <div className="mt-3 grid gap-3">
          <label className="grid gap-1.5">
            <span className="ui-meta">{t("subject")}</span>
            <select
              className="ui-select-ide mt-0 w-full disabled:cursor-not-allowed disabled:opacity-65"
              value={subjectSlug ?? ""}
              disabled={!enabled || loading || subjects.length === 0}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
                const nextSubject = subjects.find(
                  (subject) => subject.slug === event.target.value,
                );
                const firstModule = nextSubject?.modules[0];
                if (nextSubject && firstModule) {
                  navigate(nextSubject.slug, firstModule.slug);
                }
              }}
            >
              {!subjectSlug ? <option value="">{t("chooseSubject")}</option> : null}
              {subjectSlug && !activeSubject ? (
                <option value={subjectSlug}>{subjectSlug}</option>
              ) : null}
              {subjects.map((subject) => (
                <option key={subject.slug} value={subject.slug}>
                  {tagged.resolve(subject.title, subject.slug)}
                </option>
              ))}
            </select>
          </label>

          {showModule ? (
            <label className="grid gap-1.5">
              <span className="ui-meta">{t("module")}</span>
              <select
                className="ui-select-ide mt-0 w-full disabled:cursor-not-allowed disabled:opacity-65"
                value={moduleSlug ?? ""}
                disabled={!enabled || loading || !activeSubject}
                onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
                  if (activeSubject) {
                    navigate(activeSubject.slug, event.target.value);
                  }
                }}
              >
                {!moduleSlug ? <option value="">{t("chooseModule")}</option> : null}
                {moduleSlug && !activeSubject?.modules.some((module) => module.slug === moduleSlug) ? (
                  <option value={moduleSlug}>{moduleSlug}</option>
                ) : null}
                {(activeSubject?.modules ?? []).map((module) => (
                  <option key={module.slug} value={module.slug}>
                    {tagged.resolve(module.title, module.slug)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {loading ? <div className="ui-meta">{t("loadingSubjects")}</div> : null}
          {error ? <div className="text-xs text-[rgb(var(--ui-danger)/1)]">{error}</div> : null}
          {!enabled && lockedReason ? <div className="ui-meta">{lockedReason}</div> : null}
        </div>
      ) : (
        <div className="mt-2">
          <div className="truncate text-sm font-semibold">
            {subjectSlug || t("dailyFallback")}
          </div>
          {showModule && moduleSlug ? <div className="mt-0.5 truncate ui-meta">{moduleSlug}</div> : null}
          {lockedReason ? <div className="mt-2 ui-meta">{lockedReason}</div> : null}
        </div>
      )}
    </div>
  );
}
