import {
  Check,
  Search,
} from "lucide-react";
import {
  useMemo,
  useState,
} from "react";

import {
  OTHER_TUTORING_SUBJECT_VALUE,
  TUTORING_SUBJECT_GROUPS,
  matchesTutoringSubject,
} from "./tutoringSubjectCatalog";

type Course = {
  slug: string;
  title: string;
};

export default function TutoringSubjectPicker(
  props: {
    courses: Course[];
    value: string;
    customSubject: string;
    onValueChange: (value: string) => void;
    onCustomSubjectChange: (
      value: string,
    ) => void;
  },
) {
  const [query, setQuery] =
    useState("");

  const normalizedQuery =
    query.trim().toLocaleLowerCase();

  const filteredCourses =
    useMemo(
      () =>
        props.courses.filter(
          (course) =>
            !normalizedQuery ||
            `${course.title} ${course.slug}`
              .toLocaleLowerCase()
              .includes(
                normalizedQuery,
              ),
        ),
      [
        normalizedQuery,
        props.courses,
      ],
    );

  const filteredGroups =
    useMemo(
      () =>
        TUTORING_SUBJECT_GROUPS
          .map((group) => ({
            ...group,
            options:
              group.options.filter(
                (subject) =>
                  matchesTutoringSubject(
                    subject,
                    query,
                  ),
              ),
          }))
          .filter(
            (group) =>
              group.options.length > 0,
          ),
      [query],
    );

  const hasResults =
    filteredCourses.length > 0 ||
    filteredGroups.length > 0;

  function subjectButton(
    value: string,
    label: string,
  ) {
    const selected =
      props.value === value;

    return (
      <button
        key={value}
        type="button"
        aria-pressed={selected}
        onClick={() =>
          props.onValueChange(value)
        }
        className={[
          "flex min-h-14 items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition",
          selected
            ? "border-emerald-500 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-500/20 dark:bg-emerald-400/10 dark:text-emerald-100"
            : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.025] dark:hover:bg-white/[0.05]",
        ].join(" ")}
      >
        <span>{label}</span>
        {selected ? (
          <Check
            className="h-4 w-4 shrink-0"
            aria-hidden="true"
          />
        ) : null}
      </button>
    );
  }

  return (
    <>
      <label className="relative mt-5 block">
        <span className="sr-only">
          Search tutoring subjects
        </span>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(event) =>
            setQuery(
              event.currentTarget.value,
            )
          }
          placeholder="Search JavaScript, DSA, Excel, web development…"
          className="ui-input w-full pl-10"
        />
      </label>

      <div className="mt-6 max-h-[48vh] space-y-6 overflow-y-auto pr-1">
        {filteredCourses.length ? (
          <section>
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-neutral-500 dark:text-neutral-400">
              Your ZoeSkoul courses
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {filteredCourses.map(
                (course) =>
                  subjectButton(
                    course.slug,
                    course.title,
                  ),
              )}
            </div>
          </section>
        ) : null}

        {filteredGroups.map(
          (group) => (
            <section key={group.label}>
              <div className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-neutral-500 dark:text-neutral-400">
                {group.label}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.options.map(
                  (subject) =>
                    subjectButton(
                      subject.value,
                      subject.label,
                    ),
                )}
              </div>
            </section>
          ),
        )}

        {hasResults ? null : (
          <div className="rounded-2xl border border-dashed border-neutral-300 px-4 py-5 text-sm text-neutral-600 dark:border-white/15 dark:text-neutral-300">
            No listed subject matches
            your search. Choose Other
            technology topic below and
            describe exactly what you
            need.
          </div>
        )}

        <section>
          <div className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-neutral-500 dark:text-neutral-400">
            Something else
          </div>

          {subjectButton(
            OTHER_TUTORING_SUBJECT_VALUE,
            "Other technology topic",
          )}

          {props.value ===
          OTHER_TUTORING_SUBJECT_VALUE ? (
            <label className="mt-3 block">
              <span className="mb-1.5 block text-sm font-semibold">
                Technology or subject
              </span>
              <input
                autoFocus
                type="text"
                value={
                  props.customSubject
                }
                maxLength={160}
                onChange={(event) =>
                  props.onCustomSubjectChange(
                    event.currentTarget
                      .value,
                  )
                }
                placeholder="Example: Salesforce, AutoCAD, Fujitsu NetCOBOL…"
                className="ui-input w-full"
              />
              <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
                Enter any technology,
                software, certification,
                assignment, or technical
                topic.
              </span>
            </label>
          ) : null}
        </section>
      </div>
    </>
  );
}
