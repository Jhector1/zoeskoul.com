"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  BookOpen,
  Boxes,
  ChevronLeft,
  ChevronRight,
  FolderTree,
  GraduationCap,
  LockKeyhole,
  Play,
} from "lucide-react";

import NavButton from "@/components/ui/NavButton";
import SubscriberPracticeRail from "@/components/practice/SubscriberPracticeRail";
import { useTaggedT } from "@/i18n/tagged";
import { resolvePracticeDisplayTitle } from "@/lib/practice/displayTitle";
import { cn } from "@/lib/cn";
import {
  DEFAULT_STANDARD_PRACTICE_TARGET_COUNT,
  resolveAvailablePracticeTargetCount,
} from "@/lib/practice/experience/availableTargetCount";
import type {
  PracticeChooserCatalog,
  PracticeChooserMode,
  PracticeChooserSelection,
  SubscriberPracticeSessionSummary,
} from "@/lib/practice/experience/practiceChooserTypes";
import {
  findActiveSubscriberPracticeSession,
} from "@/lib/practice/experience/subscriberPracticeSessionSummary";

type WizardStep = "catalog" | "course" | "module" | "section" | "topic";

const STEPS: WizardStep[] = [
  "catalog",
  "course",
  "module",
  "section",
  "topic",
];

function countForMode(
  mode: PracticeChooserMode,
  item: { exerciseCount: number; dailyExerciseCount: number },
) {
  return mode === "subscriber" ? item.exerciseCount : item.dailyExerciseCount;
}

function initialStepIndex(
  catalogs: PracticeChooserCatalog[],
  selection: PracticeChooserSelection,
) {
  const catalog = catalogs.find((item) => item.slug === selection.catalogSlug);
  if (!catalog) return 0;

  const course = catalog.courses.find(
    (item) => item.slug === selection.subjectSlug,
  );
  if (!course) return 1;

  const module = course.modules.find(
    (item) => item.slug === selection.moduleSlug,
  );
  if (!module) return 2;

  const section = module.sections.find(
    (item) => item.slug === selection.sectionSlug,
  );
  if (!section) return 2;

  const topic = section.topics.find(
    (item) => item.slug === selection.topicSlug,
  );
  return topic ? 4 : 3;
}

function ChoiceCard(props: {
  title: string;
  meta: string;
  description?: string | null;
  selected?: boolean;
  disabled?: boolean;
  locked?: boolean;
  onSelect?: () => void;
  billingHref?: string | null;
  unlockLabel: string;
  lockedLabel: string;
  openingLabel: string;
  statusLabel?: string | null;
}) {
  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200",
        props.selected
          ? "border-[rgb(var(--ui-info)/0.44)] bg-[rgb(var(--ui-info)/0.10)] shadow-[0_12px_28px_rgb(var(--ui-info)/0.10)]"
          : "border-[rgb(var(--ui-border)/0.78)] bg-[rgb(var(--ui-surface)/0.92)] shadow-sm",
        !props.disabled && !props.locked &&
          "hover:-translate-y-0.5 hover:border-[rgb(var(--ui-info)/0.36)] hover:shadow-md",
        props.disabled && "opacity-55",
      )}
    >
      <button
        type="button"
        disabled={props.disabled || props.locked}
        onClick={props.onSelect}
        className="absolute inset-0 z-0 disabled:cursor-not-allowed"
        aria-label={props.title}
      />

      <div className="relative z-10 pointer-events-none">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold leading-5 text-[rgb(var(--ui-text)/0.98)] sm:text-base">
              {props.title}
            </h3>
            <p className="mt-1 text-xs font-medium text-[rgb(var(--ui-text-muted)/0.82)]">
              {props.meta}
            </p>
          </div>

          {props.locked ? (
            <span className="ui-pill-warn shrink-0 gap-1">
              <LockKeyhole className="size-3" />
              {props.lockedLabel}
            </span>
          ) : props.statusLabel ? (
            <span className="shrink-0 rounded-full border border-[rgb(var(--ui-info)/0.24)] bg-[rgb(var(--ui-info)/0.10)] px-2 py-1 text-[10px] font-semibold text-[rgb(var(--ui-info))]">
              {props.statusLabel}
            </span>
          ) : (
            <ChevronRight className="mt-0.5 size-4 shrink-0 text-[rgb(var(--ui-text-muted)/0.62)] transition-transform group-hover:translate-x-0.5" />
          )}
        </div>

        {props.description ? (
          <p className="mt-3 line-clamp-3 text-sm leading-6 text-[rgb(var(--ui-text-muted)/0.88)]">
            {props.description}
          </p>
        ) : null}
      </div>

      {props.locked && props.billingHref ? (
        <div className="relative z-20 mt-4">
          <NavButton
            href={props.billingHref}
            className="ui-btn-premium min-h-9 w-full"
            loadingText={props.openingLabel}
          >
            <span className="inline-flex items-center gap-2">
              <LockKeyhole className="size-3.5" />
              {props.unlockLabel}
            </span>
          </NavButton>
        </div>
      ) : null}
    </article>
  );
}

