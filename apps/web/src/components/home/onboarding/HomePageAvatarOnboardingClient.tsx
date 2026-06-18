"use client";

import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTheme } from "next-themes";
import {
    ArrowRight,
    Check,
    ChevronRight,
    Globe,
    GraduationCap,
    MessageCircleMore,
    Moon,
    Sparkles,
    Sun,
    TimerReset,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import NavButton from "@/components/ui/NavButton";
import { useRouter, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import {
    buildTrialHref,
    saveOnboarding,
    sleep,
    startTrialSession,
} from "@/lib/onboarding/client";
import { persistLocale } from "@/lib/locale/persistLocale";
import HeaderSlick from "@/components/HeaderSlick";
import FooterSlick from "@/components/layout/FooterSlick";
import { resolveDeepTagged } from "@/i18n/resolveDeepTagged";
import { useTaggedT } from "@/i18n/tagged";
import RedirectOverlay from "@/components/shared/RedirectOverlay";
import {useAuthHref} from "@/hooks/useAuthHref";

type Choice = {
    label: string;
    value: string;
    hint?: string;
    icon?: LucideIcon;
};

type PreferredLanguage = "english" | "french" | "haitian-creole" | "";
type ThemePreference = "light" | "dark" | "";
type TrialIntent = "now" | "later" | "";
type Level = "beginner" | "intermediate" | "advanced" | "";
type StudyTime = "1-2-hours" | "3-5-hours" | "6-plus-hours" | "";
type DiscoverySource =
    | "other"
    | "search"
    | "friend"
    | "social"
    | "school-work"
    | "";

type OnboardingData = {
    preferredLanguage: PreferredLanguage;
    learningInterests: string[];
    level: Level;
    studyTime: StudyTime;
    discoverySource: DiscoverySource;
    themePreference: ThemePreference;
    trialIntent: TrialIntent;
};

type StepId =
    | "preferredLanguage"
    | "learningInterests"
    | "level"
    | "studyTime"
    | "discoverySource"
    | "themePreference"
    | "trialIntent";

type StepConfig = {
    id: StepId;
    title: string;
    description: string;
    mode: "single" | "multi";
    choices: Choice[];
};

type SubjectCard = {
    id?: string;
    slug: string;
    title: string;
    description: string;
    badge: string | null;
    imageUrl?: string | null;
    imageAlt?: string | null;
};

type SafeT = ReturnType<typeof useTaggedT>["t"];
type ResolveText = ReturnType<typeof useTaggedT>["resolve"];

type StoredOnboardingSnapshot = {
    completed: boolean;
    open: boolean;
    stepIndex: number;
    data: OnboardingData;
};

type HighlightCard = {
    key: string;
    icon: LucideIcon;
    title: string;
    text: string;
    color:string;
};

const STORAGE_KEY = "zoeskoul.home.onboarding.v2";
const DISMISSED_KEY = "zoeskoul.home.avatar.dismissed.v1";
const TRIAL_LAST_SESSION_KEY = "zoeskoul.trial.lastSessionId";
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "ZoeSkoul";

const DEFAULT_DATA: OnboardingData = {
    preferredLanguage: "",
    learningInterests: [],
    level: "",
    studyTime: "",
    discoverySource: "",
    themePreference: "",
    trialIntent: "",
};
// add this helper near DEFAULT_DATA

function emptyValueForStep(stepId: StepId): OnboardingData[StepId] {
    if (stepId === "learningInterests") {
        return [] as OnboardingData[StepId];
    }
    return "" as OnboardingData[StepId];
}
function normalizeOnboardingDataForSubjects(
    data: OnboardingData,
    subjects: SubjectCard[],
): OnboardingData {
    const allowedSubjectSlugs = new Set(subjects.map((subject) => subject.slug));

    return {
        ...data,
        learningInterests: data.learningInterests.filter((slug) =>
            allowedSubjectSlugs.has(slug),
        ),
    };
}
const TAGGED_STEP_META: Omit<StepConfig, "choices">[] = [
    {
        id: "preferredLanguage",
        title: "@:steps.preferredLanguage.title",
        description: "@:steps.preferredLanguage.description",
        mode: "single",
    },
    {
        id: "learningInterests",
        title: "@:steps.learningInterests.title",
        description: "@:steps.learningInterests.description",
        mode: "multi",
    },
    {
        id: "level",
        title: "@:steps.level.title",
        description: "@:steps.level.description",
        mode: "single",
    },
    {
        id: "studyTime",
        title: "@:steps.studyTime.title",
        description: "@:steps.studyTime.description",
        mode: "single",
    },
    {
        id: "discoverySource",
        title: "@:steps.discoverySource.title",
        description: "@:steps.discoverySource.description",
        mode: "single",
    },
    {
        id: "themePreference",
        title: "@:steps.themePreference.title",
        description: "@:steps.themePreference.description",
        mode: "single",
    },
    {
        id: "trialIntent",
        title: "@:steps.trialIntent.title",
        description: "@:steps.trialIntent.description",
        mode: "single",
    },
];

const TAGGED_DISCOVERY_CHOICES: Choice[] = [
    { label: "@:steps.choices.search", value: "search" },
    { label: "@:steps.choices.friend", value: "friend" },
    { label: "@:steps.choices.social", value: "social" },
    { label: "@:steps.choices.school-work", value: "school-work" },
    { label: "@:steps.choices.other", value: "other" },
];

const TAGGED_THEME_CHOICES: Choice[] = [
    {
        label: "@:labels.theme.light",
        value: "light",
        hint: "@:steps.choices.themeLightHint",
        icon: Sun,
    },
    {
        label: "@:labels.theme.dark",
        value: "dark",
        hint: "@:steps.choices.themeDarkHint",
        icon: Moon,
    },
];

const TAGGED_TRIAL_CHOICES: Choice[] = [
    {
        label: "@:steps.choices.trialNowLabel",
        value: "now",
        hint: "@:steps.choices.trialNowHint",
        icon: ArrowRight,
    },
    {
        label: "@:steps.choices.trialLaterLabel",
        value: "later",
        hint: "@:steps.choices.trialLaterHint",
    },
];

const TAGGED_HIGHLIGHT_CARDS = [
    {
        key: "language",
        icon: Globe,
        title: "@:highlights.cards.language.title",
        text: "@:highlights.cards.language.text",
        color: " text-[rgb(var(--ui-info)))]"
    },
    {
        key: "level",
        icon: GraduationCap,
        title: "@:highlights.cards.level.title",
        text: "@:highlights.cards.level.text",
        color: " text-[rgb(var(--ui-accent)))]"
    },
    {
        key: "pace",
        icon: TimerReset,
        title: "@:highlights.cards.pace.title",
        text: "@:highlights.cards.pace.text",
        color: " text-[rgb(var(--ui-warn)))]"
    },
] as const satisfies readonly HighlightCard[];

/* -------------------- small view primitives -------------------- */

function PageShell({ children }: { children: React.ReactNode }) {
    return (
        <main
            className="relative min-h-screen overflow-hidden pb-24 sm:pb-28"
            style={{
                backgroundColor: "rgb(var(--ui-bg) / 1)",
                color: "rgb(var(--ui-text) / 1)",
            }}
        >
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.025] dark:opacity-[0.04]"
                style={{
                    backgroundImage:
                        "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.8) 1px, transparent 0)",
                    backgroundSize: "18px 18px",
                }}
            />
            <div
                aria-hidden
                className="pointer-events-none absolute -top-16 left-[-8%] h-56 w-56 rounded-full bg-emerald-400/10 blur-3xl dark:bg-emerald-300/8"
            />
            <div
                aria-hidden
                className="pointer-events-none absolute right-[-8%] top-8 h-64 w-64 rounded-full bg-sky-400/10 blur-3xl dark:bg-sky-300/8"
            />
            <div className="relative">{children}</div>
        </main>
    );
}

function PageContainer({ children }: { children: React.ReactNode }) {
    return <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">{children}</div>;
}

function Surface({
                     children,
                     className,
                 }: {
    children: React.ReactNode;
    className?: string;
}) {
    return <div className={cn("ui-page-surface", className)}>{children}</div>;
}

function SoftPanel({
                       children,
                       className,
                   }: {
    children: React.ReactNode;
    className?: string;
}) {
    return <div className={cn("ui-surface-soft", className)}>{children}</div>;
}

function SectionKicker({ children }: { children: React.ReactNode }) {
    return <div className="ui-kicker">{children}</div>;
}

function SectionTitle({
                          children,
                          className,
                      }: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <h2
            className={cn(
                "mt-2 text-2xl font-semibold tracking-tight sm:text-3xl",
                className,
            )}
            style={{ color: "rgb(var(--ui-text) / 0.96)" }}
        >
            {children}
        </h2>
    );
}

