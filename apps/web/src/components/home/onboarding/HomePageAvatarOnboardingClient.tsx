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

import { useRouter, usePathname } from "@/i18n/navigation";
import { Button } from "@/components/home/ui/button";
import { CardContent } from "@/components/home/ui/card";
import { Progress } from "@/components/home/ui/progress";
import { cn } from "@/lib/cn";
import { buildTrialHref, saveOnboarding, sleep, startTrialSession } from "@/lib/onboarding/client";
import { persistLocale } from "@/lib/locale/persistLocale";
import HeaderSlick from "@/components/HeaderSlick";
import FooterSlick from "@/components/layout/FooterSlick";
import { resolveDeepTagged } from "@/i18n/resolveDeepTagged";
import { useTaggedT } from "@/i18n/tagged";
import RedirectOverlay from "@/components/shared/RedirectOverlay";

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
type DiscoverySource = "other" | "search" | "friend" | "social" | "school-work" | "";

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
    stepIndex: number;
    data: OnboardingData;
};

const STORAGE_KEY = "zoeskoul.home.onboarding.v2";
const DISMISSED_KEY = "zoeskoul.home.avatar.dismissed.v1";
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

type HighlightCard = {
    key: string;
    icon: LucideIcon;
    title: string;
    text: string;
};

const TAGGED_HIGHLIGHT_CARDS = [
    {
        key: "language",
        icon: Globe,
        title: "@:highlights.cards.language.title",
        text: "@:highlights.cards.language.text",
    },
    {
        key: "level",
        icon: GraduationCap,
        title: "@:highlights.cards.level.title",
        text: "@:highlights.cards.level.text",
    },
    {
        key: "pace",
        icon: TimerReset,
        title: "@:highlights.cards.pace.title",
        text: "@:highlights.cards.pace.text",
    },
] as const satisfies readonly HighlightCard[];

function Surface({
                     children,
                     className,
                 }: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "rounded-[18px] border p-3 sm:rounded-[20px] sm:p-4",
                "bg-white/82 border-black/5 shadow-[0_18px_50px_-32px_rgba(0,0,0,0.24)] backdrop-blur-xl",
                "dark:bg-white/[0.06] dark:border-white/10 dark:shadow-none",
                className,
            )}
        >
            {children}
        </div>
    );
}

function SectionKicker({ children }: { children: React.ReactNode }) {
    return (
        <div className="text-[9px] font-extrabold uppercase tracking-[0.22em] text-neutral-500 dark:text-white/45">
            {children}
        </div>
    );
}

function readStoredOnboarding(): StoredOnboardingSnapshot {
    if (typeof window === "undefined") {
        return { completed: false, stepIndex: 0, data: DEFAULT_DATA };
    }

    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return { completed: false, stepIndex: 0, data: DEFAULT_DATA };

        const parsed = JSON.parse(raw) as {
            completed?: boolean;
            stepIndex?: number;
            data?: Partial<OnboardingData>;
        };

        return {
            completed: Boolean(parsed?.completed),
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
        return { completed: false, stepIndex: 0, data: DEFAULT_DATA };
    }
}

function saveStoredOnboarding(
    completed: boolean,
    data: OnboardingData,
    stepIndex = 0,
) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ completed, stepIndex, data }),
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

