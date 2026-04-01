"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import type { Session } from "next-auth";
import UserMenuSlick from "./UserMenuSlick";

import { useTranslations, useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import LocaleSwitcher from "./LocaleSwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { Settings } from "lucide-react";
import { cn } from "@/lib/cn";
import Badge from "@/components/billing/Badge";
import { useBillingStatus } from "@/components/billing/hooks/useBillingStatus";
import { ROUTES } from "@/utils";
import { useSearchParams } from "next/navigation";
import SoundToggle from "@/lib/sfx/SoundToggle";
import {useAuthHref} from "@/hooks/useAuthHref";

type NavItem = { href: string; label: string };
type SessionStatus = "loading" | "authenticated" | "unauthenticated";
type HeaderSlotCtx = {
  locale: string;
  pathname: string;
  isAuthed: boolean;
  status: SessionStatus;
  user?: Session["user"];
};

async function hardLogout(locale: string) {
  await signOut({ redirect: false });
  window.location.href = `/api/auth/keycloak-logout?postLogoutRedirect=${encodeURIComponent(`/${locale}`)}`;
}

const FONT_SIZE_STORAGE_KEY = "APP_FONT_SIZE_PX";
const FONT_SIZE_DEFAULT = 16;
const FONT_SIZE_OPTIONS = [14,16, 20, 24] as const;
const START_SESSION_HREF = "/sandbox";

function clampFontPx(x: number) {
  if (x <= 14) return 14;
  if (x <= 16) return 16;
  if (x <= 20) return 20;
  return 24;
}

function readStoredFontSize() {
  if (typeof window === "undefined") return FONT_SIZE_DEFAULT;

  try {
    const raw = window.localStorage.getItem(FONT_SIZE_STORAGE_KEY);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? clampFontPx(parsed) : FONT_SIZE_DEFAULT;
  } catch {
    return FONT_SIZE_DEFAULT;
  }
}

function applyBaseFontSize(px: number) {
  if (typeof document === "undefined") return;

  const next = clampFontPx(px);
  document.documentElement.style.setProperty("--app-font-size", `${next}px`);
  document.documentElement.style.fontSize = `${next}px`;
}

function FontSizePicker(props: {
  value: number;
  onChange: (px: number) => void;
  labels: { small: string; normal: string; large: string; extraLarge: string};
}) {
  const { value, onChange, labels } = props;

  const items: Array<{ px: (typeof FONT_SIZE_OPTIONS)[number]; label: string }> = [
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

function SettingsMenu() {
  const t = useTranslations("Header");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const [fontPx, setFontPx] = useState<number>(() => readStoredFontSize());

  React.useLayoutEffect(() => {
    applyBaseFontSize(fontPx);
  }, [fontPx]);

  useEffect(() => {
    try {
      localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(fontPx));
    } catch {}
  }, [fontPx]);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== FONT_SIZE_STORAGE_KEY) return;
      setFontPx(readStoredFontSize());
    }

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-modal-root="true"]')) return;
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(target as Node)) setOpen(false);
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

  return (
      <div ref={wrapRef} className="relative">
        <button
            type="button"
            className="ui-btn-ide-ghost !w-8 !px-0"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={t("openSettings")}
            onClick={() => setOpen((v) => !v)}
        >
          <Settings className="h-4 w-4" />
        </button>

        {open ? (
            <>
              <div
                  className="fixed inset-0 z-[69] bg-black/20 md:hidden"
                  onClick={() => setOpen(false)}
                  aria-hidden="true"
              />

              <div
                  role="menu"
                  className={cn(
                      "fixed left-3 right-3 top-[4.25rem] z-[70]",
                      "max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-white/10 dark:bg-neutral-950",
                      "md:absolute md:left-auto md:right-0 md:top-full md:mt-2 md:w-[24rem]",
                  )}
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
                          onChange={(px) => setFontPx(clampFontPx(px))}
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

                  <button type="button" onClick={() => setOpen(false)} className="ui-btn-secondary w-full">
                    {t("close")}
                  </button>
                </div>
              </div>
            </>
        ) : null}
      </div>
  );
}

export default function HeaderSlick({
                                      brand = "Learnoir",
                                      badge = "BETA",
                                      isNav = true,
                                      isUser = true,
                                      isSetting = true,
                                      isBillingStatus = true,
                                      slot,
                                      SlotComponent,
                                    }: {
  brand?: string;
  badge?: string;
  isBillingStatus?: boolean;
  isNav?: boolean;
  isUser?: boolean;
  isSetting?: boolean;
  slot?: React.ReactNode;
  SlotComponent?: React.ComponentType<HeaderSlotCtx>;
}) {
  const t = useTranslations("Header");
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

  const NAV: NavItem[] = useMemo(
      () => [
        { href: ROUTES.home, label: t("home") },
        { href: ROUTES.catalog, label: t("subjects") },
        { href: ROUTES.pricing, label: t("billing") },
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

  return (
      <header className="sticky top-0 z-50">
        <div
            className={cn(
                "border-b border-neutral-200/80 bg-white/90 backdrop-blur dark:border-white/10 dark:bg-neutral-950/85",
                elevated && "shadow-sm",
            )}
        >
          <div className="mx-auto px-4 md:px-6">
            <div className="flex h-16 min-w-0 items-center gap-2 sm:gap-3 lg:gap-4">
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
                      <Badge tone={headlineBadge.tone}>{headlineBadge.text}</Badge>
                    </div>
                ) : null}
              </div>

              {slotNode ? (
                  <div className="hidden min-w-0 flex-1 justify-center xl:flex">
                    <div className="max-w-full min-w-0 overflow-x-auto px-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {slotNode}
                    </div>
                  </div>
              ) : (
                  <div className="hidden flex-1 xl:block" />
              )}

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
                    <Link href={START_SESSION_HREF} className="ui-btn-primary">
                      {t("startSession")}
                    </Link>
                ) : null}

                {isSetting ? <SettingsMenu /> : null}

                {isUser && status !== "loading"
                    ? isAuthed ? (
                        <UserMenuSlick
                            name={user?.name ?? "User"}
                            email={user?.email}
                            image={user?.image}
                            profileHref="/profile"
                            onSignOut={() => hardLogout(locale)}
                        />
                    ) : (
                        <Link href={authHref} className="ui-btn-secondary">
                          {t("signIn")}
                        </Link>
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
            </div>

            {slotNode ? (
                <div className="xl:hidden -mt-1 pb-2">
                  <div className="ui-surface-muted px-2 py-2">
                    <div className="flex items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {slotNode}
                    </div>
                  </div>
                </div>
            ) : null}

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
                          <Link href={START_SESSION_HREF} className="ui-btn-primary w-full justify-center">
                            {t("startSession")}
                          </Link>
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
                                    onClick={() => hardLogout(locale)}
                                    className={mobileItem(false)}
                                >
                                  {t("logout")}
                                </button>
                              </>
                          ) : (
                              <Link href={authHref} className={mobileItem(false)}>
                                {t("signIn")}
                              </Link>
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
          </div>
        </div>
      </header>
  );
}

export function LearnHeaderSlick() {
  return (
      <HeaderSlick
          isBillingStatus={false}
          brand={process.env.NEXT_PUBLIC_APP_NAME}
          badge="MVP"
          isUser={false}
          isNav={false}
      />
  );
}