function SectionLead({ children }: { children: React.ReactNode }) {
    return <p className="mt-3 text-sm leading-6 text-[rgb(var(--ui-text-muted)/0.88)] sm:text-[15px] sm:leading-7">{children}</p>;
}

function ProgressBar({ value }: { value: number }) {
    const safe = Math.max(0, Math.min(100, value));
    return (
        <div className="ui-progress-track">
            <div className="ui-progress-fill" style={{ width: `${safe}%` }} />
        </div>
    );
}

function buttonClass(variant: "primary" | "secondary" | "ghost" = "secondary") {
    if (variant === "primary") return "ui-btn-primary";
    if (variant === "secondary") return "ui-btn-secondary";
    return "ui-btn-secondary bg-transparent shadow-none";
}

function SparkDot({ className }: { className?: string }) {
    return (
        <motion.div
            className={cn(
                "absolute size-1 rounded-full bg-emerald-400/35 dark:bg-emerald-300/20",
                className,
            )}
            animate={{ y: [0, -5, 0], opacity: [0.35, 1, 0.35] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        />
    );
}

/* -------------------- storage / formatting -------------------- */

function readStoredOnboarding(): StoredOnboardingSnapshot {
    if (typeof window === "undefined") {
        return { completed: false, open: false, stepIndex: 0, data: DEFAULT_DATA };
    }

    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return { completed: false, open: false, stepIndex: 0, data: DEFAULT_DATA };
        }

        const parsed = JSON.parse(raw) as {
            completed?: boolean;
            open?: boolean;
            stepIndex?: number;
            data?: Partial<OnboardingData>;
        };

        return {
            completed: Boolean(parsed?.completed),
            open: Boolean(parsed?.open),
            stepIndex:
                typeof parsed?.stepIndex === "number" && parsed.stepIndex >= 0
                    ? parsed.stepIndex
                    : 0,
            data: {
                ...DEFAULT_DATA,
                ...(parsed?.data ?? {}),
                learningInterests: Array.isArray(parsed?.data?.learningInterests)
                    ? parsed.data.learningInterests
                    : [],
            },
        };
    } catch {
        return { completed: false, open: false, stepIndex: 0, data: DEFAULT_DATA };
    }
}

function saveStoredOnboarding(
    completed: boolean,
    data: OnboardingData,
    stepIndex = 0,
    open = false,
) {
    if (typeof window === "undefined") return;

    window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ completed, open, stepIndex, data }),
    );
}

function useTypewriter(text: string, speed = 18, shouldAnimate = true) {
    const [displayed, setDisplayed] = useState(shouldAnimate ? "" : text);

    useEffect(() => {
        if (!shouldAnimate) {
            setDisplayed(text);
            return;
        }

        setDisplayed("");
        let i = 0;

        const timer = window.setInterval(() => {
            i += 1;
            setDisplayed(text.slice(0, i));
            if (i >= text.length) window.clearInterval(timer);
        }, speed);

        return () => window.clearInterval(timer);
    }, [text, speed, shouldAnimate]);

    return displayed;
}

function formatList(locale: string, items: string[]) {
    if (!items.length) return "";
    try {
        return new Intl.ListFormat(locale, {
            style: "long",
            type: "conjunction",
        }).format(items);
    } catch {
        return items.join(", ");
    }
}

function mapLanguageLabel(value: string, t: SafeT) {
    if (!value) return t("common.notSet");
    return t(`labels.language.${value}` as any, undefined, value);
}

function mapNextLocale(value: string, fallbackLocale: string) {
    const map: Record<string, string> = {
        english: "en",
        french: "fr",
        "haitian-creole": "ht",
    };
    return map[value] ?? fallbackLocale;
}

function mapLevelLabel(value: string, t: SafeT) {
    if (!value) return t("common.notSet");
    return t(`labels.level.${value}` as any, undefined, value);
}

function mapTimeLabel(value: string, t: SafeT) {
    if (!value) return t("common.notSet");
    return t(`labels.studyTime.${value}` as any, undefined, value);
}

function mapThemeLabel(value: string, t: SafeT) {
    if (!value) return t("common.notSet");
    return t(`labels.theme.${value}` as any, undefined, value);
}

function titleFromSlug(
    slug: string,
    subjects: SubjectCard[],
    resolveText: ResolveText,
) {
    const subject = subjects.find((s) => s.slug === slug);
    if (!subject) return slug;
    return resolveText(subject.title, { appName: APP_NAME }, slug);
}

function getRecommendedSubjects(data: OnboardingData, subjects: SubjectCard[]) {
    if (!data.learningInterests.length) return subjects.slice(0, 4);

    const selected = new Set(data.learningInterests);
    const prioritized = subjects.filter((subject) => selected.has(subject.slug));
    const fallback = subjects.filter((subject) => !selected.has(subject.slug));

    return [...prioritized, ...fallback].slice(0, 4);
}

function buildWelcomeMessage(
    data: OnboardingData,
    returning: boolean,
    subjects: SubjectCard[],
    t: SafeT,
    resolveText: ResolveText,
    locale: string,
) {
    const interestText = data.learningInterests.length
        ? formatList(
            locale,
            data.learningInterests
                .map((slug) => titleFromSlug(slug, subjects, resolveText))
                .slice(0, 2),
        )
        : t("welcome.fallbackGoals");

    if (returning) {
        return t("welcome.returning", {
            appName: APP_NAME,
            interestText,
            level: mapLevelLabel(data.level, t).toLowerCase(),
            studyTime: mapTimeLabel(data.studyTime, t).toLowerCase(),
            theme: mapThemeLabel(data.themePreference, t).toLowerCase(),
        });
    }

    return t("welcome.new", {
        appName: APP_NAME,
        interestText,
        language: mapLanguageLabel(data.preferredLanguage, t),
    });
}

/* -------------------- avatar / speech -------------------- */

function GuideAvatar({ speaking }: { speaking: boolean }) {
    const reduceMotion = useReducedMotion();
    const { t } = useTaggedT("homeOnboarding");

    return (
        <div className="relative flex h-[78px] w-[78px] items-center justify-center sm:h-[86px] sm:w-[86px]">
            <motion.div
                className="absolute inset-2 rounded-full bg-emerald-300/15 blur-xl dark:bg-emerald-300/8"
                animate={
                    reduceMotion
                        ? undefined
                        : { scale: [1, 1.05, 1], opacity: [0.35, 0.6, 0.35] }
                }
                transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
            />

            <SparkDot className="left-2 top-3" />
            <SparkDot className="right-3 top-2" />
            <SparkDot className="bottom-3 right-2" />

            <motion.div
                className={cn(
                    "relative flex h-[64px] w-[64px] items-center justify-center sm:h-[70px] sm:w-[70px]",
                    "ui-page-surface rounded-2xl p-1.5",
                )}
                animate={
                    reduceMotion ? undefined : { y: [0, -2, 0], rotate: [0, -1, 1, 0] }
                }
                transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
            >
                <div className="ui-surface-muted flex h-full w-full flex-col items-center justify-center rounded-[14px] border p-2">
                    <div className="flex items-center gap-2.5">
                        <motion.div
                            className="h-3.5 w-3.5 rounded-full bg-[rgb(var(--ui-text)/0.92)] sm:h-4 sm:w-4"
                            animate={reduceMotion ? undefined : { scaleY: [1, 1, 0.12, 1, 1] }}
                            transition={{
                                duration: 5,
                                repeat: Infinity,
                                times: [0, 0.42, 0.46, 0.5, 1],
                            }}
                            style={{ transformOrigin: "center center" }}
                        />
                        <motion.div
                            className="h-3.5 w-3.5 rounded-full bg-[rgb(var(--ui-text)/0.92)] sm:h-4 sm:w-4"
                            animate={reduceMotion ? undefined : { scaleY: [1, 1, 0.12, 1, 1] }}
                            transition={{
                                duration: 5,
                                repeat: Infinity,
                                times: [0, 0.42, 0.46, 0.5, 1],
                            }}
                            style={{ transformOrigin: "center center" }}
                        />
                    </div>

                    <motion.div
                        className="mt-2 h-2 rounded-full bg-[rgb(var(--ui-text)/0.88)]"
                        animate={
                            reduceMotion
                                ? undefined
                                : speaking
                                    ? { width: [12, 18, 10, 16, 12], borderRadius: [999, 8, 999, 8, 999] }
                                    : { width: 14 }
                        }
                        transition={{
                            duration: 1.05,
                            repeat: speaking ? Infinity : 0,
                            ease: "easeInOut",
                        }}
                    />

                    <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-emerald-500/15 bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-medium text-emerald-700 dark:border-emerald-300/15 dark:bg-emerald-300/10 dark:text-emerald-200">
                        <Sparkles className="size-2" />
                        {t("common.guide")}
                    </div>
                </div>
            </motion.div>
        </div>
    );
}

