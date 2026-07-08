"use client";

import { useEffect, useMemo, useState } from "react";

import type { PublishedChallengeExerciseOption } from "@/lib/practice/challenges/publishedCatalog";
import { isEligiblePublicChallengeTarget } from "@/lib/practice/challenges/eligibility";

type ShareResponse = {
  ok: true;
  url: string;
  title: string;
  exerciseKey: string;
  exerciseKind: string;
  exercisePurpose: "project";
  expiresAt: string;
  maxAttempts: number | null;
  attemptPolicy: "unlimited";
};


function uniqueBy<T>(items: T[], keyOf: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function targetId(target: PublishedChallengeExerciseOption) {
  return target.id;
}

async function writeClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) throw new Error("Copy was blocked by the browser.");
}

async function readShareResponse(response: Response) {
  const body = (await response.json().catch(() => null)) as
    | (ShareResponse & { error?: string })
    | { error?: string }
    | null;

  if (!response.ok || !body || !("url" in body)) {
    throw new Error(body?.error || "Could not create the challenge link.");
  }

  return body as ShareResponse;
}

function SelectField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-neutral-800">
      <span>{props.label}</span>
      <select
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        disabled={props.disabled}
        className="min-h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-950 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-neutral-100"
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
      <div className="text-base font-semibold text-neutral-900">
        No published challenge exercises found
      </div>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
        This page only shows generated, seeded, active code-input projects that
        can run anonymously through the existing practice-trial runtime. Run Gen
        manifests and seed the published course if an exercise is missing.
      </p>
    </div>
  );
}