export default function PracticePathWizard(props: {
  catalogs: PracticeChooserCatalog[];
  mode: PracticeChooserMode;
  targetCount: number;
  initialSelection: PracticeChooserSelection;
  busy: boolean;
  error: string | null;
  activeSessions: SubscriberPracticeSessionSummary[];
  onStart: (
    selection: PracticeChooserSelection,
    targetCount: number,
  ) => void | Promise<void>;
  onResume: (
    session: SubscriberPracticeSessionSummary,
  ) => void | Promise<void>;
  buildStartHref?: (
    selection: PracticeChooserSelection,
    targetCount: number,
  ) => string;
}) {
  const t = useTranslations("Practice.dailyStart");
  const { resolve } = useTaggedT();
  const resolveTitle = useCallback(
    (item: { title: string; titleKey: string | null } | null | undefined) =>
      item
        ? resolvePracticeDisplayTitle({
            title: item.title,
            titleKey: item.titleKey,
            resolve,
          })
        : "",
    [resolve],
  );
  const [selection, setSelection] = useState<PracticeChooserSelection>(
    props.initialSelection,
  );
  const initialIndex = initialStepIndex(
    props.catalogs,
    props.initialSelection,
  );
  const [stepIndex, setStepIndex] = useState(initialIndex);
  const [furthestStepIndex, setFurthestStepIndex] = useState(initialIndex);
  const [direction, setDirection] = useState<"forward" | "backward">(
    "forward",
  );

  const step = STEPS[stepIndex];
  const catalog = useMemo(
    () =>
      props.catalogs.find((item) => item.slug === selection.catalogSlug) ?? null,
    [props.catalogs, selection.catalogSlug],
  );
  const course = useMemo(
    () =>
      catalog?.courses.find((item) => item.slug === selection.subjectSlug) ??
      null,
    [catalog, selection.subjectSlug],
  );
  const module = useMemo(
    () =>
      course?.modules.find((item) => item.slug === selection.moduleSlug) ?? null,
    [course, selection.moduleSlug],
  );
  const section = useMemo(
    () =>
      module?.sections.find((item) => item.slug === selection.sectionSlug) ??
      null,
    [module, selection.sectionSlug],
  );
  const topic = useMemo(
    () =>
      section?.topics.find((item) => item.slug === selection.topicSlug) ?? null,
    [section, selection.topicSlug],
  );

  const moveTo = (nextIndex: number, nextDirection: "forward" | "backward") => {
    const boundedIndex = Math.max(0, Math.min(STEPS.length - 1, nextIndex));
    setDirection(nextDirection);
    setStepIndex(boundedIndex);
    if (nextDirection === "forward") {
      setFurthestStepIndex((current) => Math.max(current, boundedIndex));
    }
  };

  const replacePathAndAdvance = (
    nextSelection: PracticeChooserSelection,
    nextIndex: number,
  ) => {
    setSelection(nextSelection);
    setFurthestStepIndex(nextIndex);
    setDirection("forward");
    setStepIndex(nextIndex);
  };

  const chooseCatalog = (slug: string) => {
    if (slug === selection.catalogSlug) {
      moveTo(1, "forward");
      return;
    }

    replacePathAndAdvance(
      {
        catalogSlug: slug,
        subjectSlug: "",
        moduleSlug: "",
        sectionSlug: "",
        topicSlug: "",
      },
      1,
    );
  };

  const chooseCourse = (slug: string) => {
    if (slug === selection.subjectSlug) {
      moveTo(2, "forward");
      return;
    }

    replacePathAndAdvance(
      {
        ...selection,
        subjectSlug: slug,
        moduleSlug: "",
        sectionSlug: "",
        topicSlug: "",
      },
      2,
    );
  };

  const chooseModule = (slug: string) => {
    if (slug === selection.moduleSlug) {
      moveTo(3, "forward");
      return;
    }

    replacePathAndAdvance(
      {
        ...selection,
        moduleSlug: slug,
        sectionSlug: "",
        topicSlug: "",
      },
      3,
    );
  };

  const chooseSection = (slug: string) => {
    if (slug === selection.sectionSlug) {
      moveTo(4, "forward");
      return;
    }

    replacePathAndAdvance(
      {
        ...selection,
        sectionSlug: slug,
        topicSlug: "",
      },
      4,
    );
  };

  const choices = (() => {
    if (step === "catalog") return props.catalogs;
    if (step === "course") return catalog?.courses ?? [];
    if (step === "module") return course?.modules ?? [];
    if (step === "section") return module?.sections ?? [];
    return section?.topics ?? [];
  })();

  const titles: Record<WizardStep, string> = {
    catalog: t("chooseCatalog"),
    course: t("chooseCourse"),
    module: t("chooseModule"),
    section: t("chooseSection"),
    topic: t("chooseTopic"),
  };

  const descriptions: Record<WizardStep, string> = {
    catalog: t("catalogHelp"),
    course: t("courseHelp"),
    module: t("moduleHelp"),
    section: t("sectionHelp"),
    topic: t("topicHelp"),
  };

  const icons: Record<WizardStep, typeof Boxes> = {
    catalog: Boxes,
    course: GraduationCap,
    module: FolderTree,
    section: BookOpen,
    topic: Play,
  };
  const StepIcon = icons[step];

  const availableExerciseCount = topic ? countForMode(props.mode, topic) : 0;
  const requestedTargetCount =
    props.mode === "subscriber"
      ? DEFAULT_STANDARD_PRACTICE_TARGET_COUNT
      : props.targetCount;
  const effectiveTargetCount = resolveAvailablePracticeTargetCount({
    requested: requestedTargetCount,
    available: availableExerciseCount,
    fallback: requestedTargetCount,
  });
  const canStart = Boolean(
    catalog &&
      course &&
      module?.availability === "available" &&
      section &&
      topic &&
      effectiveTargetCount > 0,
  );
  const canMoveForward = Boolean(
    (step === "catalog" && catalog) ||
      (step === "course" && course) ||
      (step === "module" && module?.availability === "available") ||
      (step === "section" && section),
  );

  const breadcrumb = [catalog, course, module, section]
    .map(resolveTitle)
    .filter(Boolean)
    .join(" · ");
  const activeTopicSession = findActiveSubscriberPracticeSession(
    props.activeSessions,
    selection,
  );
  const startHref = canStart && !activeTopicSession
    ? props.buildStartHref?.(selection, effectiveTargetCount)
    : undefined;

  return (
    <main className="min-h-dvh bg-[rgb(var(--ui-bg))] px-4 py-6 text-[rgb(var(--ui-text))] sm:px-6 lg:py-10">
      <div
        className={cn(
          "mx-auto grid max-w-7xl gap-4",
          props.mode === "subscriber" && props.activeSessions.length
            ? "lg:grid-cols-[260px_minmax(0,1fr)]"
            : "max-w-6xl",
        )}
      >
        {props.mode === "subscriber" ? (
          <SubscriberPracticeRail
            sessions={props.activeSessions}
            busy={props.busy}
            onResume={props.onResume}
          />
        ) : null}

        <section className="ui-page-surface min-w-0 overflow-hidden">
          <header className="border-b border-[rgb(var(--ui-border)/0.76)] bg-[rgb(var(--ui-surface-2)/0.60)] px-5 py-5 sm:px-7 sm:py-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="ui-kicker">
                  {props.mode === "subscriber"
                    ? t("subscriberKicker")
                    : t("freeKicker")}
                </div>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                  {props.mode === "subscriber"
                    ? t("subscriberTitle")
                    : t("freeTitle")}
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[rgb(var(--ui-text-muted)/0.88)] sm:text-base">
                  {props.mode === "subscriber"
                    ? t("subscriberSubtitle")
                    : t("freeSubtitle", { count: props.targetCount })}
                </p>
              </div>

              <span
                className={cn(
                  "inline-flex min-h-8 shrink-0 items-center rounded-full border px-3 text-xs font-semibold",
                  props.mode === "subscriber"
                    ? "border-[rgb(var(--ui-info)/0.24)] bg-[rgb(var(--ui-info)/0.10)] text-[rgb(var(--ui-info))]"
                    : "border-[rgb(var(--ui-accent)/0.22)] bg-[rgb(var(--ui-accent)/0.10)] text-[rgb(var(--ui-accent))]",
                )}
              >
                {props.mode === "subscriber"
                  ? t("unlimitedBadge")
                  : t("dailyBadge", { count: props.targetCount })}
              </span>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {STEPS.map((item, index) => {
                const completed = index < stepIndex;
                const active = index === stepIndex;
                return (
                  <button
                    key={item}
                    type="button"
                    disabled={index > furthestStepIndex}
                    onClick={() =>
                      moveTo(index, index < stepIndex ? "backward" : "forward")
                    }
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                      active
                        ? "border-[rgb(var(--ui-info)/0.34)] bg-[rgb(var(--ui-info)/0.12)] text-[rgb(var(--ui-text)/0.98)]"
                        : completed
                          ? "border-[rgb(var(--ui-border)/0.74)] bg-[rgb(var(--ui-surface)/0.82)] text-[rgb(var(--ui-text-muted)/0.92)] hover:border-[rgb(var(--ui-info)/0.28)]"
                          : "border-[rgb(var(--ui-border)/0.52)] text-[rgb(var(--ui-text-muted)/0.58)]",
                    )}
                  >
                    <span className="tabular-nums">{index + 1}</span>
                    {t(`steps.${item}`)}
                  </button>
                );
              })}
            </div>
          </header>

          <div className="p-4 sm:p-6 lg:p-7">
            <div
              key={`${step}-${selection.catalogSlug}-${selection.subjectSlug}-${selection.moduleSlug}-${selection.sectionSlug}`}
              className={cn(
                direction === "forward"
                  ? "ui-practice-wizard-enter-forward"
                  : "ui-practice-wizard-enter-backward",
              )}
            >
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-[rgb(var(--ui-info)/0.22)] bg-[rgb(var(--ui-info)/0.10)] text-[rgb(var(--ui-info))]">
                  <StepIcon className="size-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold tracking-tight sm:text-xl">
                    {titles[step]}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-[rgb(var(--ui-text-muted)/0.86)]">
                    {descriptions[step]}
                  </p>
                  {breadcrumb && step !== "catalog" ? (
                    <p className="mt-1 truncate text-xs font-medium text-[rgb(var(--ui-text-muted)/0.66)]">
                      {breadcrumb}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {choices.map((item) => {
                  const count = countForMode(props.mode, item);
                  const isModule = step === "module";
                  const moduleItem = isModule
                    ? (item as NonNullable<typeof module>)
                    : null;
                  const locked = moduleItem?.availability === "locked";
                  const countRequired = step === "section" || step === "topic";
                  const unavailable =
                    moduleItem?.availability === "unavailable" ||
                    (countRequired && count <= 0);
                  const selected =
                    (step === "catalog" && item.slug === selection.catalogSlug) ||
                    (step === "course" && item.slug === selection.subjectSlug) ||
                    (step === "module" && item.slug === selection.moduleSlug) ||
                    (step === "section" && item.slug === selection.sectionSlug) ||
                    (step === "topic" && item.slug === selection.topicSlug);

                  const topicSession =
                    step === "topic"
                      ? findActiveSubscriberPracticeSession(props.activeSessions, {
                          ...selection,
                          topicSlug: item.slug,
                        })
                      : null;

                  const select = () => {
                    if (step === "catalog") chooseCatalog(item.slug);
                    else if (step === "course") chooseCourse(item.slug);
                    else if (step === "module") chooseModule(item.slug);
                    else if (step === "section") chooseSection(item.slug);
                    else {
                      setSelection((current) => ({
                        ...current,
                        topicSlug: item.slug,
                      }));
                    }
                  };

                  return (
                    <ChoiceCard
                      key={item.slug}
                      title={resolveTitle(item)}
                      description={
                        "description" in item &&
                        typeof item.description === "string"
                          ? item.description
                          : null
                      }
                      meta={
                        locked
                          ? t("paidModule")
                          : unavailable
                            ? t("notAvailable")
                            : topicSession
                              ? t("practiceProgress", {
                                  completed: topicSession.completedCount,
                                  total: topicSession.totalCount,
                                })
                              : t("exerciseCount", { count })
                      }
                      selected={selected}
                      disabled={Boolean(unavailable && !locked)}
                      locked={locked}
                      onSelect={select}
                      billingHref={moduleItem?.billingHref ?? null}
                      unlockLabel={t("unlock")}
                      lockedLabel={t("locked")}
                      openingLabel={t("openingBilling")}
                      statusLabel={topicSession ? t("inProgress") : null}
                    />
                  );
                })}
              </div>

              {!choices.length ? (
                <div className="ui-surface-muted mt-5 p-4 text-sm text-[rgb(var(--ui-text-muted)/0.88)]">
                  {t("empty")}
                </div>
              ) : null}
            </div>

            {props.error ? (
              <div className="ui-surface-danger mt-5 p-4 text-sm font-medium">
                {props.error}
              </div>
            ) : null}

            <footer className="mt-6 flex flex-col-reverse gap-3 border-t border-[rgb(var(--ui-border)/0.66)] pt-5 sm:flex-row sm:items-center sm:justify-between">
              <NavButton
                onClick={() => moveTo(stepIndex - 1, "backward")}
                disabled={stepIndex === 0 || props.busy}
                className="ui-btn-secondary min-h-10 px-4"
                showSpinner={false}
              >
                <span className="inline-flex items-center gap-2">
                  <ChevronLeft className="size-4" />
                  {t("back")}
                </span>
              </NavButton>

              {step === "topic" ? (
                <NavButton
                  href={startHref}
                  onClick={
                    startHref
                      ? undefined
                      : activeTopicSession
                        ? () => props.onResume(activeTopicSession)
                        : () => props.onStart(selection, effectiveTargetCount)
                  }
                  disabled={!canStart || props.busy}
                  className="ui-btn-info min-h-10 px-5"
                  loadingText={
                    activeTopicSession ? t("continuing") : t("starting")
                  }
                >
                  <span className="inline-flex items-center gap-2">
                    <Play className="size-4" />
                    {activeTopicSession
                      ? t("continuePractice")
                      : props.mode === "subscriber"
                        ? t("startUnlimited")
                        : t("startDaily")}
                  </span>
                </NavButton>
              ) : canMoveForward ? (
                <NavButton
                  onClick={() => moveTo(stepIndex + 1, "forward")}
                  disabled={props.busy}
                  className="ui-btn-info min-h-10 px-5"
                  showSpinner={false}
                >
                  <span className="inline-flex items-center gap-2">
                    {t("next")}
                    <ChevronRight className="size-4" />
                  </span>
                </NavButton>
              ) : (
                <div className="text-xs font-medium text-[rgb(var(--ui-text-muted)/0.68)]">
                  {t("selectToContinue")}
                </div>
              )}
            </footer>
          </div>
        </section>
      </div>
    </main>
  );
}