function titleFromSlug(slug: string, subjects: SubjectCard[], resolveText: ResolveText) {
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

function GuideAvatar({ speaking }: { speaking: boolean }) {
    const reduceMotion = useReducedMotion();
    const { t } = useTaggedT("homeOnboarding");

    return (
        <div className="relative flex h-[78px] w-[78px] items-center justify-center sm:h-[86px] sm:w-[86px]">
            <motion.div
                className="absolute inset-2 rounded-full bg-emerald-300/18 blur-xl dark:bg-emerald-300/10"
                animate={
                    reduceMotion
                        ? undefined
                        : { scale: [1, 1.05, 1], opacity: [0.4, 0.7, 0.4] }
                }
                transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
            />

            <SparkDot className="left-2 top-3" />
            <SparkDot className="right-3 top-2" />
            <SparkDot className="bottom-3 right-2" />

            <motion.div
                className={cn(
                    "relative flex h-[64px] w-[64px] items-center justify-center rounded-[1rem] border backdrop-blur-xl sm:h-[70px] sm:w-[70px]",
                    "bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(246,248,250,0.9))] border-black/5 shadow-[0_14px_30px_-20px_rgba(0,0,0,0.28)]",
                    "dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04))] dark:border-white/10 dark:shadow-none",
                )}
                animate={
                    reduceMotion ? undefined : { y: [0, -2, 0], rotate: [0, -1, 1, 0] }
                }
                transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
            >
                <div className="absolute inset-1.5 rounded-[0.85rem] border border-black/5 dark:border-white/10" />

                <div className="relative flex flex-col items-center gap-2">
                    <div className="flex items-center gap-2.5">
                        <motion.div
                            className="h-3.5 w-3.5 rounded-full bg-neutral-900 sm:h-4 sm:w-4 dark:bg-white/90"
                            animate={
                                reduceMotion ? undefined : { scaleY: [1, 1, 0.12, 1, 1] }
                            }
                            transition={{
                                duration: 5,
                                repeat: Infinity,
                                times: [0, 0.42, 0.46, 0.5, 1],
                            }}
                            style={{ transformOrigin: "center center" }}
                        />
                        <motion.div
                            className="h-3.5 w-3.5 rounded-full bg-neutral-900 sm:h-4 sm:w-4 dark:bg-white/90"
                            animate={
                                reduceMotion ? undefined : { scaleY: [1, 1, 0.12, 1, 1] }
                            }
                            transition={{
                                duration: 5,
                                repeat: Infinity,
                                times: [0, 0.42, 0.46, 0.5, 1],
                            }}
                            style={{ transformOrigin: "center center" }}
                        />
                    </div>

                    <motion.div
                        className="h-2 rounded-full bg-neutral-900/90 dark:bg-white/85"
                        animate={
                            reduceMotion
                                ? undefined
                                : speaking
                                    ? {
                                        width: [12, 18, 10, 16, 12],
                                        borderRadius: [999, 8, 999, 8, 999],
                                    }
                                    : { width: 14 }
                        }
                        transition={{
                            duration: 1.05,
                            repeat: speaking ? Infinity : 0,
                            ease: "easeInOut",
                        }}
                    />

                    <div className="flex items-center gap-1 rounded-full border border-emerald-500/15 bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-medium text-emerald-700 dark:border-emerald-300/15 dark:bg-emerald-300/10 dark:text-emerald-200">
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
            <div
                className={cn(
                    "relative rounded-[16px] border px-3 py-2.5",
                    "bg-[linear-gradient(180deg,rgba(255,255,255,0.985),rgba(247,248,250,0.955))]",
                    "border-black/5 shadow-[0_14px_32px_-22px_rgba(0,0,0,0.24),0_6px_12px_-10px_rgba(0,0,0,0.15)]",
                    "dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.05))] dark:border-white/10 dark:shadow-none",
                )}
            >
                <div
                    className={cn(
                        "absolute top-[18px] h-2.5 w-2.5 rotate-45 bg-[linear-gradient(180deg,rgba(247,248,250,0.98),rgba(241,243,246,0.95))] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.05))]",
                        side === "right"
                            ? "-right-[5px] border-r border-t border-black/5 dark:border-white/10"
                            : "-left-[5px] border-b border-l border-black/5 dark:border-white/10",
                    )}
                />

                <p className="text-[12px] leading-5 text-neutral-700 dark:text-white/72 sm:text-[13px]">
                    {rendered}
                    <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-neutral-900/65 align-middle dark:bg-white/70" />
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
                "group flex w-full items-start justify-between gap-4 rounded-xl border px-3.5 py-3 text-left transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30",
                disabled && "cursor-not-allowed opacity-70",
                active
                    ? "border-emerald-500/30 bg-emerald-500/10 ring-1 ring-emerald-500/20 dark:border-emerald-300/20 dark:bg-emerald-300/10"
                    : "border-black/5 bg-white/70 hover:border-emerald-500/20 hover:bg-white/90 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-emerald-300/20 dark:hover:bg-white/[0.05]",
            )}
        >
            <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium text-neutral-900 dark:text-white/90">
                    {Icon ? <Icon className="size-4" /> : null}
                    <span>{label}</span>
                </div>
                {hint ? (
                    <div className="mt-1 text-xs text-neutral-500 dark:text-white/60">
                        {hint}
                    </div>
                ) : null}
            </div>

            <div
                className={cn(
                    "mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-full border transition-colors",
                    active
                        ? "border-emerald-500 bg-emerald-600 text-white dark:border-emerald-300 dark:bg-emerald-300 dark:text-black"
                        : "border-black/10 dark:border-white/15",
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
                const badge = resolve(subject.badge, { appName: APP_NAME }, t("common.featured"));
                const alt = resolve(subject.imageAlt, { appName: APP_NAME }, title);

                return (
                    <div
                        key={subject.slug}
                        className="group relative overflow-hidden rounded-2xl border border-black/5 bg-white/70 dark:border-white/10 dark:bg-white/[0.04]"
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
                                <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(16,185,129,0.18),rgba(59,130,246,0.14))]" />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />
                            <div className="absolute inset-x-0 bottom-0 p-3">
                                <div className="inline-flex rounded-full border border-white/15 bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-md">
                                    {badge}
                                </div>
                                <div className="mt-1 text-sm font-semibold text-white">
                                    {title}
                                </div>
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
                            "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                            active
                                ? "border-emerald-500/30 bg-emerald-500/10 text-neutral-900 dark:border-emerald-300/20 dark:bg-emerald-300/10 dark:text-white"
                                : "border-black/5 bg-white/70 text-neutral-700 hover:border-emerald-500/20 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/75",
                        )}
                    >
                        {title}
                    </button>
                );
            })}
        </div>
    );
}

