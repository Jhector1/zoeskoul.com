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
const FONT_SIZE_OPTIONS = [16, 20, 24] as const;

function clampFontPx(x: number) {
  if (x <= 16) return 16;
  if (x <= 20) return 20;
  return 24;
}
const START_SESSION_HREF="/sandbox"
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

  // for CSS that uses the custom variable
  document.documentElement.style.setProperty("--app-font-size", `${next}px`);

  // for rem-based sizing across the whole app
  document.documentElement.style.fontSize = `${next}px`;
}

function FontSizePicker(props: {
  value: number;
  onChange: (px: number) => void;
  labels: { small: string; normal: string; large: string };
}) {
  const { value, onChange, labels } = props;

  const items: Array<{ px: (typeof FONT_SIZE_OPTIONS)[number]; label: string }> = [
    { px: 16, label: labels.small },
    { px: 20, label: labels.normal },
    { px: 24, label: labels.large },
  ];

  return (
      <div
          role="radiogroup"
          aria-label="Font size"
          className="grid w-full max-w-full grid-cols-3 gap-1 rounded-xl border border-neutral-200 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-white/5 sm:w-auto"
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
                      "min-w-0 rounded-lg px-2 py-2 text-[11px] font-black tracking-tight transition sm:px-2.5 sm:py-1 sm:text-xs",
                      "truncate focus:outline-none focus:ring-2 focus:ring-neutral-400/40 dark:focus:ring-white/20",
                      active
                          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                          : "text-neutral-700 hover:bg-neutral-100 dark:text-white/70 dark:hover:bg-white/10"
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
  const panelRef = useRef<HTMLDivElement | null>(null);

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
      <div ref={wrapRef} className="relative overflow-visible">
        <button
            type="button"
            className="ui-gearbtn"
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
                  className="fixed inset-0 z-[69] bg-black/20 backdrop-blur-[1px] md:hidden"
                  onClick={() => setOpen(false)}
                  aria-hidden="true"
              />

              <div
                  ref={panelRef}
                  role="menu"
                  className={cn(
                      "fixed left-3 right-3 top-[4.5rem] z-[70]",
                      "max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-3xl border border-neutral-200 bg-white shadow-2xl",
                      "dark:border-white/10 dark:bg-neutral-950",
                      "md:absolute md:right-0 md:left-auto md:top-full md:mt-2",
                      "md:w-[min(26rem,calc(100vw-2rem))] md:max-w-[calc(100vw-2rem)]"
                  )}
              >
                <div className="border-b border-neutral-200 px-4 py-3 dark:border-white/10">
                  <div className="text-sm font-black tracking-tight text-neutral-900 dark:text-white">
                    {t("settings")}
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-600 dark:text-white/60">
                    {t("settingsSubtitle")}
                  </div>
                </div>

                <div className="grid gap-3 p-3">
                  <div className="ui-menu-section min-w-0">
                    <div className="ui-menu-label">{t("theme")}</div>
                    <div className="mt-2 flex min-w-0 flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0 text-xs text-neutral-600 dark:text-white/60">
                        {t("themeHint")}
                      </div>
                      <div className="shrink-0">
                        <ThemeToggle compact />
                      </div>
                    </div>
                  </div>

                  <div className="ui-menu-section min-w-0">
                    <div className="ui-menu-label">{t("fontSize")}</div>
                    <div className="mt-2 flex min-w-0 flex-col items-start gap-3">
                      <div className="min-w-0 text-xs text-neutral-600 dark:text-white/60">
                        {t("fontSizeHint")}
                      </div>
                      <FontSizePicker
                          value={fontPx}
                          onChange={(px) => setFontPx(clampFontPx(px))}
                          labels={{
                            small: t("fontSmall"),
                            normal: t("fontNormal"),
                            large: t("fontLarge"),
                          }}
                      />
                    </div>
                  </div>

                  <div className="ui-menu-section min-w-0">
                    <div className="ui-menu-label">{t("language")}</div>
                    <div className="mt-2 min-w-0">
                      <LocaleSwitcher compact className="w-full min-w-0" />
                    </div>
                  </div>

                  <div className="ui-menu-section min-w-0">
                    <div className="ui-menu-label">{t("sound")}</div>
                    <div className="mt-2 flex min-w-0 flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0 text-xs text-neutral-600 dark:text-white/60">
                        {t("soundHint")}
                      </div>
                      <div className="shrink-0">
                        <SoundToggle />
                      </div>
                    </div>
                  </div>

                  <button type="button" onClick={() => setOpen(false)} className="ui-menu-closebtn">
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
      [locale, pathname, isAuthed, status, user]
  );

  const slotNode = SlotComponent ? <SlotComponent {...slotCtx} /> : slot ?? null;

  const NAV: NavItem[] = useMemo(
      () => [
        { href: ROUTES.home, label: t("home") },
        { href: ROUTES.catalog, label: t("subjects") },
        { href: ROUTES.pricing, label: t("billing") },
      ],
      [t]
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

  const activeIndex = useMemo(() => {
    const idx = NAV.findIndex((n) => (n.href === "/" ? pathname === "/" : pathname?.startsWith(n.href)));
    return idx < 0 ? 0 : idx;
  }, [pathname, NAV]);

  const navWrapRef = useRef<HTMLDivElement | null>(null);
  const labelRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const [marker, setMarker] = useState<{ left: number; width: number }>({ left: 0, width: 0 });

  useEffect(() => {
    if (!isNav) return;

    const wrap = navWrapRef.current;
    const labelEl = labelRefs.current[activeIndex];
    if (!wrap || !labelEl) return;

    let raf = 0;

    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const wrapNow = navWrapRef.current;
        const labelNow = labelRefs.current[activeIndex];
        if (!wrapNow || !labelNow) return;

        const pill = labelNow.parentElement as HTMLElement | null;
        if (!pill) return;

        const left = pill.offsetLeft;
        const width = pill.offsetWidth;
        if (width > 0) setMarker({ left, width });
      });
    };

    update();

    const ro = new ResizeObserver(update);
    ro.observe(wrap);
    ro.observe(labelEl);

    window.addEventListener("resize", update);

    const fontSet: FontFaceSet | undefined = (document as any)?.fonts;
    let cancelled = false;
    if (fontSet?.ready) {
      fontSet.ready.then(() => !cancelled && update()).catch(() => {});
    }

    return () => {
      cancelled = true;
      ro.disconnect();
      window.removeEventListener("resize", update);
      cancelAnimationFrame(raf);
    };
  }, [activeIndex, locale, pathname, NAV.length, isNav]);

  const headerShell = cn("ui-header-shell overflow-visible", elevated && "ui-header-shell--elevated");

  const mobileItem = (isActive: boolean) =>
      cn("ui-mobileitem", isActive ? "ui-mobileitem--active" : "ui-mobileitem--idle");

  const { headlineBadge } = useBillingStatus();
  const searchParams = useSearchParams();

  const callbackUrl = useMemo(() => {
    const qs = searchParams?.toString();
    const path = pathname || "/";
    return `/${locale}${path === "/" ? "" : path}${qs ? `?${qs}` : ""}`;
  }, [locale, pathname, searchParams]);

  const authHref = useMemo(() => {
    return { pathname: "/authenticate", query: { callbackUrl } } as const;
  }, [callbackUrl]);

  return (
      <header className="sticky top-0 z-50 overflow-visible">
        <div className={headerShell}>
          <div className="mx-auto overflow-visible px-4 md:px-6">
            <div className="flex h-16 min-w-0 items-center gap-2 overflow-visible sm:gap-3 lg:gap-4">
              <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
                <Link href="/" className="group flex min-w-0 items-center gap-2 sm:gap-3">
                  <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
                    <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(120%_120%_at_30%_20%,rgba(122,162,255,0.18)_0%,rgba(255,107,214,0.08)_35%,transparent_70%)] opacity-80" />
                    <span className="relative text-sm font-black tracking-tight text-neutral-900 dark:text-white">L</span>
                  </div>

                  <div className="min-w-0 leading-tight">
                    <div className="flex min-w-0 items-center gap-2">
          <span
              className="min-w-0 truncate text-sm font-black tracking-tight text-neutral-900 dark:text-white/90"
              title={brand}
          >
            {brand}
          </span>

                      <span className="hidden shrink-0 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-[2px] text-[10px] font-extrabold text-neutral-700 dark:border-white/10 dark:bg-white/10 dark:text-white/70 sm:inline-flex">
            {badge}
          </span>
                    </div>

                    <div className="hidden truncate text-[11px] font-semibold text-neutral-500 dark:text-white/55 sm:block">
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
                    <div
                        className={cn(
                            "max-w-full min-w-0 px-2",
                            "overflow-x-auto",
                            "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                        )}
                    >
                      {slotNode}
                    </div>
                  </div>
              ) : (
                  <div className="hidden flex-1 xl:block" />
              )}

              <nav className="ml-auto hidden shrink-0 items-center gap-2 lg:flex">
                {isNav && (
                    <div className="ui-navcard">
                      <div className="ui-navglow" />
                      <div ref={navWrapRef} className="relative flex items-center gap-1">
                        <div
                            className="ui-navmarker"
                            style={{
                              width: marker.width ? `${marker.width}px` : undefined,
                              transform: `translate3d(${marker.left}px, 0, 0)`,
                            }}
                        />
                        {NAV.map((n, i) => {
                          const isActive = n.href === "/" ? pathname === "/" : pathname?.startsWith(n.href);
                          return (
                              <Link
                                  key={n.href}
                                  href={n.href}
                                  className={cn("ui-navlink", isActive ? "ui-navlink--active" : "ui-navlink--inactive")}
                              >
                <span
                    ref={(el) => {
                      labelRefs.current[i] = el;
                    }}
                    className="inline-block"
                >
                  {n.label}
                </span>
                              </Link>
                          );
                        })}
                      </div>
                    </div>
                )}

                {isNav && (
                    <Link href={START_SESSION_HREF} className="hidden xl:inline-flex ui-cta">
                      {t("startSession")}
                    </Link>
                )}

                {isSetting && <SettingsMenu />}

                {isUser &&
                    status !== "loading" &&
                    (isAuthed ? (
                        <UserMenuSlick
                            name={user?.name ?? "User"}
                            email={user?.email}
                            image={user?.image}
                            profileHref="/profile"
                            onSignOut={() => hardLogout(locale)}
                        />
                    ) : (
                        <Link href={authHref} className="ui-authbtn">
                          {t("signIn")}
                        </Link>
                    ))}
              </nav>

              <div className="ml-auto flex shrink-0 items-center gap-2 lg:hidden">
                {isSetting && <SettingsMenu />}
                {(isNav || isUser) && (
                    <button
                        className="ui-mobilebtn"
                        onClick={() => setOpen((v) => !v)}
                        aria-expanded={open}
                        aria-label={t("toggleMenu")}
                    >
                      {open ? t("close") : t("menu")}
                    </button>
                )}
              </div>
            </div>
            {slotNode ? (
                <div className="xl:hidden -mt-1 pb-2">
                  <div className="rounded-2xl border border-neutral-200/70 bg-white/60 px-2 py-2 backdrop-blur dark:border-white/10 dark:bg-white/[0.04]">
                    <div
                        className={cn(
                            "flex items-center gap-2 overflow-x-auto",
                            "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                        )}
                    >
                      {slotNode}
                    </div>
                  </div>
                </div>
            ) : null}

            {(isNav || isUser) && (
                <div
                    className={cn(
                        "overflow-hidden transition-[max-height,opacity] duration-300 lg:hidden",
                        open ? "max-h-[520px] opacity-100" : "max-h-0 opacity-0"
                    )}
                >
                  <div className="pb-4">
                    <div className="mt-2 grid gap-2">
                      {isNav &&
                          NAV.map((n) => {
                            const isActive = n.href === "/" ? pathname === "/" : pathname?.startsWith(n.href);
                            return (
                                <Link key={n.href} href={n.href} className={mobileItem(isActive)}>
                                  {n.label}
                                </Link>
                            );
                          })}

                      {isNav && (
                          <Link href={START_SESSION_HREF} className={cn("ui-cta", "px-3 py-3 text-sm")}>
                            {t("startSession")}
                          </Link>
                      )}

                      {isUser &&
                          status !== "loading" &&
                          (isAuthed ? (
                              <>
                                <Link href="/profile" className={mobileItem(Boolean(pathname?.startsWith("/profile")))}>
                                  {t("profile")}
                                </Link>
                                <button type="button" onClick={() => hardLogout(locale)} className={mobileItem(false)}>
                                  {t("logout")}
                                </button>
                              </>
                          ) : (
                              <Link href={authHref} className={mobileItem(false)}>
                                {t("signIn")}
                              </Link>
                          ))}

                      {(isNav || isUser) && (
                          <div className="mt-3 text-[11px] text-neutral-500 dark:text-white/55">{t("tip")}</div>
                      )}
                    </div>
                  </div>
                </div>
            )}
          </div>
        </div>

        <div className="ui-bottomline" />
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