export default function PublicChallengePublisher(props: {
  options: PublishedChallengeExerciseOption[];
  initialLocale?: string;
}) {
  const eligibleOptions = useMemo(
    () =>
      props.options.filter(isEligiblePublicChallengeTarget),
    [props.options],
  );
  const first = eligibleOptions[0] ?? null;
  const initialLocale = ["en", "fr", "ht"].includes(props.initialLocale ?? "")
    ? (props.initialLocale as string)
    : "en";
  const [locale, setLocale] = useState(initialLocale);
  const [catalogSlug, setCatalogSlug] = useState(first?.catalogSlug ?? "");
  const [subjectSlug, setSubjectSlug] = useState(first?.subjectSlug ?? "");
  const [moduleSlug, setModuleSlug] = useState(first?.moduleSlug ?? "");
  const [sectionSlug, setSectionSlug] = useState(first?.sectionSlug ?? "");
  const [topicSlug, setTopicSlug] = useState(first?.topicSlug ?? "");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(first?.id ?? "");
  const [creating, setCreating] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [result, setResult] = useState<ShareResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const catalogs = useMemo(
    () => uniqueBy(eligibleOptions, (option) => option.catalogSlug),
    [eligibleOptions],
  );
  const effectiveCatalog = catalogs.some((item) => item.catalogSlug === catalogSlug)
    ? catalogSlug
    : catalogs[0]?.catalogSlug ?? "";

  const subjects = useMemo(
    () =>
      uniqueBy(
        eligibleOptions.filter((option) => option.catalogSlug === effectiveCatalog),
        (option) => option.subjectSlug,
      ),
    [effectiveCatalog, eligibleOptions],
  );
  const effectiveSubject = subjects.some((item) => item.subjectSlug === subjectSlug)
    ? subjectSlug
    : subjects[0]?.subjectSlug ?? "";

  const modules = useMemo(
    () =>
      uniqueBy(
        eligibleOptions.filter(
          (option) =>
            option.catalogSlug === effectiveCatalog &&
            option.subjectSlug === effectiveSubject,
        ),
        (option) => option.moduleSlug,
      ),
    [effectiveCatalog, effectiveSubject, eligibleOptions],
  );
  const effectiveModule = modules.some((item) => item.moduleSlug === moduleSlug)
    ? moduleSlug
    : modules[0]?.moduleSlug ?? "";

  const sections = useMemo(
    () =>
      uniqueBy(
        eligibleOptions.filter(
          (option) =>
            option.catalogSlug === effectiveCatalog &&
            option.subjectSlug === effectiveSubject &&
            option.moduleSlug === effectiveModule,
        ),
        (option) => option.sectionSlug,
      ),
    [effectiveCatalog, effectiveModule, effectiveSubject, eligibleOptions],
  );
  const effectiveSection = sections.some((item) => item.sectionSlug === sectionSlug)
    ? sectionSlug
    : sections[0]?.sectionSlug ?? "";

  const topics = useMemo(
    () =>
      uniqueBy(
        eligibleOptions.filter(
          (option) =>
            option.catalogSlug === effectiveCatalog &&
            option.subjectSlug === effectiveSubject &&
            option.moduleSlug === effectiveModule &&
            option.sectionSlug === effectiveSection,
        ),
        (option) => option.topicSlug,
      ),
    [
      effectiveCatalog,
      effectiveModule,
      effectiveSection,
      effectiveSubject,
      eligibleOptions,
    ],
  );
  const effectiveTopic = topics.some((item) => item.topicSlug === topicSlug)
    ? topicSlug
    : topics[0]?.topicSlug ?? "";

  const filteredExercises = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return eligibleOptions.filter((option) => {
      if (option.catalogSlug !== effectiveCatalog) return false;
      if (option.subjectSlug !== effectiveSubject) return false;
      if (option.moduleSlug !== effectiveModule) return false;
      if (option.sectionSlug !== effectiveSection) return false;
      if (option.topicSlug !== effectiveTopic) return false;
      if (!normalizedQuery) return true;

      return [option.exerciseTitle, option.exerciseKey, option.exerciseKind]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [
    effectiveCatalog,
    effectiveModule,
    effectiveSection,
    effectiveSubject,
    effectiveTopic,
    eligibleOptions,
    query,
  ]);

  const selected =
    filteredExercises.find((option) => targetId(option) === selectedId) ??
    filteredExercises[0] ??
    null;

  useEffect(() => {
    setResult(null);
    setError(null);
    setCopyState("idle");
  }, [locale, selected?.id]);

  function chooseCatalog(value: string) {
    const next = eligibleOptions.find((option) => option.catalogSlug === value);
    setCatalogSlug(value);
    setSubjectSlug(next?.subjectSlug ?? "");
    setModuleSlug(next?.moduleSlug ?? "");
    setSectionSlug(next?.sectionSlug ?? "");
    setTopicSlug(next?.topicSlug ?? "");
    setSelectedId(next?.id ?? "");
  }

  function chooseSubject(value: string) {
    const next = eligibleOptions.find(
      (option) =>
        option.catalogSlug === effectiveCatalog && option.subjectSlug === value,
    );
    setSubjectSlug(value);
    setModuleSlug(next?.moduleSlug ?? "");
    setSectionSlug(next?.sectionSlug ?? "");
    setTopicSlug(next?.topicSlug ?? "");
    setSelectedId(next?.id ?? "");
  }

  function chooseModule(value: string) {
    const next = eligibleOptions.find(
      (option) =>
        option.catalogSlug === effectiveCatalog &&
        option.subjectSlug === effectiveSubject &&
        option.moduleSlug === value,
    );
    setModuleSlug(value);
    setSectionSlug(next?.sectionSlug ?? "");
    setTopicSlug(next?.topicSlug ?? "");
    setSelectedId(next?.id ?? "");
  }

  function chooseSection(value: string) {
    const next = eligibleOptions.find(
      (option) =>
        option.catalogSlug === effectiveCatalog &&
        option.subjectSlug === effectiveSubject &&
        option.moduleSlug === effectiveModule &&
        option.sectionSlug === value,
    );
    setSectionSlug(value);
    setTopicSlug(next?.topicSlug ?? "");
    setSelectedId(next?.id ?? "");
  }

  function chooseTopic(value: string) {
    const next = eligibleOptions.find(
      (option) =>
        option.catalogSlug === effectiveCatalog &&
        option.subjectSlug === effectiveSubject &&
        option.moduleSlug === effectiveModule &&
        option.sectionSlug === effectiveSection &&
        option.topicSlug === value,
    );
    setTopicSlug(value);
    setSelectedId(next?.id ?? "");
  }

  async function createLink() {
    if (!selected) return;

    setCreating(true);
    setError(null);
    setCopyState("idle");

    try {
      const response = await fetch("/api/practice/trial/share", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale,
          subjectSlug: selected.subjectSlug,
          moduleSlug: selected.moduleSlug,
          sectionSlug: selected.sectionSlug,
          topicSlug: selected.topicSlug,
          exerciseKey: selected.exerciseKey,
        }),
      });

      const created = await readShareResponse(response);
      setResult(created);

      try {
        await writeClipboard(created.url);
        setCopyState("copied");
      } catch {
        setCopyState("idle");
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not create the challenge link.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function copyLink() {
    if (!result) return;

    try {
      await writeClipboard(result.url);
      setCopyState("copied");
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not copy the link.");
    }
  }

  async function shareLink() {
    if (!result) return;

    const data = {
      title: result.title || "ZoeSkoul challenge",
      text: `Can you complete this ${result.exercisePurpose} challenge?`,
      url: result.url,
    };

    if (navigator.share) {
      try {
        await navigator.share(data);
        return;
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
      }
    }

    await copyLink();
  }

  if (!eligibleOptions.length) return <EmptyState />;

  return (
    <div className="grid gap-6">
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SelectField
            label="Challenge language"
            value={locale}
            onChange={setLocale}
            options={[
              { value: "en", label: "English" },
              { value: "fr", label: "French" },
              { value: "ht", label: "Haitian Creole" },
            ]}
          />
          <SelectField
            label="Catalog"
            value={effectiveCatalog}
            onChange={chooseCatalog}
            options={catalogs.map((item) => ({
              value: item.catalogSlug,
              label: item.catalogTitle,
            }))}
          />
          <SelectField
            label="Published course"
            value={effectiveSubject}
            onChange={chooseSubject}
            options={subjects.map((item) => ({
              value: item.subjectSlug,
              label: `${item.subjectTitle}${
                item.releaseStatus === "legacy" ? " · legacy" : ""
              }`,
            }))}
          />
          <SelectField
            label="Module"
            value={effectiveModule}
            onChange={chooseModule}
            options={modules.map((item) => ({
              value: item.moduleSlug,
              label: item.moduleTitle,
            }))}
          />
          <SelectField
            label="Section"
            value={effectiveSection}
            onChange={chooseSection}
            options={sections.map((item) => ({
              value: item.sectionSlug,
              label: item.sectionTitle,
            }))}
          />
          <SelectField
            label="Topic"
            value={effectiveTopic}
            onChange={chooseTopic}
            options={topics.map((item) => ({
              value: item.topicSlug,
              label: item.topicTitle,
            }))}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-neutral-950">
                Select the exact published exercise
              </h2>
              <p className="mt-1 text-sm text-neutral-600">
                Only published code-input project exercises are eligible for public
                challenge links.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search exercise ID or title"
                className="min-h-11 w-full rounded-xl border border-neutral-300 px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 sm:w-72"
              />
            </div>
          </div>
        </div>

        <div className="max-h-[440px] overflow-auto">
          {filteredExercises.length ? (
            <div className="divide-y divide-neutral-200">
              {filteredExercises.map((option) => {
                const active = selected?.id === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSelectedId(option.id)}
                    className={`grid w-full gap-2 px-5 py-4 text-left transition md:grid-cols-[minmax(0,1fr)_140px_140px] md:items-center ${
                      active ? "bg-indigo-50" : "hover:bg-neutral-50"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-neutral-950">
                        {option.exerciseTitle}
                      </span>
                      <span className="mt-1 block truncate font-mono text-xs text-neutral-500">
                        {option.exerciseKey}
                      </span>
                    </span>
                    <span className="w-fit rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-700">
                      {option.exerciseKind}
                    </span>
                    <span
                      className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${
                        option.exercisePurpose === "project"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {option.exercisePurpose}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-neutral-600">
              No exercises match this topic and filter.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
              Selected public challenge
            </div>
            <h2 className="mt-1 text-lg font-semibold text-neutral-950">
              {selected?.exerciseTitle ?? "Select an exercise"}
            </h2>
            {selected ? (
              <div className="mt-3 grid gap-1 text-sm text-neutral-700">
                <div>
                  <span className="font-semibold">Purpose:</span>{" "}
                  {selected.exercisePurpose}
                </div>
                <div>
                  <span className="font-semibold">Kind:</span>{" "}
                  {selected.exerciseKind}
                </div>
                <div className="break-all font-mono text-xs text-neutral-600">
                  {selected.subjectSlug} / {selected.moduleSlug} /{" "}
                  {selected.sectionSlug} / {selected.topicSlug} /{" "}
                  {selected.exerciseKey}
                </div>
              </div>
            ) : null}
            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600">
              The guest receives only this exercise and may keep submitting until
              it is solved or revealed. Run, editing, and refresh do not consume
              attempts.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void createLink()}
            disabled={!selected || creating}
            className="min-h-11 shrink-0 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {creating ? "Creating…" : "Create and copy challenge link"}
          </button>
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </p>
        ) : null}

        {result ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <label
              className="block text-sm font-semibold text-emerald-950"
              htmlFor="published-challenge-link"
            >
              Public challenge link
            </label>
            <input
              id="published-challenge-link"
              value={result.url}
              readOnly
              className="mt-2 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 font-mono text-xs text-neutral-900"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void copyLink()}
                className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white"
              >
                {copyState === "copied" ? "Copied" : "Copy link"}
              </button>
              <button
                type="button"
                onClick={() => void shareLink()}
                className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-800"
              >
                Share
              </button>
              <a
                href={result.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-800"
              >
                Open guest preview
              </a>
            </div>
            <p className="mt-3 text-xs text-emerald-800">
              Expires {new Date(result.expiresAt).toLocaleDateString()} ·{" "}
              Unlimited graded attempts
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