function OnboardingPanel({
                             data,
                             setData,
                             onSkip,
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
    onSkip: () => void;
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
        saveStoredOnboarding(false, data, stepIndex);
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
        saveStoredOnboarding(false, next, stepIndex);

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
        saveStoredOnboarding(false, data, nextStepIndex);
    };

    const handleBack = () => {
        if (busy) return;
        const nextStepIndex = Math.max(0, stepIndex - 1);
        setStepIndex(nextStepIndex);
        saveStoredOnboarding(false, data, nextStepIndex);
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

            <Surface className="mx-auto max-w-[520px] p-0">
                <CardContent className="p-4">
                    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                            <div className="text-sm font-semibold text-neutral-900 dark:text-white/90">
                                {t("panel.title")}
                            </div>
                            <div className="mt-1 text-sm leading-5.5 text-neutral-500 dark:text-white/60">
                                {t("panel.description")}
                            </div>
                        </div>

                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onSkip}
                            disabled={busy}
                            className="h-8 w-full text-sm sm:w-auto dark:hover:bg-white/10"
                        >
                            {t("panel.skip")}
                        </Button>
                    </div>

                    <div className="mt-4 space-y-2">
                        <Progress value={progress} className="h-1.5" />
                        <div className="text-[11px] text-neutral-500 dark:text-white/55">
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
                        <Button
                            variant="ghost"
                            onClick={handleBack}
                            disabled={stepIndex === 0 || busy}
                            className="h-8 w-full text-sm sm:w-auto dark:hover:bg-white/10"
                        >
                            {t("panel.back")}
                        </Button>

                        <Button
                            onClick={handleContinue}
                            disabled={!canContinue || busy}
                            className="h-8 w-full gap-1.5 text-sm sm:w-auto"
                        >
                            {stepIndex === total - 1 ? t("panel.finish") : t("panel.continue")}
                            <ChevronRight className="size-3.5" />
                        </Button>
                    </div>
                </CardContent>
            </Surface>
        </div>
    );
}