function SpeechBubble({
                          text,
                          animate = true,
                          side = "right",
                      }: {
    text: string;
    animate?: boolean;
    side?: "left" | "right";
}) {
    const reduceMotion = useReducedMotion();
    const rendered = useTypewriter(text, 15, animate && !reduceMotion);

    return (
        <div className="relative w-[min(220px,62vw)] sm:w-[250px]">
            <div className="ui-page-surface relative rounded-2xl px-3 py-2.5">
                <div
                    className={cn(
                        "absolute top-[18px] h-2.5 w-2.5 rotate-45 border",
                        side === "right"
                            ? "-right-[5px] border-r border-t border-[rgb(var(--ui-border)/1)] bg-[rgb(var(--ui-surface)/0.96)]"
                            : "-left-[5px] border-b border-l border-[rgb(var(--ui-border)/1)] bg-[rgb(var(--ui-surface)/0.96)]",
                    )}
                />
                <p className="text-[12px] leading-5 text-[rgb(var(--ui-text-muted)/0.9)] sm:text-[13px]">
                    {rendered}
                    <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-[rgb(var(--ui-text)/0.65)] align-middle" />
                </p>
            </div>
        </div>
    );
}

function AvatarWithQuestion({
                                text,
                                speaking,
                                side = "right",
                            }: {
    text: string;
    speaking: boolean;
    side?: "left" | "right";
}) {
    return (
        <div className="mx-auto flex w-full max-w-[360px] items-start justify-center">
            <div
                className={cn(
                    "flex items-start gap-2.5 sm:gap-3",
                    side === "left" ? "flex-row-reverse" : "flex-row",
                )}
            >
                <div className="pt-1">
                    <GuideAvatar speaking={speaking} />
                </div>
                <div className="pt-1.5">
                    <SpeechBubble text={text} side={side} />
                </div>
            </div>
        </div>
    );
}

/* -------------------- option / subject UI -------------------- */

function ChoiceButton({
                          active,
                          label,
                          hint,
                          onClick,
                          Icon,
                          disabled = false,
                      }: {
    active: boolean;
    label: string;
    hint?: string;
    onClick: () => void;
    Icon?: React.ComponentType<{ className?: string }>;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                "flex w-full items-start justify-between gap-4 rounded-xl border px-3.5 py-3 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--ui-ring)/0.22)]",
                disabled && "cursor-not-allowed opacity-70",
                active
                    ? "border-[rgb(var(--ui-accent)/0.22)] bg-[rgb(var(--ui-accent)/0.08)]"
                    : "bg-[rgb(var(--ui-surface-2)/1)] border-[rgb(var(--ui-border)/1)] hover:border-[rgb(var(--ui-accent)/0.16)] hover:bg-[rgb(var(--ui-surface)/1)]",
            )}
        >
            <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium text-[rgb(var(--ui-text)/0.96)]">
                    {Icon ? <Icon className="size-4" /> : null}
                    <span>{label}</span>
                </div>
                {hint ? (
                    <div className="mt-1 text-xs text-[rgb(var(--ui-text-muted)/0.84)]">
                        {hint}
                    </div>
                ) : null}
            </div>

            <div
                className={cn(
                    "mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-full border transition-colors",
                    active
                        ? "border-[rgb(var(--ui-accent)/1)] bg-[rgb(var(--ui-accent)/1)] text-[rgb(var(--ui-text-invert)/1)]"
                        : "border-[rgb(var(--ui-border-strong)/1)]",
                )}
            >
                {active ? <Check className="size-3" /> : null}
            </div>
        </button>
    );
}

