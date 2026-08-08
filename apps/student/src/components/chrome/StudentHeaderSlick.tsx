"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  HeaderChrome,
  ThemeToggle,
} from "@zoeskoul/learner-ui";
import { createPortal } from "react-dom";
import {
  useStudentSession,
  type StudentSession,
  } from "../../app/studentSession";
import {
  ROUTES,
  getLocalAppOrigin,
} from "@zoeskoul/app-config";
import StudentUserMenuSlick from "@student/components/chrome/StudentUserMenuSlick";
import {
  buildStudentLogoutUrl,
} from "../../app/studentLogout";
import {
  normalizeFontSizePx,
  type AppFontSizePx,
} from "@zoeskoul/preferences";
import {
  useAppPreferences,
} from "@zoeskoul/preferences/react";

import { useTranslations, useLocale } from "next-intl";
import { Link, usePathname } from "@student/i18n/navigation";
import StudentLocaleSwitcher from "@student/components/chrome/StudentLocaleSwitcher";
import { BookOpen, Dumbbell, Settings } from "lucide-react";
import { cn } from "@zoeskoul/learner-ui/lib/cn";
import Badge from "@/components/billing/Badge";
import { useBillingStatus } from "@/components/billing/hooks/useBillingStatus";
import SoundToggle from "@/lib/sfx/SoundToggle";
import {useAuthHref} from "@student/hooks/useAuthHref";
import { startGlobalNavigationPending } from "@/components/navigation/GlobalNavigationProgress";
import LearningEntryButton from "@/components/learning/LearningEntryButton";
import PracticeEntryButton from "@/components/practice/PracticeEntryButton";
import NavButton from "@/components/ui/NavButton";

type NavItem = { href: string; label: string };
type SessionStatus = "loading" | "authenticated" | "unauthenticated";
type HeaderSlotCtx = {
  locale: string;
  pathname: string;
  isAuthed: boolean;
  status: SessionStatus;
  user?: StudentSession["user"];
};

function hardLogout(
  locale: string,
  websiteOrigin: string,
) {
  startGlobalNavigationPending({
    label: "Logging out…",
    description: "Closing your session securely.",
    source: "logout",
    minVisibleMs: 700,
  });

  window.location.assign(
    buildStudentLogoutUrl({
      websiteOrigin,
      locale,
    }),
  );
}

const START_SESSION_HREF = "/sandbox";

function clampFontPx(x: number) {
  return normalizeFontSizePx(x);
}

function applyBaseFontSize(px: number) {
  if (typeof document === "undefined") return;

  const next = clampFontPx(px);
  document.documentElement.style.setProperty("--app-font-size", `${next}px`);
}

function FontSizePicker(props: {
  value: number;
  onChange: (px: number) => void;
  labels: { small: string; normal: string; large: string; extraLarge: string};
}) {
  const { value, onChange, labels } = props;

  const items: Array<{ px: AppFontSizePx; label: string }> = [
    { px: 14, label: labels.small },
      { px: 16, label: labels.normal },
    { px: 20, label: labels.large },
    { px: 24, label: labels.extraLarge },
  ];

  return (
      <div
          role="radiogroup"
          aria-label="Font size"
          className="grid w-full grid-cols-4 gap-1 rounded-lg border border-neutral-200 bg-white p-1 dark:border-white/10 dark:bg-white/[0.04]"
      >
        {items.map((it) => {
          const active = it.px === value;

          return (
              <button
                  key={it.px}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChange(it.px)}
                  className={cn(
                      "rounded-md px-2 py-2 text-[11px] font-medium transition-colors",
                      "focus:outline-none focus:ring-2 focus:ring-neutral-400/30 dark:focus:ring-white/20",
                      active
                          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                          : "text-neutral-700 hover:bg-neutral-100 dark:text-white/70 dark:hover:bg-white/[0.08]",
                  )}
              >
                {it.label}
              </button>
          );
        })}
      </div>
  );
}

