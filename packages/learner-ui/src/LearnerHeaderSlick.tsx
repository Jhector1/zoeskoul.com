"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Dumbbell, Settings } from "lucide-react";

import {
  normalizeFontSizePx,
  type AppFontSizePx,
} from "@zoeskoul/preferences";
import {
  useAppPreferences,
} from "@zoeskoul/preferences/react";

import { HeaderChrome } from "./HeaderChrome";
import { ThemeToggle } from "./ThemeToggle";
import { ZoeSkoulLogoMark } from "./ZoeSkoulLogoMark";
import { cn } from "./lib/cn";


export type LearnerHeaderSessionStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated";

export type LearnerHeaderUser = {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export type LearnerHeaderTranslate = (
  key: string,
  values?: Record<string, unknown>,
) => string;

export type LearnerHeaderPromotion = {
  id: string;
  name: string;
  percentOff: number;
  endsAt: string;
};

export type LearnerHeaderPendingCheckout = {
  plan: string;
  useTrial: boolean;
};

export type LearnerHeaderBillingStatus = {
  isSubscribed?: boolean;
  pendingCheckout?: LearnerHeaderPendingCheckout | null;
  activePromotions?: {
    monthly?: LearnerHeaderPromotion | null;
    yearly?: LearnerHeaderPromotion | null;
  } | null;
};

export type LearnerHeaderHeadline = {
  tone: string;
  text: string;
  href?: string;
  action?: "resume_checkout";
};

export type LearnerHeaderBillingSnapshot = {
  status: LearnerHeaderBillingStatus | null;
  headlineBadge: LearnerHeaderHeadline | null;
  reload: () => void;
  setError?: (message: string | null) => void;
};

export type LearnerHeaderResumeAction =
  | {
      kind: "button";
      testId: string;
      busy: boolean;
      onActivate: () => void;
    }
  | {
      kind: "link";
      testId: string;
      href: string;
    };

export type LearnerHeaderRuntime = {
  appName: string;
  routes: {
    home: string;
    catalogs: string;
    myLearning: string;
    pricing: string;
  };
  authenticatedNavIsExternal: boolean;
  defaultWebsiteOrigin?: string;

  Link: React.ElementType;
  UserMenu: React.ElementType;
  LocaleSwitcher: React.ElementType;
  Badge: React.ElementType;
  BillingPromotionCountdown: React.ElementType;
  SoundToggle: React.ElementType;
  LearningEntryButton: React.ElementType;
  PracticeEntryButton: React.ElementType;
  NavButton: React.ElementType;

  createPortal: (
    children: React.ReactNode,
    container: Element | DocumentFragment,
  ) => React.ReactNode;

  useTranslations: (
    namespace: "Header" | "billing",
  ) => LearnerHeaderTranslate;
  useLocale: () => string;
  useSession: () => {
    data?: {
      user?: LearnerHeaderUser;
    } | null;
    status: LearnerHeaderSessionStatus;
  };
  usePathname: () => string;
  useAuthHref: () => unknown;
  useBillingStatus: () => LearnerHeaderBillingSnapshot;

  buildAuthenticatedAppHref: (args: {
    pathname: string;
    locale: string;
  }) => string;

  hardLogout: (args: {
    locale: string;
    websiteOrigin?: string;
  }) => void;

  useResumeCheckout: (args: {
    billingStatus: LearnerHeaderBillingStatus | null;
    callbackUrl: string;
    websiteOrigin?: string;
    setBillingError?: (message: string | null) => void;
  }) => LearnerHeaderResumeAction | null;
};


type NavItem = {
  href: string;
  label: string;
  external?: boolean;
};
type SessionStatus = LearnerHeaderSessionStatus;
type HeaderSlotCtx = {
  locale: string;
  pathname: string;
  isAuthed: boolean;
  status: SessionStatus;
  user?: LearnerHeaderUser;
};

export function createLearnerHeader(
  runtime: LearnerHeaderRuntime,
) {
  const Link = runtime.Link;
  const UserMenuSlick = runtime.UserMenu;
  const LocaleSwitcher = runtime.LocaleSwitcher;
  const Badge = runtime.Badge;
  const BillingPromotionCountdown = runtime.BillingPromotionCountdown;
  const SoundToggle = runtime.SoundToggle;
  const LearningEntryButton = runtime.LearningEntryButton;
  const PracticeEntryButton = runtime.PracticeEntryButton;
  const NavButton = runtime.NavButton;
  const createPortal = runtime.createPortal;
  const useTranslations = runtime.useTranslations;
  const useLocale = runtime.useLocale;
  const useSession = runtime.useSession;
  const usePathname = runtime.usePathname;
  const useAuthHref = runtime.useAuthHref;
  const useBillingStatus = runtime.useBillingStatus;
  const buildStudentAppHref = runtime.buildAuthenticatedAppHref;
  const ROUTES = runtime.routes;

function HeaderDestinationLink(props: {
  href: string;
  external?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  if (props.external) {
    return (
      <a href={props.href} className={props.className}>
        {props.children}
      </a>
    );
  }

  return (
    <Link
      href={props.href as never}
      className={props.className}
    >
      {props.children}
    </Link>
  );
}

function hardLogout(
  locale: string,
  websiteOrigin?: string,
) {
  runtime.hardLogout({
    locale,
    websiteOrigin,
  });
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

function SettingsMenu({
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
                  <LocaleSwitcher compact className="w-full min-w-0" />
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

function HeaderSlick({
                                      brand = "ZoeSkoul",
                                      badge = "BETA",
                                      isNav = true,
                                      isUser = true,
                                      isSetting = true,
                                      isBillingStatus = true,
                                      websiteOrigin = runtime.defaultWebsiteOrigin,
                                      slot,
                                      SlotComponent,
                                    }: {
  brand?: string;
  badge?: string;
  isBillingStatus?: boolean;
  websiteOrigin?: string;
  isNav?: boolean;
  isUser?: boolean;
  isSetting?: boolean;
  slot?: React.ReactNode;
  SlotComponent?: React.ComponentType<HeaderSlotCtx>;
}) {
  const t = useTranslations("Header");
  const billingT = useTranslations("billing");
  const locale = useLocale();
  const pathname = usePathname();
  const { data: session, status } = useSession();

  const user = session?.user;
  const isAuthed = !!user;

  const slotCtx = useMemo<HeaderSlotCtx>(
      () => ({ locale, pathname, isAuthed, status, user }),
      [locale, pathname, isAuthed, status, user],
  );

  const slotNode = SlotComponent ? <SlotComponent {...slotCtx} /> : slot ?? null;

  const studentHomeHref = buildStudentAppHref({
    pathname: "/",
    locale,
  });

  const NAV: NavItem[] = useMemo(
      () => [
        {
          href: isAuthed
            ? studentHomeHref
            : ROUTES.home,
          label: t("home"),
          external: runtime.authenticatedNavIsExternal && isAuthed,
        },
        {
          href: isAuthed
            ? buildStudentAppHref({
                pathname: ROUTES.catalogs,
                locale,
              })
            : ROUTES.catalogs,
          label: t("catalogs"),
          external: runtime.authenticatedNavIsExternal && isAuthed,
        },
        {
          href: isAuthed
            ? buildStudentAppHref({
                pathname: ROUTES.myLearning,
                locale,
              })
            : ROUTES.myLearning,
          label: t("myLearning"),
          external: runtime.authenticatedNavIsExternal && isAuthed,
        },
        {
          href: ROUTES.pricing,
          label: t("billing"),
        },
        {
          href: START_SESSION_HREF,
          label: t("startSession"),
        },
      ],
      [isAuthed, locale, studentHomeHref, t],
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

  const {
    status: billingStatus,
    headlineBadge,
    reload: reloadBillingStatus,
    setError: setBillingError,
  } = useBillingStatus();

  const checkoutResume = runtime.useResumeCheckout({
    billingStatus,
    callbackUrl: pathname || "/",
    websiteOrigin,
    setBillingError,
  });

  const headerPromotions = useMemo(() => {
    if (billingStatus?.isSubscribed) return [];

    const monthly = billingStatus?.activePromotions?.monthly ?? null;
    const yearly = billingStatus?.activePromotions?.yearly ?? null;
    const byId = new Map<string, NonNullable<typeof monthly>>();

    for (const promotion of [monthly, yearly]) {
      if (promotion) byId.set(promotion.id, promotion);
    }

    return Array.from(byId.values());
  }, [
    billingStatus?.isSubscribed,
    billingStatus?.activePromotions?.monthly,
    billingStatus?.activePromotions?.yearly,
  ]);

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
        <HeaderDestinationLink
          href={isAuthed ? studentHomeHref : ROUTES.home}
          external={runtime.authenticatedNavIsExternal && isAuthed}
          className="group flex min-w-0 items-center gap-2.5"
        >
          <ZoeSkoulLogoMark />

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
        </HeaderDestinationLink>

        {headlineBadge && isBillingStatus ? (
            <div className="hidden md:block">
              {headlineBadge.action === "resume_checkout" &&
               checkoutResume ? (
                  checkoutResume.kind === "link" ? (
                    <a
                      href={checkoutResume.href}
                      data-testid={checkoutResume.testId}
                      aria-label={headlineBadge.text}
                      className="inline-flex rounded-full focus:outline-none focus:ring-2 focus:ring-emerald-400/35"
                    >
                      <Badge tone={headlineBadge.tone} className="cursor-pointer whitespace-nowrap">
                        {headlineBadge.text}
                      </Badge>
                    </a>
                  ) : (
                    <button
                      type="button"
                      data-testid={checkoutResume.testId}
                      aria-label={headlineBadge.text}
                      disabled={checkoutResume.busy}
                      onClick={checkoutResume.onActivate}
                      className="inline-flex rounded-full focus:outline-none focus:ring-2 focus:ring-emerald-400/35 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Badge tone={headlineBadge.tone} className="cursor-pointer whitespace-nowrap">
                        {headlineBadge.text}
                      </Badge>
                    </button>
                  )
               ) : headlineBadge.href ? (
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

        {isBillingStatus && headerPromotions.length ? (
            <div className="hidden items-center gap-2 xl:flex">
              {headerPromotions.map((promotion) => (
                  <Link
                      key={promotion.id}
                      href={ROUTES.pricing}
                      aria-label={`${promotion.name}: ${promotion.percentOff}% off`}
                      className="inline-flex items-center gap-2 rounded-full border border-amber-300/70 bg-amber-50 px-3 py-1.5 text-amber-950 shadow-sm transition hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-400/35 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100 dark:hover:bg-amber-300/15"
                  >
                    <span className="whitespace-nowrap text-[11px] font-semibold">
                      {billingT("promotion.headerLabel")}: {promotion.name} ·{" "}
                      {billingT("promotion.badge", { percent: promotion.percentOff })}
                    </span>
                    <BillingPromotionCountdown
                      endsAt={promotion.endsAt}
                      onExpire={reloadBillingStatus}
                      compact
                    />
                  </Link>
              ))}
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
                      !n.external &&
                      (n.href === "/" ? pathname === "/" : pathname?.startsWith(n.href));

                  return (
                      <HeaderDestinationLink
                        key={n.href}
                        href={n.href}
                        external={n.external}
                        className={navLinkClass(Boolean(isActive))}
                      >
                        {n.label}
                      </HeaderDestinationLink>
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
                  <UserMenuSlick
                      name={user?.name ?? "User"}
                      email={user?.email}
                      image={user?.image}
                      profileHref="/profile"
                      onSignOut={() => hardLogout(locale, websiteOrigin)}
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
                            !n.external &&
                            (n.href === "/"
                                ? pathname === "/"
                                : pathname?.startsWith(n.href));

                        return (
                            <HeaderDestinationLink
                              key={n.href}
                              href={n.href}
                              external={n.external}
                              className={mobileItem(Boolean(isActive))}
                            >
                              {n.label}
                            </HeaderDestinationLink>
                        );
                      })
                      : null}

                  {isBillingStatus && headerPromotions.length ? (
                      <div className="grid gap-2">
                        {headerPromotions.map((promotion) => (
                            <Link
                                key={promotion.id}
                                href={ROUTES.pricing}
                                className="rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-amber-950 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-100"
                            >
                              <div className="text-xs font-semibold">
                                {billingT("promotion.headerLabel")}: {promotion.name} ·{" "}
                                {billingT("promotion.badge", { percent: promotion.percentOff })}
                              </div>
                              <BillingPromotionCountdown
                                endsAt={promotion.endsAt}
                                onExpire={reloadBillingStatus}
                                compact
                              />
                            </Link>
                        ))}
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
                                onClick={() => hardLogout(locale, websiteOrigin)}
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

function LearnHeaderSlick() {
  return (
      <HeaderSlick
          isBillingStatus={false}
          brand={runtime.appName}
          badge=""
          isUser={false}
          isNav={false}
      />
  );
}

  return {
    HeaderSlick,
    SettingsMenu,
    LearnHeaderSlick,
  };
}