function SubjectImageStrip({ subjects }: { subjects: SubjectCard[] }) {
    const { t, resolve } = useTaggedT("homeOnboarding");

    if (!subjects.length) return null;

    return (
        <div className="grid gap-3 sm:grid-cols-3">
            {subjects.slice(0, 3).map((subject) => {
                const title = resolve(subject.title, { appName: APP_NAME }, subject.slug);
                const badge = resolve(
                    subject.badge,
                    { appName: APP_NAME },
                    t("common.featured"),
                );
                const alt = resolve(subject.imageAlt, { appName: APP_NAME }, title);

                return (
                    <div
                        key={subject.slug}
                        className="ui-page-surface group relative overflow-hidden rounded-2xl"
                    >
                        <div className="relative aspect-[1.45/1]">
                            {subject.imageUrl ? (
                                <Image
                                    src={subject.imageUrl}
                                    alt={alt}
                                    fill
                                    sizes="(max-width: 640px) 100vw, 33vw"
                                    className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                                />
                            ) : (
                                <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(59,130,246,0.10))]" />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/5 to-transparent" />
                            <div className="absolute inset-x-0 bottom-0 p-3">
                                <div className="inline-flex rounded-full border border-white/15 bg-white/15 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-md">
                                    {badge}
                                </div>
                                <div className="mt-1 text-sm font-medium text-white">{title}</div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function TrialSubjectChooser({
                                 subjects,
                                 selected,
                                 onSelect,
                             }: {
    subjects: SubjectCard[];
    selected: string | null;
    onSelect: (slug: string) => void;
}) {
    const { resolve } = useTaggedT("homeOnboarding");

    if (!subjects.length) return null;

    return (
        <div className="flex flex-wrap gap-2">
            {subjects.map((subject) => {
                const active = selected === subject.slug;
                const title = resolve(subject.title, { appName: APP_NAME }, subject.slug);

                return (
                    <button
                        key={subject.slug}
                        type="button"
                        onClick={() => onSelect(subject.slug)}
                        className={cn(
                            "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                            active
                                ? "border-[rgb(var(--ui-accent)/0.22)] bg-[rgb(var(--ui-accent)/0.08)] text-[rgb(var(--ui-text)/0.96)]"
                                : "border-[rgb(var(--ui-border)/1)] bg-[rgb(var(--ui-surface)/1)] text-[rgb(var(--ui-text-muted)/1)] hover:bg-[rgb(var(--ui-hover)/1)] hover:text-[rgb(var(--ui-text)/1)]",
                        )}
                    >
                        {title}
                    </button>
                );
            })}
        </div>
    );
}

/* -------------------- onboarding panel -------------------- */

// replace your OnboardingPanel signature with this

function OnboardingPanel({
                             data,
                             setData,
                             onSkipAll,
                             onFinish,
                             subjectOptions,
                             locale,
                             onThemeSelect,
                             isAuthenticated,
                             initialStepIndex,
                             onRequestLocaleChange,
                             busy,
                         }: {
    data: OnboardingData;
    setData: React.Dispatch<React.SetStateAction<OnboardingData>>;
    onSkipAll: () => void;
    onFinish: (finalData: OnboardingData) => void;
    subjectOptions: SubjectCard[];
    locale: string;
    onThemeSelect: (theme: "light" | "dark") => void;
    isAuthenticated: boolean;
    initialStepIndex: number;
    onRequestLocaleChange: (args: {
        nextLocale: string;
        nextData: OnboardingData;
        stepIndex: number;
    }) => void;
    busy: boolean;
}) {
    const { t, resolve } = useTaggedT("homeOnboarding");
    const [stepIndex, setStepIndex] = useState(initialStepIndex);

    useEffect(() => {
        setStepIndex(initialStepIndex);
    }, [initialStepIndex]);

    useEffect(() => {
        saveStoredOnboarding(false, data, stepIndex, true);
    }, [data, stepIndex]);

    const localizedStepMeta = useMemo(
        () =>
            resolveDeepTagged(
                TAGGED_STEP_META,
                (key, values) => t(key, values),
                { appName: APP_NAME },
            ) as Omit<StepConfig, "choices">[],
        [t],
    );

    const discoveryChoices = useMemo(
        () =>
            resolveDeepTagged(
                TAGGED_DISCOVERY_CHOICES,
                (key, values) => t(key, values),
                { appName: APP_NAME },
            ) as Choice[],
        [t],
    );

    const themeChoices = useMemo(
        () =>
            resolveDeepTagged(
                TAGGED_THEME_CHOICES,
                (key, values) => t(key, values),
                { appName: APP_NAME },
            ) as Choice[],
        [t],
    );

    const trialChoices = useMemo(
        () =>
            resolveDeepTagged(
                TAGGED_TRIAL_CHOICES,
                (key, values) => t(key, values),
                { appName: APP_NAME },
            ) as Choice[],
        [t],
    );

    const dynamicStepConfig: StepConfig[] = useMemo(() => {
        const visibleSteps = localizedStepMeta.filter((step) => {
            return !(isAuthenticated && step.id === "trialIntent");
        });

        return visibleSteps.map((step) => {
            if (step.id === "preferredLanguage") {
                return {
                    ...step,
                    choices: [
                        { label: t("labels.language.english"), value: "english" },
                        { label: t("labels.language.french"), value: "french" },
                        { label: t("labels.language.haitian-creole"), value: "haitian-creole" },
                    ],
                };
            }

            if (step.id === "learningInterests") {
                return {
                    ...step,
                    choices: subjectOptions.map((subject) => ({
                        label: resolve(subject.title, { appName: APP_NAME }, subject.slug),
                        value: subject.slug,
                        hint: resolve(subject.badge, { appName: APP_NAME }, undefined),
                    })),
                };
            }

            if (step.id === "level") {
                return {
                    ...step,
                    choices: [
                        { label: t("labels.level.beginner"), value: "beginner" },
                        { label: t("labels.level.intermediate"), value: "intermediate" },
                        { label: t("labels.level.advanced"), value: "advanced" },
                    ],
                };
            }

            if (step.id === "studyTime") {
                return {
                    ...step,
                    choices: [
                        { label: t("labels.studyTime.1-2-hours"), value: "1-2-hours" },
                        { label: t("labels.studyTime.3-5-hours"), value: "3-5-hours" },
                        { label: t("labels.studyTime.6-plus-hours"), value: "6-plus-hours" },
                    ],
                };
            }

            if (step.id === "themePreference") {
                return { ...step, choices: themeChoices };
            }

            if (step.id === "trialIntent") {
                return { ...step, choices: trialChoices };
            }

            return { ...step, choices: discoveryChoices };
        });
    }, [
        localizedStepMeta,
        isAuthenticated,
        subjectOptions,
        t,
        resolve,
        themeChoices,
        trialChoices,
        discoveryChoices,
    ]);

    const step = dynamicStepConfig[stepIndex];
    const total = dynamicStepConfig.length;
    const progress = ((stepIndex + 1) / total) * 100;

    const currentValue = data[step.id];
    const canContinue = Array.isArray(currentValue)
        ? currentValue.length > 0
        : Boolean(currentValue);

    const questionText = useMemo(
        () => `${step.title} ${step.description}`,
        [step],
    );

    const handleToggle = (value: string) => {
        const next =
            step.mode === "multi"
                ? (() => {
                    const current = Array.isArray(data[step.id])
                        ? (data[step.id] as string[])
                        : [];
                    const set = new Set(current);
                    if (set.has(value)) set.delete(value);
                    else set.add(value);
                    return { ...data, [step.id]: Array.from(set) } as OnboardingData;
                })()
                : ({ ...data, [step.id]: value } as OnboardingData);

        setData(next);
        saveStoredOnboarding(false, next, stepIndex, true);

        if (step.id === "preferredLanguage" && step.mode === "single") {
            const nextLocale = mapNextLocale(value, locale);
            persistLocale(nextLocale);

            if (nextLocale !== locale) {
                onRequestLocaleChange({
                    nextLocale,
                    nextData: next,
                    stepIndex,
                });
            }
            return;
        }

        if (step.id === "themePreference" && step.mode === "single") {
            onThemeSelect(value === "dark" ? "dark" : "light");
        }
    };

    const handleContinue = async () => {
        if (!canContinue || busy) return;

        if (step.id === "preferredLanguage" && typeof currentValue === "string" && currentValue) {
            const nextLocale = mapNextLocale(currentValue, locale);
            persistLocale(nextLocale);

            if (nextLocale !== locale) {
                onRequestLocaleChange({
                    nextLocale,
                    nextData: data,
                    stepIndex,
                });
                return;
            }
        }

        if (step.id === "themePreference" && typeof currentValue === "string" && currentValue) {
            onThemeSelect(currentValue === "dark" ? "dark" : "light");
        }

        if (stepIndex === total - 1) {
            onFinish(data);
            return;
        }

        const nextStepIndex = stepIndex + 1;
        setStepIndex(nextStepIndex);
        saveStoredOnboarding(false, data, nextStepIndex, true);
    };

    const handleBack = () => {
        if (busy) return;
        const nextStepIndex = Math.max(0, stepIndex - 1);
        setStepIndex(nextStepIndex);
        saveStoredOnboarding(false, data, nextStepIndex, true);
    };

    const handleSkipCurrent = () => {
        if (busy) return;

        const next = {
            ...data,
            [step.id]: emptyValueForStep(step.id),
        } as OnboardingData;

        setData(next);

        if (stepIndex === total - 1) {
            saveStoredOnboarding(false, next, stepIndex, true);
            onFinish(next);
            return;
        }

        const nextStepIndex = stepIndex + 1;
        setStepIndex(nextStepIndex);
        saveStoredOnboarding(false, next, nextStepIndex, true);
    };

    const side: "left" | "right" = stepIndex % 2 === 0 ? "right" : "left";

    return (
        <div className="space-y-4">
            <AvatarWithQuestion text={questionText} speaking side={side} />

            {step.id === "learningInterests" ? (
                <div className="mx-auto max-w-[520px]">
                    <SubjectImageStrip subjects={subjectOptions} />
                </div>
            ) : null}

            <Surface className="mx-auto max-w-[520px] p-4">
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <div className="ui-title-sm">{t("panel.title")}</div>
                        <div className="mt-1 text-sm leading-5.5 text-[rgb(var(--ui-text-muted)/0.84)]">
                            {t("panel.description")}
                        </div>
                    </div>

                    <div className="flex w-full flex-wrap items-center justify-end gap-1.5 sm:w-auto sm:flex-nowrap">
                        <button
                            type="button"
                            onClick={handleSkipCurrent}
                            disabled={busy}
                            className={cn(
                                buttonClass("ghost"),
                                "h-7 w-auto shrink-0 whitespace-nowrap px-2.5 text-[11px] font-medium sm:text-xs"
                            )}
                        >
                            {t("panel.skipCurrent", undefined, "Skip question")}
                        </button>

                        <button
                            type="button"
                            onClick={onSkipAll}
                            disabled={busy}
                            className={cn(
                                buttonClass("ghost"),
                                "h-7 w-auto shrink-0 whitespace-nowrap px-2.5 text-[11px] font-medium sm:text-xs"
                            )}
                        >
                            {t("panel.skipAll", undefined, "Skip all")}
                        </button>
                    </div>
                </div>

                <div className="mt-4 space-y-2">
                    <ProgressBar value={progress} />
                    <div className="ui-meta">
                        {t("panel.step", { current: stepIndex + 1, total })}
                    </div>
                </div>

                <div className="mt-4 grid gap-2.5">
                    {step.choices.map((choice) => {
                        const active = Array.isArray(currentValue)
                            ? currentValue.includes(choice.value)
                            : currentValue === choice.value;

                        return (
                            <ChoiceButton
                                key={choice.value}
                                active={active}
                                label={choice.label}
                                hint={choice.hint}
                                onClick={() => handleToggle(choice.value)}
                                Icon={choice.icon}
                                disabled={busy}
                            />
                        );
                    })}
                </div>

                <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <button
                        type="button"
                        onClick={handleBack}
                        disabled={stepIndex === 0 || busy}
                        className={cn(buttonClass("ghost"), "h-8 w-full text-sm sm:w-auto")}
                    >
                        {t("panel.back")}
                    </button>

                    <button
                        type="button"
                        onClick={handleContinue}
                        disabled={!canContinue || busy}
                        className={cn(buttonClass("primary"), "h-8 w-full gap-1.5 text-sm sm:w-auto")}
                    >
                        {stepIndex === total - 1 ? t("panel.finish") : t("panel.continue")}
                        <ChevronRight className="size-3.5" />
                    </button>
                </div>
            </Surface>
        </div>
    );
}

/* -------------------- personalized sections -------------------- */

function PersonalizedHighlights({ data }: { data: OnboardingData }) {
    const { t, resolve } = useTaggedT("homeOnboarding");

    const cards = useMemo<readonly HighlightCard[]>(
        () =>
            TAGGED_HIGHLIGHT_CARDS.map((card) => ({
                key: card.key,
                icon: card.icon,
                title: resolve(card.title, { appName: APP_NAME }, card.title),
                text: resolve(card.text, { appName: APP_NAME }, card.text),
                color: card.color
            })),
        [resolve],
    );

    const valuesByKey = {
        language: mapLanguageLabel(data.preferredLanguage, t),
        level: mapLevelLabel(data.level, t),
        pace: mapTimeLabel(data.studyTime, t),
    } as const;

    return (
        <div className="grid gap-4 md:grid-cols-3">
            {cards.map((card) => {
                const Icon = card.icon;
                const value =
                    card.key === "language"
                        ? valuesByKey.language
                        : card.key === "level"
                            ? valuesByKey.level
                            : valuesByKey.pace;

                return (
                    <div key={card.key} className="ui-stat-card ui-surface p-4">
                        <div className="flex items-start gap-3">
                            <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/10 p-2 text-emerald-700 dark:border-emerald-300/15 dark:bg-emerald-300/10 dark:text-emerald-200">
                                <Icon className={`${card.color} size-4`} />
                            </div>

                            <div className="min-w-0">
                                <div className="ui-meta">{card.title}</div>
                                <div className="mt-1 text-sm font-medium text-[rgb(var(--ui-text)/0.96)]">
                                    {value}
                                </div>
                            </div>
                        </div>

                        <p className="mt-3 text-sm leading-6 text-[rgb(var(--ui-text-muted)/0.84)]">
                            {card.text}
                        </p>
                    </div>
                );
            })}
        </div>
    );
}

function SubjectGrid({
                         data,
                         subjects,
                         locale,
                     }: {
    data: OnboardingData;
    subjects: SubjectCard[];
    locale: string;
}) {
    const { t, resolve } = useTaggedT("homeOnboarding");
    const reduceMotion = useReducedMotion();
    const recommended = getRecommendedSubjects(data, subjects);

    return (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {recommended.map((subject) => {
                const title = resolve(subject.title, { appName: APP_NAME }, subject.slug);
                const description = resolve(subject.description, { appName: APP_NAME }, "");
                const badge = resolve(
                    subject.badge,
                    { appName: APP_NAME },
                    t("common.featured"),
                );
                const alt = resolve(subject.imageAlt, { appName: APP_NAME }, title);

                return (
                    <Link
                        key={subject.slug}
                        href={`/${encodeURIComponent(locale)}/subjects/${subject.slug}/modules`}
                        className="group block"
                    >
                        <motion.div whileHover={reduceMotion ? undefined : { y: -3 }}>
                            <Surface className="h-full overflow-hidden p-0 transition-colors group-hover:border-[rgb(var(--ui-accent)/0.18)]">
                                <div className="relative aspect-[1.5/1]">
                                    {subject.imageUrl ? (
                                        <Image
                                            src={subject.imageUrl}
                                            alt={alt}
                                            fill
                                            sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
                                            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                                        />
                                    ) : (
                                        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(59,130,246,0.10))]" />
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/5 to-transparent" />
                                    <div className="absolute left-3 top-3 rounded-full border border-white/15 bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-md">
                                        {badge}
                                    </div>
                                </div>

                                <div className="p-4">
                                    <div className="text-base font-medium text-[rgb(var(--ui-text)/0.96)]">
                                        {title}
                                    </div>

                                    <p className="mt-2 text-sm leading-6 text-[rgb(var(--ui-text-muted)/0.84)]">
                                        {description}
                                    </p>

                                    <div className="mt-5 flex items-center gap-2 text-sm font-medium text-[rgb(var(--ui-text)/0.96)]">
                                        {t("recommended.exploreSubject")}
                                        <ChevronRight className="size-4" />
                                    </div>
                                </div>
                            </Surface>
                        </motion.div>
                    </Link>
                );
            })}
        </div>
    );
}

/* -------------------- main client -------------------- */

export default function HomePageAvatarOnboardingClient({
                                                           initialSubjects,
                                                           locale,
                                                           isAuthenticated,
                                                       }: {
    initialSubjects: SubjectCard[];
    locale: string;
    isAuthenticated: boolean;
}) {
    const { t, resolve } = useTaggedT("homeOnboarding");
    const reduceMotion = useReducedMotion();
    const { setTheme, resolvedTheme } = useTheme();
    const router = useRouter();
    const pathname = usePathname();

    const [hydrated, setHydrated] = useState(false);
    const [subjects] = useState<SubjectCard[]>(initialSubjects);

    const [onboardingData, setOnboardingData] =
        useState<OnboardingData>(DEFAULT_DATA);
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [completed, setCompleted] = useState(false);
    const [bubbleCollapsed, setBubbleCollapsed] = useState(false);
    const [resumeStepIndex, setResumeStepIndex] = useState(0);

    const [trialSubjectSlug, setTrialSubjectSlug] = useState<string | null>(null);
    const [bootstrapped, setBootstrapped] = useState(false);
    const [trialBusy, setTrialBusy] = useState(false);
    const [trialErr, setTrialErr] = useState<string | null>(null);
    const [pendingLocaleSwitch, setPendingLocaleSwitch] = useState<null | {
        locale: string;
        label: string;
    }>(null);
    const [skipped, setSkipped] = useState(false);

    const redirectingRef = useRef(false);
// 1) add this near your other memo/state setup, after pathname/router

    const authHref = useAuthHref() ;
    async function redirectToTrial(args: {
        href: string;
        delayMs?: number;
    }) {
        redirectingRef.current = true;
        await sleep(args.delayMs ?? 1200);
        window.location.assign(args.href);
    }

    const applyThemeChoice = React.useCallback(
        (theme: "light" | "dark") => {
            if (typeof window === "undefined") return;
            window.requestAnimationFrame(() => {
                setTheme(theme);
            });
        },
        [setTheme],
    );
// 3) add these handlers near your other handlers

    const openOnboardingFlow = () => {
        setCompleted(false);
        setSkipped(false);
        setPendingLocaleSwitch(null);
        setShowOnboarding(true);
        setBubbleCollapsed(false);

        // saveStoredOnboarding(false, onboardingData, resumeStepIndex, true);

        if (typeof window !== "undefined") {
            window.localStorage.removeItem(DISMISSED_KEY);
        }
    };

    const handleGoToAuth = () => {
        router.push(authHref as any);
    };
// 2) replace your bootstrapping effect with this

    useEffect(() => {
        const stored = readStoredOnboarding();

        const dismissed =
            typeof window !== "undefined" &&
            window.localStorage.getItem(DISMISSED_KEY) === "1";

        const effectiveCompleted = stored.open ? false : stored.completed;
        const effectiveSkipped = stored.open ? false : dismissed;

        const normalizedStoredData = normalizeOnboardingDataForSubjects(
            stored.data,
            subjects,
        );

        setOnboardingData(normalizedStoredData);
        setCompleted(effectiveCompleted);
        setSkipped(effectiveSkipped);
        setResumeStepIndex(stored.stepIndex);

        // only resume onboarding if it was already open before refresh
        const shouldResumeOnboarding = Boolean(stored.open);

        setShowOnboarding(shouldResumeOnboarding);
        setBubbleCollapsed(
            Boolean(effectiveCompleted || effectiveSkipped || isAuthenticated),
        );
        setHydrated(true);
        setBootstrapped(true);
    }, [isAuthenticated, subjects]);
    useEffect(() => {
        const interests = onboardingData.learningInterests ?? [];

        if (!interests.length) {
            setTrialSubjectSlug(null);
            return;
        }

        setTrialSubjectSlug((prev) => {
            if (prev && interests.includes(prev)) return prev;
            return interests[0] ?? null;
        });
    }, [onboardingData.learningInterests]);

    useEffect(() => {
        if (!pendingLocaleSwitch?.locale || !pathname) return;

        const timer = window.setTimeout(() => {
            router.replace(pathname as any, {
                locale: pendingLocaleSwitch.locale as any,
            });
        }, 220);

        return () => window.clearTimeout(timer);
    }, [pendingLocaleSwitch, router, pathname]);

    const selectedTrialSubjects = useMemo(() => {
        const selected = new Set(onboardingData.learningInterests);
        return subjects.filter((s) => selected.has(s.slug));
    }, [subjects, onboardingData.learningInterests]);

    const welcomeText = useMemo(
        () =>
            buildWelcomeMessage(
                onboardingData,
                completed,
                subjects,
                t,
                resolve,
                locale,
            ),
        [onboardingData, completed, subjects, t, resolve, locale],
    );

    const interestSummary = useMemo(() => {
        if (!onboardingData.learningInterests.length) {
            return t("interestSummary.empty", { appName: APP_NAME });
        }

        return t("interestSummary.focused", {
            interests: formatList(
                locale,
                onboardingData.learningInterests.map((slug) =>
                    titleFromSlug(slug, subjects, resolve),
                ),
            ),
        });
    }, [onboardingData.learningInterests, subjects, t, resolve, locale]);

    const canStartTrial = Boolean(
        !isAuthenticated &&
        trialSubjectSlug &&
        onboardingData.level,
    );

    const persistOnboardingState = async (data: OnboardingData) => {
        await saveOnboarding({
            preferredLanguage: data.preferredLanguage || undefined,
            learningInterests: data.learningInterests,
            level: data.level || undefined,
            studyTime: data.studyTime || undefined,
            discoverySource: data.discoverySource || undefined,
            completed: true,
        });
    };

    const handleLocaleChange = React.useCallback(
        ({
             nextLocale,
             nextData,
             stepIndex,
         }: {
            nextLocale: string;
            nextData: OnboardingData;
            stepIndex: number;
        }) => {
            if (nextLocale === locale) return;

            setCompleted(false);
            setSkipped(false);
            setOnboardingData(nextData);
            setResumeStepIndex(stepIndex);
            setShowOnboarding(true);
            setBubbleCollapsed(false);

            saveStoredOnboarding(false, nextData, stepIndex, true);

            setPendingLocaleSwitch({
                locale: nextLocale,
                label: mapLanguageLabel(nextData.preferredLanguage, t),
            });
        },
        [locale, t],
    );

    const beginTrial = async (opts?: {
        subject?: string | null;
        level?: string | null;
    }) => {
        const subject = opts?.subject ?? trialSubjectSlug;
        const level = (opts?.level ?? onboardingData.level) || "beginner";

        if (!subject) {
            setTrialErr(t("trial.chooseSubjectError"));
            return;
        }

        const nextLocale = onboardingData.preferredLanguage
            ? mapNextLocale(onboardingData.preferredLanguage, locale)
            : locale;

        redirectingRef.current = false;
        setTrialBusy(true);
        setTrialErr(null);

        try {
            if (onboardingData.preferredLanguage) {
                persistLocale(nextLocale);
            }

            const out = await startTrialSession({
                subject,
                level,
                locale: nextLocale,
            });

            if (typeof window !== "undefined") {
                window.sessionStorage.setItem(TRIAL_LAST_SESSION_KEY, out.sessionId);
            }

            const href = buildTrialHref({
                locale: nextLocale,
                sessionId: out.sessionId,
                subject,
                level,
                status: out.status,
                completed: out.completed,
            });

            await redirectToTrial({ href, delayMs: 1200 });
            return;
        } catch (err) {
            console.error(err);
            setTrialErr(t("trial.startError"));
            redirectingRef.current = false;
            setTrialBusy(false);
        }
    };

    const handleFinish = async (data: OnboardingData) => {
        const nextLocale = data.preferredLanguage
            ? mapNextLocale(data.preferredLanguage, locale)
            : locale;

        const finishTrialSubject =
            trialSubjectSlug ?? data.learningInterests[0] ?? null;

        setTrialErr(null);
        setSkipped(false);

        if (data.preferredLanguage) {
            persistLocale(nextLocale);
        }

        if (data.themePreference) {
            applyThemeChoice(data.themePreference);
        }

        saveStoredOnboarding(true, data, 0, false);
        setOnboardingData(data);

        try {
            await persistOnboardingState(data);

            if (isAuthenticated) {
                setCompleted(true);
                setShowOnboarding(false);
                setBubbleCollapsed(true);
                setResumeStepIndex(0);
                return;
            }

            const shouldAutoStartTrial =
                data.trialIntent === "now" &&
                Boolean(finishTrialSubject) &&
                Boolean(data.level);

            if (shouldAutoStartTrial && finishTrialSubject) {
                redirectingRef.current = false;
                setTrialBusy(true);

                const subject = finishTrialSubject;
                const level = data.level || "beginner";

                const out = await startTrialSession({
                    subject,
                    level,
                    locale: nextLocale,
                });

                const href = buildTrialHref({
                    locale: nextLocale,
                    sessionId: out.sessionId,
                    subject,
                    level,
                    status: out.status,
                    completed: out.completed,
                });

                await redirectToTrial({ href, delayMs: 1200 });
                return;
            }

            setCompleted(true);
            setShowOnboarding(false);
            setBubbleCollapsed(true);
            setResumeStepIndex(0);
        } catch (err) {
            console.error("Failed to finish onboarding", err);
            setCompleted(true);
            setShowOnboarding(false);
            setBubbleCollapsed(true);
            setResumeStepIndex(0);
        } finally {
            if (!redirectingRef.current) {
                setTrialBusy(false);
            }
        }
    };

    // rename your page-level skip handler

    const handleSkipAll = async () => {
        setShowOnboarding(false);
        setBubbleCollapsed(true);
        setResumeStepIndex(0);
        setSkipped(true);
        saveStoredOnboarding(false, onboardingData, 0, false);

        if (typeof window !== "undefined") {
            window.localStorage.setItem(DISMISSED_KEY, "1");
        }

        try {
            await saveOnboarding({ skipped: true });
        } catch (err) {
            console.error("Failed to persist skipped onboarding", err);
        }
    };

    const handleStartTrial = async () => {
        try {
            await persistOnboardingState(onboardingData);
        } catch (err) {
            console.error("Failed to persist onboarding before trial", err);
        }

        await beginTrial();
    };

// 4) replace reopenAssistant with this simpler version

    const reopenAssistant = () => {
        openOnboardingFlow();
    };

    const mustStayOnboarding =
        !skipped && !completed;





    // 5) replace these booleans

    const showEntryGate =
        bootstrapped &&
        !isAuthenticated &&
        !completed &&
        !skipped &&
        !showOnboarding &&
        !pendingLocaleSwitch;

    const showOnboardingGate =
        bootstrapped && (showOnboarding || Boolean(pendingLocaleSwitch));

    const showHomeContent =
        bootstrapped && !showEntryGate && !showOnboardingGate;

    const showChrome = showHomeContent;

    const showFloatingAssistant =
        showHomeContent &&
        !isAuthenticated &&
        (completed || skipped);

    const activeOverlay = pendingLocaleSwitch
        ? {
            mode: "locale" as const,
            title: t(
                "localeSwitch.overlayTitle",
                undefined,
                "Updating your language.",
            ),
            description: t(
                "localeSwitch.overlayDescription",
                { appName: APP_NAME },
                "Reloading your current step with the right translations.",
            ),
            statusLabel: pendingLocaleSwitch.label,
        }
        : trialBusy
            ? {
                mode: "trial" as const,
                title: t("trial.overlayTitle"),
                description: t("trial.overlayDescription"),
                statusLabel: undefined,
            }
            : null;

    return (
        <>
            {showChrome ? (
                <HeaderSlick brand={APP_NAME} badge={t("common.mvp")} />
            ) : null}

            <PageShell>
                <section className="relative overflow-hidden">
                    <PageContainer>
                        <AnimatePresence mode="wait">
                            {!bootstrapped ? (
                                <motion.div
                                    key="gate-loading"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="mx-auto max-w-[760px]"
                                >
                                    <Surface className="p-4 sm:p-5 lg:p-6">
                                        <div className="mx-auto max-w-[520px] text-center">
                                            <SectionKicker>{t("gate.kicker")}</SectionKicker>
                                            <h1 className="mt-2 text-[26px] font-semibold tracking-tight sm:text-[34px]">
                                                {t("gate.title", { appName: APP_NAME })}
                                            </h1>
                                            <p className="mt-3 text-sm leading-6 text-[rgb(var(--ui-text-muted)/0.86)]">
                                                {t("gate.description", { appName: APP_NAME })}
                                            </p>
                                        </div>
                                    </Surface>
                                </motion.div>
                            )
                                : showEntryGate ? (
                                    <motion.div
                                        key="entry-gate"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        transition={{ duration: 0.28 }}
                                        className="mx-auto max-w-[760px]"
                                    >
                                        <Surface className="p-4 sm:p-5 lg:p-6">
                                            <div className="mx-auto max-w-[560px] text-center">
                                                <SectionKicker>
                                                    {t("entry.kicker", undefined, "Welcome")}
                                                </SectionKicker>

                                                <h1 className="mt-2 text-[26px] font-semibold tracking-tight sm:text-[34px]">
                                                    {t(
                                                        "entry.title",
                                                        { appName: APP_NAME },
                                                        `Welcome to ${APP_NAME}`,
                                                    )}
                                                </h1>

                                                <p className="mt-3 text-sm leading-6 text-[rgb(var(--ui-text-muted)/0.86)]">
                                                    {t(
                                                        "entry.description",
                                                        { appName: APP_NAME },
                                                        "Let’s get you to the right place. Are you new here, or do you already have an account?",
                                                    )}
                                                </p>
                                            </div>

                                            <div className="mt-6">
                                                <AvatarWithQuestion
                                                    text={t(
                                                        "entry.avatarText",
                                                        { appName: APP_NAME },
                                                        "Hi, I’m your guide. Are you new here, or do you already have an account?",
                                                    )}
                                                    speaking
                                                    side="right"
                                                />
                                            </div>

                                            <div className="mx-auto mt-6 max-w-[520px]">
                                                <Surface className="p-4">
                                                    <div className="grid gap-3 sm:grid-cols-2">
                                                        <button
                                                            type="button"
                                                            onClick={openOnboardingFlow}
                                                            className={cn(buttonClass("primary"), "h-10 w-full")}
                                                        >
                                                            {t("entry.newUser", undefined, "I’m new here")}
                                                        </button>

                                                        <NavButton
                                                            href={authHref}
                                                            prefetch
                                                            className={cn(buttonClass("secondary"), "h-10 w-full")}
                                                        >
                                                            {t(
                                                                "entry.returningUser",
                                                                undefined,
                                                                "I already have an account",
                                                            )}
                                                        </NavButton>
                                                    </div>

                                                    <div className="mt-3 text-center text-xs text-[rgb(var(--ui-text-muted)/0.8)]">
                                                        {t(
                                                            "entry.helper",
                                                            undefined,
                                                            "New users start onboarding. Returning users go to sign in.",
                                                        )}
                                                    </div>
                                                </Surface>
                                            </div>
                                        </Surface>
                                    </motion.div>
                                ) : showOnboardingGate ? (
                                <motion.div
                                    key="gate-only"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.28 }}
                                    className="mx-auto max-w-[760px]"
                                >
                                    <Surface className="p-4 sm:p-5 lg:p-6">
                                        <div className="mx-auto max-w-[520px] text-center">
                                            <SectionKicker>{t("gate.kicker")}</SectionKicker>
                                            <h1 className="mt-2 text-[26px] font-semibold tracking-tight sm:text-[34px]">
                                                {t("gate.title", { appName: APP_NAME })}
                                            </h1>
                                            <p className="mt-3 text-sm leading-6 text-[rgb(var(--ui-text-muted)/0.86)]">
                                                {t("gate.description", { appName: APP_NAME })}
                                            </p>
                                        </div>

                                        <div className="mt-6">

                                            <OnboardingPanel
                                                data={onboardingData}
                                                setData={setOnboardingData}
                                                onSkipAll={handleSkipAll}
                                                onFinish={handleFinish}
                                                subjectOptions={subjects}
                                                locale={locale}
                                                onThemeSelect={applyThemeChoice}
                                                isAuthenticated={isAuthenticated}
                                                initialStepIndex={resumeStepIndex}
                                                onRequestLocaleChange={handleLocaleChange}
                                                busy={Boolean(pendingLocaleSwitch)}
                                            />
                                        </div>
                                    </Surface>
                                </motion.div>
                            ) : showHomeContent ? (
                                <motion.div
                                    key="full-home"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.32 }}
                                    className="grid gap-4 lg:gap-6"
                                >
                                    <Surface className="p-4 sm:p-5 lg:p-6">
                                        <div className="grid items-center gap-8 xl:grid-cols-[minmax(0,1.05fr)_minmax(220px,0.95fr)] xl:gap-10">
                                            <div className="order-2 min-w-0 xl:order-1">
                                                <SectionKicker>{t("hero.kicker")}</SectionKicker>

                                                <motion.h1
                                                    initial={{ opacity: 0, y: 14 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ duration: 0.5 }}
                                                    className="mt-2 max-w-4xl text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl"
                                                    style={{ color: "rgb(var(--ui-text) / 0.96)" }}
                                                >
                                                    {t("hero.title", { appName: APP_NAME })}
                                                </motion.h1>

                                                <motion.p
                                                    initial={{ opacity: 0, y: 14 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ delay: 0.08, duration: 0.5 }}
                                                    className="mt-3 max-w-3xl text-sm leading-6 text-[rgb(var(--ui-text-muted)/0.86)] sm:text-[15px] sm:leading-7"
                                                >
                                                    {completed
                                                        ? welcomeText
                                                        : t("hero.descriptionFresh", { appName: APP_NAME })}
                                                </motion.p>

                                                {completed &&
                                                !isAuthenticated &&
                                                selectedTrialSubjects.length > 0 ? (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: 14 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        transition={{ delay: 0.12, duration: 0.5 }}
                                                        className="mt-5 space-y-2"
                                                    >
                                                        <div className="ui-kicker">
                                                            {t("hero.chooseSubject")}
                                                        </div>

                                                        <TrialSubjectChooser
                                                            subjects={selectedTrialSubjects}
                                                            selected={trialSubjectSlug}
                                                            onSelect={setTrialSubjectSlug}
                                                        />
                                                    </motion.div>
                                                ) : null}

                                                <motion.div
                                                    initial={{ opacity: 0, y: 14 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ delay: 0.16, duration: 0.5 }}
                                                    className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap"
                                                >
                                                    {completed ? (
                                                        isAuthenticated ? (
                                                            <NavButton
                                                                href={
                                                                    trialSubjectSlug
                                                                        ? `/subjects/${encodeURIComponent(trialSubjectSlug)}/modules`
                                                                        : `/${encodeURIComponent(locale)}/subjects`
                                                                }
                                                                prefetch
                                                                className={cn(buttonClass("primary"), "h-9 gap-2 sm:w-auto")}
                                                            >
                                                                {t("hero.continueLearning")}
                                                                <ArrowRight className="size-4" />
                                                            </NavButton>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                className={cn(buttonClass("primary"), "h-9 gap-2 sm:w-auto")}
                                                                onClick={handleStartTrial}
                                                                disabled={!canStartTrial || trialBusy}
                                                            >
                                                                {trialBusy
                                                                    ? t("hero.startingTrial")
                                                                    : t("hero.try3Questions")}
                                                                <ArrowRight className="size-4" />
                                                            </button>
                                                        )
                                                    ) : isAuthenticated ? (
                                                        <NavButton
                                                            href={`/subjects`}
                                                            prefetch
                                                            className={cn(
                                                                buttonClass("primary"),
                                                                "h-9 whitespace-nowrap sm:w-auto inline-flex items-center"
                                                            )}
                                                        >
                                                            <span className="whitespace-nowrap">{t("hero.continueLearning")}</span>
                                                            {/*<ArrowRight className="size-4 shrink-0" />*/}
                                                        </NavButton>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            className={cn(buttonClass("primary"), "h-9 gap-2 sm:w-auto")}
                                                            onClick={reopenAssistant}
                                                        >
                                                            {t("hero.openGuide")}
                                                            <ArrowRight className="size-4" />
                                                        </button>
                                                    )}

                                                    <NavButton
                                                        href={`/${encodeURIComponent(locale)}/catalogs`}
                                                        prefetch
                                                        className={cn(buttonClass("secondary"), "h-9 sm:w-auto")}
                                                    >
                                                        {t("hero.exploreSubjects")}
                                                    </NavButton>

                                                    <button
                                                        type="button"
                                                        onClick={reopenAssistant}
                                                        className={cn(buttonClass("secondary"), "h-9 sm:w-auto")}
                                                    >
                                                        {completed || skipped || isAuthenticated
                                                            ? t("hero.editPreferences")
                                                            : t("hero.editAnswers")}
                                                    </button>
                                                </motion.div>

                                                {trialErr ? (
                                                    <div className="mt-3 text-sm text-[rgb(var(--ui-danger)/1)]">
                                                        {trialErr}
                                                    </div>
                                                ) : null}

                                                {completed ? (
                                                    <div className="mt-4 ui-meta">
                                                        {t("hero.currentTheme", {
                                                            theme: mapThemeLabel(
                                                                onboardingData.themePreference || resolvedTheme || "",
                                                                t,
                                                            ),
                                                        })}
                                                    </div>
                                                ) : null}
                                            </div>

                                            <div className="order-1 xl:order-2">
                                                <motion.div
                                                    initial={{ opacity: 0, scale: 0.98 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    transition={{ duration: 0.5 }}
                                                    className="relative mx-auto w-full max-w-[280px]"
                                                >
                                                    <div className="space-y-3">
                                                        {!bubbleCollapsed ? (
                                                            <AvatarWithQuestion
                                                                text={welcomeText}
                                                                speaking={!completed}
                                                                side="right"
                                                            />
                                                        ) : (
                                                            <div className="flex justify-center">
                                                                <GuideAvatar speaking={false} />
                                                            </div>
                                                        )}

                                                        <SoftPanel className="ui-surface p-4">
                                                            <div className="flex flex-col gap-3">
                                                                <div className="min-w-0">
                                                                    <div className="ui-title-sm">
                                                                        {completed
                                                                            ? t("guideCard.personalized")
                                                                            : t("guideCard.ready")}
                                                                    </div>
                                                                    <p className="mt-1 text-sm leading-6 text-[rgb(var(--ui-text-muted)/0.84)]">
                                                                        {interestSummary}
                                                                    </p>
                                                                </div>

                                                                {completed ? (
                                                                    isAuthenticated ? (
                                                                        <NavButton
                                                                            href={
                                                                                trialSubjectSlug
                                                                                    ? `/${encodeURIComponent(locale)}/subjects/${encodeURIComponent(trialSubjectSlug)}/modules`
                                                                                    : `/${encodeURIComponent(locale)}/subjects`
                                                                            }
                                                                            prefetch
                                                                            className={cn(buttonClass("primary"), "w-full")}
                                                                        >
                                                                            {t("hero.continueLearning")}
                                                                        </NavButton>
                                                                    ) : (
                                                                        <div className="flex flex-col gap-2">
                                                                            <button
                                                                                type="button"
                                                                                onClick={handleStartTrial}
                                                                                disabled={!canStartTrial || trialBusy}
                                                                                className={cn(buttonClass("primary"), "w-full")}
                                                                            >
                                                                                {trialBusy
                                                                                    ? t("hero.startingTrial")
                                                                                    : t("hero.try3Questions")}
                                                                            </button>

                                                                            <button
                                                                                type="button"
                                                                                onClick={reopenAssistant}
                                                                                className={cn(buttonClass("secondary"), "w-full")}
                                                                            >
                                                                                {t("guideCard.updatePreferences")}
                                                                            </button>
                                                                        </div>
                                                                    )
                                                                ) : isAuthenticated ? (
                                                                    <NavButton
                                                                        href={`/${encodeURIComponent(locale)}/subjects`}
                                                                        prefetch
                                                                        className={cn(buttonClass("primary"), "w-full")}
                                                                    >
                                                                        {t("hero.continueLearning")}
                                                                    </NavButton>
                                                                ) : (
                                                                    <button
                                                                        type="button"
                                                                        onClick={reopenAssistant}
                                                                        className={cn(buttonClass("secondary"), "w-full")}
                                                                    >
                                                                        {t("guideCard.start")}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </SoftPanel>
                                                    </div>
                                                </motion.div>
                                            </div>
                                        </div>
                                    </Surface>

                                    <Surface className="p-4 sm:p-5 lg:p-6">
                                        <div className="max-w-2xl">
                                            <SectionKicker>{t("highlights.kicker")}</SectionKicker>
                                            <SectionTitle>{t("highlights.title")}</SectionTitle>
                                            <SectionLead>
                                                {t("highlights.description", { appName: APP_NAME })}
                                            </SectionLead>
                                        </div>

                                        <div className="mt-6">
                                            <PersonalizedHighlights data={onboardingData} />
                                        </div>
                                    </Surface>

                                    <Surface className="p-4 sm:p-5 lg:p-6">
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                                            <div>
                                                <SectionKicker>{t("recommended.kicker")}</SectionKicker>
                                                <SectionTitle>{t("recommended.title")}</SectionTitle>
                                            </div>

                                            <Link
                                                href={`/${encodeURIComponent(locale)}/catalogs`}
                                                className="inline-flex items-center gap-2 text-sm font-medium text-[rgb(var(--ui-text)/0.96)] transition-opacity hover:opacity-70"
                                            >
                                                {t("recommended.viewAll")}
                                                <ChevronRight className="size-4" />
                                            </Link>
                                        </div>

                                        <div className="mt-6">
                                            <SubjectGrid
                                                data={onboardingData}
                                                subjects={subjects}
                                                locale={locale}
                                            />
                                        </div>
                                    </Surface>
                                </motion.div>
                            ) : null}
                        </AnimatePresence>
                    </PageContainer>
                </section>

                {showFloatingAssistant ? (
                    <div className="fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6">
                        <motion.button
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={reduceMotion ? undefined : { y: -2 }}
                            type="button"
                            onClick={reopenAssistant}
                            className="ui-page-surface flex items-center gap-3 rounded-full px-3 py-3 sm:px-4"
                        >
                            <div className="flex size-9 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-700 dark:bg-emerald-300/10 dark:text-emerald-200">
                                <MessageCircleMore className="size-4" />
                            </div>

                            <div className="hidden text-left sm:block">
                                <div className="text-sm font-medium text-[rgb(var(--ui-text)/0.96)]">
                                    {t("floatingAssistant.title")}
                                </div>
                                <div className="ui-meta">
                                    {t("floatingAssistant.subtitle")}
                                </div>
                            </div>
                        </motion.button>
                    </div>
                ) : null}
            </PageShell>

            <RedirectOverlay
                open={Boolean(activeOverlay)}
                mode={activeOverlay?.mode ?? "trial"}
                title={activeOverlay?.title ?? ""}
                description={activeOverlay?.description}
                statusLabel={activeOverlay?.statusLabel}
            />

            {showChrome ? <FooterSlick /> : null}
        </>
    );
}