export function SettingsMenu({
  showSound = true,
}: {
  showSound?: boolean;
}) {
  const t = useTranslations("Header");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = useState({
    top: 68,
    right: 12,
    desktop: false,
  });
  const { preferences, updatePreferences } = useAppPreferences();
  const fontPx = preferences.fontSizePx;

  React.useLayoutEffect(() => {
    applyBaseFontSize(fontPx);
  }, [fontPx]);

  React.useLayoutEffect(() => {
    if (!open) return;

    const updateMenuPosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;

      const desktop = window.matchMedia("(min-width: 768px)").matches;
      setMenuPosition({
        top: Math.max(12, rect.bottom + 8),
        right: Math.max(12, window.innerWidth - rect.right),
        desktop,
      });
    };

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-modal-root="true"]')) return;
      if (!target) return;
      if (wrapRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const menu = open && typeof document !== "undefined"
    ? createPortal(
        <>
          <div
              className="fixed inset-0 z-[9998] bg-black/20 md:hidden"
              onClick={() => setOpen(false)}
              aria-hidden="true"
          />

          <div
              ref={panelRef}
              role="menu"
              className={cn(
                  "fixed z-[9999] overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-white/10 dark:bg-neutral-950",
                  menuPosition.desktop
                      ? "w-[24rem]"
                      : "left-3 right-3",
              )}
              style={{
                top: menuPosition.top,
                right: menuPosition.desktop ? menuPosition.right : undefined,
                maxHeight: `calc(100dvh - ${menuPosition.top + 12}px)`,
              }}
          >
            <div className="border-b border-neutral-200 px-4 py-3 dark:border-white/10">
              <div className="text-sm font-semibold text-neutral-900 dark:text-white">
                {t("settings")}
              </div>
              <div className="mt-0.5 text-xs text-neutral-600 dark:text-white/60">
                {t("settingsSubtitle")}
              </div>
            </div>

            <div className="grid gap-3 p-3">
              <div className="ui-surface-muted p-3">
                <div className="ui-kicker">{t("theme")}</div>
                <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="text-xs text-neutral-600 dark:text-white/60">
                    {t("themeHint")}
                  </div>
                  <div className="shrink-0">
                    <ThemeToggle compact />
                  </div>
                </div>
              </div>

              <div className="ui-surface-muted p-3">
                <div className="ui-kicker">{t("fontSize")}</div>
                <div className="mt-2 text-xs text-neutral-600 dark:text-white/60">
                  {t("fontSizeHint")}
                </div>
                <div className="mt-3">
                  <FontSizePicker
                      value={fontPx}
                      onChange={(px) => {
                        void updatePreferences({
                          fontSizePx: clampFontPx(px),
                        }).catch(() => undefined);
                      }}
                      labels={{
                        small: t("fontSmall"),
                        normal: t("fontNormal"),
                        large: t("fontLarge"),
                        extraLarge:t("fontExtraLarge")
                      }}
                  />
                </div>
              </div>

              <div className="ui-surface-muted p-3">
                <div className="ui-kicker">{t("language")}</div>
                <div className="mt-3">
                  <StudentLocaleSwitcher compact className="w-full min-w-0" />
                </div>
              </div>

              {showSound ? (
                <div className="ui-surface-muted p-3">
                  <div className="ui-kicker">{t("sound")}</div>
                  <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="text-xs text-neutral-600 dark:text-white/60">
                      {t("soundHint")}
                    </div>
                    <div className="shrink-0">
                      <SoundToggle />
                    </div>
                  </div>
                </div>
              ) : null}

              <button type="button" onClick={() => setOpen(false)} className="ui-btn-secondary w-full">
                {t("close")}
              </button>
            </div>
          </div>
        </>,
        document.body,
      )
    : null;

  return (
      <div ref={wrapRef} className="relative">
        <button
            ref={buttonRef}
            type="button"
            className="ui-btn-ide-ghost !w-8 !px-0"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={t("openSettings")}
            onClick={() => setOpen((v) => !v)}
        >
          <Settings className="h-4 w-4" />
        </button>

        {menu}
      </div>
  );
}

export default function StudentHeaderSlick({
                                      brand = "Learnoir",
                                      badge = "BETA",
                                      isNav = true,
                                      isUser = true,
                                      isSetting = true,
                                      isBillingStatus = true,
                                      websiteOrigin =
                                        import.meta.env.VITE_WEBSITE_ORIGIN ??
                                        getLocalAppOrigin("website"),
                                      slot,
                                      SlotComponent,
                                    }: {
  brand?: string;
  badge?: string;
  isBillingStatus?: boolean;
  isNav?: boolean;
  isUser?: boolean;
  isSetting?: boolean;
  websiteOrigin?: string;
  slot?: React.ReactNode;
  SlotComponent?: React.ComponentType<HeaderSlotCtx>;
}) {
  const t = useTranslations("Header");
  const locale = useLocale();
  const pathname = usePathname();
  const { data: session, status } = useStudentSession();

  const user = session?.user;
  const isAuthed = !!user;

  const slotCtx = useMemo<HeaderSlotCtx>(
      () => ({ locale, pathname, isAuthed, status, user }),
      [locale, pathname, isAuthed, status, user],
  );

  const slotNode = SlotComponent ? <SlotComponent {...slotCtx} /> : slot ?? null;

  const NAV: NavItem[] = useMemo(
      () => [
        { href: ROUTES.home, label: t("home") },
        { href: ROUTES.catalogs, label: t("catalogs") },
        { href: ROUTES.myLearning, label: t("myLearning") },
        { href: ROUTES.pricing, label: t("billing") },
        { href: START_SESSION_HREF, label: t("startSession") },
      ],
      [t],
  );

  const [open, setOpen] = useState(false);
  const [elevated, setElevated] = useState(false);

  useEffect(() => {
    const onScroll = () => setElevated(window.scrollY > 6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  const { headlineBadge } = useBillingStatus();

  const authHref = useAuthHref();
  const navLinkClass = (active: boolean) =>
      cn(
          active ? "ui-btn-ide-active" : "ui-btn-ide-ghost",
          "h-8",
      );

  const mobileItem = (isActive: boolean) =>
      cn(
          "flex h-10 items-center rounded-md px-3 text-sm font-medium transition-colors",
          isActive
              ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
              : "text-neutral-700 hover:bg-neutral-100 dark:text-white/75 dark:hover:bg-white/[0.08]",
      );

  const brandGroup = (
      <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
        <Link href="/" className="group flex min-w-0 items-center gap-2.5">
          <div className="ui-icon-box h-9 w-9 rounded-lg">
          <span className="text-sm font-semibold text-neutral-900 dark:text-white/90">
            L
          </span>
          </div>

          <div className="min-w-0 leading-tight">
            <div className="flex min-w-0 items-center gap-2">
            <span
                className="min-w-0 truncate text-sm font-semibold tracking-tight text-neutral-900 dark:text-white/90"
                title={brand}
            >
              {brand}
            </span>

              <span className="hidden ui-pill-neutral sm:inline-flex">{badge}</span>
            </div>

            <div className="hidden truncate text-[11px] text-neutral-500 dark:text-white/55 sm:block">
              {t("tagline")}
            </div>
          </div>
        </Link>

        {headlineBadge && isBillingStatus ? (
            <div className="hidden md:block">
              {headlineBadge.href ? (
                  <Link
                      href={headlineBadge.href}
                      aria-label={headlineBadge.text}
                      className="inline-flex rounded-full focus:outline-none focus:ring-2 focus:ring-emerald-400/35"
                  >
                    <Badge tone={headlineBadge.tone} className="cursor-pointer whitespace-nowrap">
                      {headlineBadge.text}
                    </Badge>
                  </Link>
              ) : (
                  <Badge tone={headlineBadge.tone}>{headlineBadge.text}</Badge>
              )}
            </div>
        ) : null}
      </div>
  );

  const topRowActions = (
      <>
        <nav className="ml-auto hidden shrink-0 items-center gap-2 lg:flex">
          {isNav ? (
              <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-white/80 p-1 dark:border-white/10 dark:bg-white/[0.04]">
                {NAV.map((n) => {
                  const isActive =
                      n.href === "/" ? pathname === "/" : pathname?.startsWith(n.href);

                  return (
                      <Link key={n.href} href={n.href} className={navLinkClass(Boolean(isActive))}>
                        {n.label}
                      </Link>
                  );
                })}
              </div>
          ) : null}

          {isNav ? (
              <LearningEntryButton
                  isAuthenticated={isAuthed}
                  continueLabel={t("continueLesson")}
                  startLabel={t("startLearning")}
                  guestLabel={t("exploreLessons")}
                  loadingText={t("learningOpening")}
                  disabled={status === "loading"}
                  icon={<BookOpen className="h-4 w-4 shrink-0" />}
                  className="ui-btn-primary h-8 whitespace-nowrap"
              />
          ) : null}

          {isNav ? (
              <PracticeEntryButton
                  isAuthenticated={isAuthed}
                  authenticatedLabel={t("practice")}
                  guestLabel={t("practice")}
                  loadingText={t("practiceOpening")}
                  disabled={status === "loading"}
                  icon={<Dumbbell className="h-4 w-4 shrink-0" />}
                  className="ui-btn-info-secondary h-8 whitespace-nowrap"
              />
          ) : null}


          {isSetting ? <SettingsMenu /> : null}

          {isUser && status !== "loading"
              ? isAuthed ? (
                  <StudentUserMenuSlick
                      name={user?.name ?? "User"}
                      email={user?.email}
                      image={user?.image}
                      profileHref="/profile"
                      onSignOut={() => hardLogout(
                        locale,
                        websiteOrigin,
                      )}
                  />
              ) : (
                  <NavButton
                      href={authHref}
                      className="ui-btn-secondary"
                      loadingText={t("signInOpening")}
                      prefetch
                  >
                    {t("signIn")}
                  </NavButton>
              )
              : null}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2 lg:hidden">
          {isSetting ? <SettingsMenu /> : null}

          {(isNav || isUser) ? (
              <button
                  className="ui-btn-secondary"
                  onClick={() => setOpen((v) => !v)}
                  aria-expanded={open}
                  aria-label={t("toggleMenu")}
              >
                {open ? t("close") : t("menu")}
              </button>
          ) : null}
        </div>
      </>
  );

  const mobileMenu = (
      <>
        {(isNav || isUser) ? (
            <div
                className={cn(
                    "overflow-hidden transition-[max-height,opacity] duration-300 lg:hidden",
                    open ? "max-h-[520px] opacity-100" : "max-h-0 opacity-0",
                )}
            >
              <div className="pb-4">
                <div className="mt-2 grid gap-2">
                  {isNav
                      ? NAV.map((n) => {
                        const isActive =
                            n.href === "/"
                                ? pathname === "/"
                                : pathname?.startsWith(n.href);

                        return (
                            <Link key={n.href} href={n.href} className={mobileItem(Boolean(isActive))}>
                              {n.label}
                            </Link>
                        );
                      })
                      : null}

                  {isNav ? (
                      <LearningEntryButton
                          isAuthenticated={isAuthed}
                          continueLabel={t("continueLesson")}
                          startLabel={t("startLearning")}
                          guestLabel={t("exploreLessons")}
                          loadingText={t("learningOpening")}
                          disabled={status === "loading"}
                          icon={<BookOpen className="h-4 w-4 shrink-0" />}
                          className="ui-btn-primary min-h-10 w-full justify-center"
                      />
                  ) : null}

                  {isNav ? (
                      <PracticeEntryButton
                          isAuthenticated={isAuthed}
                          authenticatedLabel={t("practice")}
                          guestLabel={t("practice")}
                          loadingText={t("practiceOpening")}
                          disabled={status === "loading"}
                          icon={<Dumbbell className="h-4 w-4 shrink-0" />}
                          className="ui-btn-info-secondary min-h-10 w-full justify-center"
                      />
                  ) : null}


                  {isUser && status !== "loading"
                      ? isAuthed ? (
                          <>
                            <Link
                                href="/profile"
                                className={mobileItem(Boolean(pathname?.startsWith("/profile")))}
                            >
                              {t("profile")}
                            </Link>
                            <button
                                type="button"
                                onClick={() => hardLogout(
                                  locale,
                                  websiteOrigin,
                                )}
                                className={mobileItem(false)}
                            >
                              {t("logout")}
                            </button>
                          </>
                      ) : (
                          <NavButton
                              href={authHref}
                              className={mobileItem(false)}
                              loadingText={t("signInOpening")}
                              prefetch
                          >
                            {t("signIn")}
                          </NavButton>
                      )
                      : null}

                  {(isNav || isUser) ? (
                      <div className="mt-3 text-[11px] text-neutral-500 dark:text-white/55">
                        {t("tip")}
                      </div>
                  ) : null}
                </div>
              </div>
            </div>
        ) : null}
      </>
  );

  return (
      <HeaderChrome
          elevated={elevated}
          brandGroup={brandGroup}
          centerSlot={slotNode}
          topRowActions={topRowActions}
          mobileMenu={mobileMenu}
      />
  );
}

export function LearnHeaderSlick() {
  return (
      <StudentHeaderSlick
          isBillingStatus={false}
          brand={process.env.NEXT_PUBLIC_APP_NAME}
          badge=""
          isUser={false}
          isNav={false}
      />
  );
}