function PersonalizedHighlights({ data }: { data: OnboardingData }) {
    const { t, resolve } = useTaggedT("homeOnboarding");

    const cards = useMemo<readonly HighlightCard[]>(
        () =>
            TAGGED_HIGHLIGHT_CARDS.map((card) => ({
                key: card.key,
                icon: card.icon,
                title: resolve(card.title, { appName: APP_NAME }, card.title),
                text: resolve(card.text, { appName: APP_NAME }, card.text),
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
                    <Surface key={card.key} className="p-0">
                        <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                                <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/10 p-2 text-emerald-700 dark:border-emerald-300/15 dark:bg-emerald-300/10 dark:text-emerald-200">
                                    <Icon className="size-4" />
                                </div>

                                <div className="min-w-0">
                                    <div className="text-sm text-neutral-500 dark:text-white/55">
                                        {card.title}
                                    </div>
                                    <div className="mt-1 font-semibold text-neutral-900 dark:text-white/90">
                                        {value}
                                    </div>
                                </div>
                            </div>

                            <p className="mt-3 text-sm leading-6 text-neutral-600 dark:text-white/65">
                                {card.text}
                            </p>
                        </CardContent>
                    </Surface>
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
                const badge = resolve(subject.badge, { appName: APP_NAME }, t("common.featured"));
                const alt = resolve(subject.imageAlt, { appName: APP_NAME }, title);

                return (
                    <Link
                        key={subject.slug}
                        href={`/${encodeURIComponent(locale)}/subjects/${subject.slug}/modules`}
                        className="group block"
                    >
                        <motion.div whileHover={reduceMotion ? undefined : { y: -3 }}>
                            <Surface className="h-full overflow-hidden p-0 transition-colors group-hover:border-emerald-500/20 dark:group-hover:border-emerald-300/20">
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
                                        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(16,185,129,0.18),rgba(59,130,246,0.14))]" />
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />
                                    <div className="absolute left-3 top-3 rounded-full border border-white/15 bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-md">
                                        {badge}
                                    </div>
                                </div>

                                <CardContent className="flex h-full flex-col p-4">
                                    <div className="text-base font-semibold text-neutral-900 dark:text-white/90">
                                        {title}
                                    </div>

                                    <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-white/65">
                                        {description}
                                    </p>

                                    <div className="mt-5 flex items-center gap-2 text-sm font-medium text-neutral-900 dark:text-white/90">
                                        {t("recommended.exploreSubject")}
                                        <ChevronRight className="size-4" />
                                    </div>
                                </CardContent>
                            </Surface>
                        </motion.div>
                    </Link>
                );
            })}
        </div>
    );
}

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

    const [trialBusy, setTrialBusy] = useState(false);
    const [trialErr, setTrialErr] = useState<string | null>(null);
    const [pendingLocaleSwitch, setPendingLocaleSwitch] = useState<null | {
        locale: string;
        label: string;
    }>(null);
    const [skipped, setSkipped] = useState(false);

    const redirectingRef = useRef(false);

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

    useEffect(() => {
        const stored = readStoredOnboarding();
        setOnboardingData(stored.data);
        setCompleted(stored.completed);
        setResumeStepIndex(stored.stepIndex);

        const dismissed =
            typeof window !== "undefined" &&
            window.localStorage.getItem(DISMISSED_KEY) === "1";

        const shouldAutoOpen =
            !isAuthenticated && !stored.completed && !dismissed;

        setSkipped(dismissed);
        setShowOnboarding(shouldAutoOpen);
        setBubbleCollapsed(Boolean(stored.completed || dismissed || isAuthenticated));
        setHydrated(true);
    }, [isAuthenticated]);

    // useEffect(() => {
    //     if (!hydrated) return;
    //     if (!onboardingData.themePreference) return;
    //     applyThemeChoice(onboardingData.themePreference);
    // }, [hydrated, onboardingData.themePreference, applyThemeChoice]);

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
            router.replace(pathname as any, { locale: pendingLocaleSwitch.locale as any });
        }, 220);

        return () => window.clearTimeout(timer);
    }, [pendingLocaleSwitch, router, pathname]);

    const selectedTrialSubjects = useMemo(() => {
        const selected = new Set(onboardingData.learningInterests);
        return subjects.filter((s) => selected.has(s.slug));
    }, [subjects, onboardingData.learningInterests]);

    const welcomeText = useMemo(
        () => buildWelcomeMessage(onboardingData, completed, subjects, t, resolve, locale),
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

            setOnboardingData(nextData);
            setResumeStepIndex(stepIndex);
            saveStoredOnboarding(false, nextData, stepIndex);

            setPendingLocaleSwitch({
                locale: nextLocale,
                label: mapLanguageLabel(nextData.preferredLanguage, t),
            });
        },
        [locale, t],
    );

    const TRIAL_LAST_SESSION_KEY = "zoeskoul.trial.lastSessionId";

    const beginTrial = async (opts?: { subject?: string | null; level?: string | null }) => {
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

            const href =
                buildTrialHref({
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
            trialSubjectSlug ??
            data.learningInterests[0] ??
            null;

        setTrialErr(null);
        setSkipped(false);

        if (data.preferredLanguage) {
            persistLocale(nextLocale);
        }

        if (data.themePreference) {
            applyThemeChoice(data.themePreference);
        }

        saveStoredOnboarding(true, data, 0);
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

    const handleSkip = async () => {
        setShowOnboarding(false);
        setBubbleCollapsed(true);
        setResumeStepIndex(0);
        setSkipped(true);

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

    const reopenAssistant = () => {
        setShowOnboarding(true);
        setBubbleCollapsed(false);
        setPendingLocaleSwitch(null);
        setSkipped(false);

        if (typeof window !== "undefined") {
            window.localStorage.removeItem(DISMISSED_KEY);
        }
    };

    useEffect(() => {
        if (!hydrated) return;
        if (completed) saveStoredOnboarding(true, onboardingData, 0);
    }, [hydrated, completed, onboardingData]);

    const showOnboardingGate = hydrated && showOnboarding;

// show header/footer whenever the onboarding gate is not open
    const showChrome = hydrated && !showOnboarding;

// allow reopen/edit later after complete or skip
    const showFloatingAssistant =
        hydrated &&
        !isAuthenticated &&
        !showOnboarding &&
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

            <main
                className={cn(
                    "relative min-h-screen overflow-hidden pb-24 text-neutral-900 dark:text-white/90 sm:pb-28",
                    "bg-[radial-gradient(1000px_500px_at_0%_0%,rgba(16,185,129,0.14),transparent_60%),radial-gradient(1000px_500px_at_100%_0%,rgba(59,130,246,0.10),transparent_58%),linear-gradient(180deg,#f8fffb_0%,#ffffff_40%,#f7f8ff_100%)]",
                    "dark:bg-[radial-gradient(1000px_500px_at_0%_0%,rgba(16,185,129,0.12),transparent_55%),radial-gradient(1000px_500px_at_100%_0%,rgba(59,130,246,0.10),transparent_55%),linear-gradient(180deg,#0c1018_0%,#0b0d12_45%,#0b0d12_100%)]",
                )}
            >
                <div
                    className="pointer-events-none absolute -top-20 left-[-10%] h-64 w-64 rounded-full bg-emerald-300/25 blur-3xl dark:bg-emerald-300/10"
                    aria-hidden
                />
                <div
                    className="pointer-events-none absolute right-[-8%] top-10 h-72 w-72 rounded-full bg-sky-300/20 blur-3xl dark:bg-sky-300/10"
                    aria-hidden
                />

                <section className="relative overflow-hidden">
                    <div className="ui-container relative py-6 sm:py-8 lg:py-10">
                        <AnimatePresence mode="wait">
                            {showOnboardingGate ? (
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

                                            <h1 className="mt-2 text-[26px] font-black tracking-tight sm:text-[34px]">
                                                {t("gate.title", { appName: APP_NAME })}
                                            </h1>

                                            <p className="mt-3 text-sm leading-6 text-neutral-600 dark:text-white/70">
                                                {t("gate.description", { appName: APP_NAME })}
                                            </p>
                                        </div>

                                        <div className="mt-6">
                                            <OnboardingPanel
                                                data={onboardingData}
                                                setData={setOnboardingData}
                                                onSkip={handleSkip}
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
                            ) : (
                                <motion.div
                                    key="full-home"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ duration: 0.32 }}
                                    className="grid gap-4 lg:gap-6"
                                >
                                    <Surface>
                                        <div className="grid items-center gap-8 xl:grid-cols-[minmax(0,1.05fr)_minmax(220px,0.95fr)] xl:gap-10">
                                            <div className="order-2 min-w-0 xl:order-1">
                                                <SectionKicker>{t("hero.kicker")}</SectionKicker>

                                                <motion.h1
                                                    initial={{ opacity: 0, y: 14 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ duration: 0.5 }}
                                                    className="mt-2 max-w-4xl text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl"
                                                >
                                                    {t("hero.title", { appName: APP_NAME })}
                                                </motion.h1>

                                                <motion.p
                                                    initial={{ opacity: 0, y: 14 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ delay: 0.08, duration: 0.5 }}
                                                    className="mt-3 max-w-3xl text-sm leading-6 text-neutral-600 dark:text-white/70 sm:text-[15px] sm:leading-7"
                                                >
                                                    {completed
                                                        ? welcomeText
                                                        : t("hero.descriptionFresh", { appName: APP_NAME })}
                                                </motion.p>

                                                {completed && !isAuthenticated && selectedTrialSubjects.length > 0 ? (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: 14 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        transition={{ delay: 0.12, duration: 0.5 }}
                                                        className="mt-5 space-y-2"
                                                    >
                                                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500 dark:text-white/50">
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
                                                            <Button size="lg" className="gap-2 sm:w-auto" asChild>
                                                                <Link
                                                                    href={
                                                                        trialSubjectSlug
                                                                            ? `/${encodeURIComponent(locale)}/subjects/${encodeURIComponent(trialSubjectSlug)}/modules`
                                                                            : `/${encodeURIComponent(locale)}/subjects`
                                                                    }
                                                                >
                                                                    {t("hero.continueLearning")}
                                                                    <ArrowRight className="size-4" />
                                                                </Link>
                                                            </Button>
                                                        ) : (
                                                            <Button
                                                                size="lg"
                                                                className="gap-2 sm:w-auto"
                                                                onClick={handleStartTrial}
                                                                disabled={!canStartTrial || trialBusy}
                                                            >
                                                                {trialBusy ? t("hero.startingTrial") : t("hero.try3Questions")}
                                                                <ArrowRight className="size-4" />
                                                            </Button>
                                                        )
                                                    ) : isAuthenticated ? (
                                                        <Button size="lg" className="gap-2 sm:w-auto" asChild>
                                                            <Link href={`/${encodeURIComponent(locale)}/subjects`}>
                                                                {t("hero.continueLearning")}
                                                                <ArrowRight className="size-4" />
                                                            </Link>
                                                        </Button>
                                                    ) : (
                                                        <Button
                                                            size="lg"
                                                            className="gap-2 sm:w-auto"
                                                            onClick={reopenAssistant}
                                                        >
                                                            {t("hero.openGuide")}
                                                            <ArrowRight className="size-4" />
                                                        </Button>
                                                    )}

                                                    <Button size="lg" variant="outline" className="sm:w-auto" asChild>
                                                        <Link
                                                            href={

                                                                    `/${encodeURIComponent(locale)}/subjects`
                                                            }
                                                        >
                                                            {t("hero.exploreSubjects")}
                                                        </Link>
                                                    </Button>

                                                    <Button
                                                        size="lg"
                                                        variant="outline"
                                                        onClick={reopenAssistant}
                                                        className="sm:w-auto dark:bg-white/[0.05] dark:hover:bg-white/[0.08]"
                                                    >
                                                        {completed || skipped || isAuthenticated
                                                            ? t("hero.editPreferences")
                                                            : t("hero.editAnswers")}
                                                    </Button>
                                                </motion.div>

                                                {trialErr ? (
                                                    <div className="mt-3 text-sm text-rose-700 dark:text-rose-200/80">
                                                        {trialErr}
                                                    </div>
                                                ) : null}

                                                {completed ? (
                                                    <div className="mt-4 text-xs text-neutral-500 dark:text-white/55">
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

                                                        <Surface className="p-0">
                                                            <CardContent className="p-4">
                                                                <div className="flex flex-col gap-3">
                                                                    <div className="min-w-0">
                                                                        <div className="text-sm font-semibold text-neutral-900 dark:text-white/90">
                                                                            {completed
                                                                                ? t("guideCard.personalized")
                                                                                : t("guideCard.ready")}
                                                                        </div>
                                                                        <p className="mt-1 text-sm leading-6 text-neutral-600 dark:text-white/65">
                                                                            {interestSummary}
                                                                        </p>
                                                                    </div>

                                                                    {completed ? (
                                                                        isAuthenticated ? (
                                                                            <Button size="sm" asChild className="w-full">
                                                                                <Link
                                                                                    href={
                                                                                        trialSubjectSlug
                                                                                            ? `/${encodeURIComponent(locale)}/subjects/${encodeURIComponent(trialSubjectSlug)}/modules`
                                                                                            : `/${encodeURIComponent(locale)}/subjects`
                                                                                    }
                                                                                >
                                                                                    {t("hero.continueLearning")}
                                                                                </Link>
                                                                            </Button>
                                                                        ) : (
                                                                            <div className="flex flex-col gap-2">
                                                                                <Button
                                                                                    size="sm"
                                                                                    onClick={handleStartTrial}
                                                                                    disabled={!canStartTrial || trialBusy}
                                                                                    className="w-full"
                                                                                >
                                                                                    {trialBusy ? t("hero.startingTrial") : t("hero.try3Questions")}
                                                                                </Button>

                                                                                <Button
                                                                                    variant="ghost"
                                                                                    size="sm"
                                                                                    onClick={reopenAssistant}
                                                                                    className="w-full dark:hover:bg-white/10"
                                                                                >
                                                                                    {t("guideCard.updatePreferences")}
                                                                                </Button>
                                                                            </div>
                                                                        )
                                                                    ) : isAuthenticated ? (
                                                                        <Button size="sm" asChild className="w-full">
                                                                            <Link href={`/${encodeURIComponent(locale)}/subjects`}>
                                                                                {t("hero.continueLearning")}
                                                                            </Link>
                                                                        </Button>
                                                                    ) : (
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            onClick={reopenAssistant}
                                                                            className="w-full dark:hover:bg-white/10"
                                                                        >
                                                                            {t("guideCard.start")}
                                                                        </Button>
                                                                    )}
                                                                </div>
                                                            </CardContent>
                                                        </Surface>
                                                    </div>
                                                </motion.div>
                                            </div>
                                        </div>
                                    </Surface>

                                    <Surface>
                                        <div className="max-w-2xl">
                                            <SectionKicker>{t("highlights.kicker")}</SectionKicker>
                                            <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
                                                {t("highlights.title")}
                                            </h2>
                                            <p className="mt-3 text-sm leading-6 text-neutral-600 dark:text-white/70 sm:text-[15px] sm:leading-7">
                                                {t("highlights.description", { appName: APP_NAME })}
                                            </p>
                                        </div>

                                        <div className="mt-6">
                                            <PersonalizedHighlights data={onboardingData} />
                                        </div>
                                    </Surface>

                                    <Surface>
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                                            <div>
                                                <SectionKicker>{t("recommended.kicker")}</SectionKicker>
                                                <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
                                                    {t("recommended.title")}
                                                </h2>
                                            </div>

                                            <Link
                                                href={`/${encodeURIComponent(locale)}/subjects`}
                                                className="inline-flex items-center gap-2 text-sm font-extrabold text-neutral-900 transition-opacity hover:opacity-70 dark:text-white/90"
                                            >
                                                {t("recommended.viewAll")}
                                                <ChevronRight className="size-4" />
                                            </Link>
                                        </div>

                                        <div className="mt-6">
                                            <SubjectGrid data={onboardingData} subjects={subjects} locale={locale} />
                                        </div>
                                    </Surface>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </section>

                {showFloatingAssistant ? (
                    <div className="fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6">
                        <motion.button
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={reduceMotion ? undefined : { y: -2 }}
                            type="button"
                            onClick={reopenAssistant}
                            className={cn(
                                "flex items-center gap-3 rounded-full border px-3 py-3 sm:px-4",
                                "border-black/5 bg-white/88 shadow-[0_20px_60px_-28px_rgba(0,0,0,0.28)] backdrop-blur-xl",
                                "dark:border-white/10 dark:bg-white/[0.06] dark:shadow-none",
                            )}
                        >
                            <div className="flex size-9 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-700 dark:bg-emerald-300/10 dark:text-emerald-200">
                                <MessageCircleMore className="size-4" />
                            </div>

                            <div className="hidden text-left sm:block">
                                <div className="text-sm font-medium text-neutral-900 dark:text-white/90">
                                    {t("floatingAssistant.title")}
                                </div>
                                <div className="text-xs text-neutral-500 dark:text-white/55">
                                    {t("floatingAssistant.subtitle")}
                                </div>
                            </div>
                        </motion.button>
                    </div>
                ) : null}
            </main>

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
