import type {
  AppSessionResponse,
} from "@zoeskoul/auth-client";
import {
  BookOpen,
  ChevronDown,
  Dumbbell,
  Menu,
  Settings,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  navigateStudentApp,
} from "../app/studentRoutes";
import {
  StudentThemeControl,
} from "./StudentThemeControl";

type AuthenticatedSession = Extract<
  AppSessionResponse,
  { authenticated: true }
>;

const FONT_SIZE_STORAGE_KEY = "APP_FONT_SIZE_PX";
const FONT_SIZE_DEFAULT = 16;
const FONT_SIZE_OPTIONS = [14, 16, 20, 24] as const;

function localeFromPath(pathname: string): string {
  const candidate = pathname.split("/").filter(Boolean)[0];
  return candidate && /^(en|es|fr|ht)$/.test(candidate)
    ? candidate
    : "en";
}

function localHref(pathname: string): string {
  const locale = localeFromPath(window.location.pathname);
  return `/${locale}${pathname}`;
}

function clampFontPx(value: number): number {
  if (value <= 14) return 14;
  if (value <= 16) return 16;
  if (value <= 20) return 20;
  return 24;
}

function readStoredFontSize(): number {
  try {
    const raw = window.localStorage.getItem(FONT_SIZE_STORAGE_KEY);
    const parsed = raw ? Number(raw) : Number.NaN;
    return Number.isFinite(parsed)
      ? clampFontPx(parsed)
      : FONT_SIZE_DEFAULT;
  } catch {
    return FONT_SIZE_DEFAULT;
  }
}

function applyFontSize(value: number) {
  const size = clampFontPx(value);
  document.documentElement.style.setProperty(
    "--app-font-size",
    `${size}px`,
  );
  document.documentElement.style.fontSize = `${size}px`;
}

function isInternalStudentHref(href: string): boolean {
  try {
    return (
      new URL(href, window.location.origin).origin ===
      window.location.origin
    );
  } catch {
    return false;
  }
}

function UserMenu(props: {
  session: AuthenticatedSession;
  websiteOrigin: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const displayName =
    props.session.user.name ??
    props.session.user.email ??
    "Learner";
  const initials =
    displayName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.slice(0, 1).toUpperCase())
      .join("") || "L";

  useEffect(() => {
    function closeFromPointer(event: MouseEvent) {
      if (
        rootRef.current &&
        !rootRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function closeFromKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", closeFromPointer);
    document.addEventListener("keydown", closeFromKeyboard);

    return () => {
      document.removeEventListener("mousedown", closeFromPointer);
      document.removeEventListener("keydown", closeFromKeyboard);
    };
  }, []);

  function signOut() {
    const locale = localeFromPath(window.location.pathname);
    const redirect = new URL(`/${locale}`, props.websiteOrigin);
    const signOutUrl = new URL(
      "/api/auth/keycloak-logout",
      props.websiteOrigin,
    );
    signOutUrl.searchParams.set(
      "postLogoutRedirect",
      redirect.toString(),
    );
    window.location.assign(signOutUrl);
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="inline-flex h-8 items-center gap-2 rounded-md border border-neutral-200 bg-white px-2.5 text-[11px] font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80 dark:hover:bg-white/[0.08]"
        aria-expanded={open}
        aria-label="Open account menu"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-md border border-neutral-200 bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04]">
          {props.session.user.image ? (
            <img
              src={props.session.user.image}
              alt=""
              referrerPolicy="no-referrer"
              className="h-6 w-6 object-cover"
            />
          ) : (
            <span className="text-[10px] font-medium text-neutral-800 dark:text-white/85">
              {initials}
            </span>
          )}
        </span>

        <span className="hidden max-w-[120px] truncate sm:block">
          {displayName}
        </span>
        <ChevronDown
          className={
            open
              ? "h-3.5 w-3.5 rotate-180 text-neutral-500 transition-transform dark:text-white/50"
              : "h-3.5 w-3.5 text-neutral-500 transition-transform dark:text-white/50"
          }
          aria-hidden="true"
        />
      </button>

      <div
        className={
          open
            ? "pointer-events-auto absolute right-0 top-full z-[80] mt-2 w-[240px] translate-y-0 opacity-100 transition-all"
            : "pointer-events-none absolute right-0 top-full z-[80] mt-2 w-[240px] -translate-y-1 opacity-0 transition-all"
        }
      >
        <div className="ui-surface-floating overflow-hidden">
          <div className="border-b border-neutral-200 px-3 py-3 dark:border-white/10">
            <div className="truncate text-sm font-semibold text-neutral-900 dark:text-white">
              {displayName}
            </div>
            {props.session.user.email ? (
              <div className="mt-0.5 truncate text-[12px] text-neutral-500 dark:text-white/55">
                {props.session.user.email}
              </div>
            ) : null}
          </div>

          <div className="grid gap-1 p-1.5">
            <a
              href={localHref("/profile")}
              onClick={(event) => {
                setOpen(false);
                navigateStudentApp(
                  event,
                  localHref("/profile"),
                );
              }}
              className="flex h-8 items-center rounded-md px-2 text-[11px] font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-white/80 dark:hover:bg-white/[0.06]"
            >
              Profile
            </a>
            <button
              type="button"
              className="flex h-8 items-center rounded-md px-2 text-left text-[11px] font-medium text-rose-700 transition-colors hover:bg-rose-50 dark:text-rose-200 dark:hover:bg-rose-400/10"
              onClick={signOut}
            >
              Log out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const [fontPx, setFontPx] = useState(readStoredFontSize);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    applyFontSize(fontPx);

    try {
      window.localStorage.setItem(
        FONT_SIZE_STORAGE_KEY,
        String(fontPx),
      );
    } catch {
      // The setting still applies for this browser session.
    }
  }, [fontPx]);

  useEffect(() => {
    function closeFromPointer(event: MouseEvent) {
      const target = event.target as HTMLElement | null;

      if (target?.closest('[data-modal-root="true"]')) {
        return;
      }

      if (
        rootRef.current &&
        !rootRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }

    function closeFromKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", closeFromPointer);
    document.addEventListener("keydown", closeFromKeyboard);

    return () => {
      document.removeEventListener("mousedown", closeFromPointer);
      document.removeEventListener("keydown", closeFromKeyboard);
    };
  }, []);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="ui-btn-ide-ghost !w-8 !px-0"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open display settings"
        onClick={() => setOpen((current) => !current)}
      >
        <Settings className="h-4 w-4" />
      </button>

      {open ? (
        <div className="fixed left-3 right-3 top-[4.25rem] z-[75] max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-white/10 dark:bg-neutral-950 md:absolute md:left-auto md:right-0 md:top-full md:mt-2 md:w-[24rem]">
          <div className="border-b border-neutral-200 px-4 py-3 dark:border-white/10">
            <div className="text-sm font-semibold text-neutral-900 dark:text-white">
              Settings
            </div>
            <div className="mt-0.5 text-xs text-neutral-600 dark:text-white/60">
              Personalize the learning interface.
            </div>
          </div>

          <div className="grid gap-3 p-3">
            <section className="ui-surface-muted p-3">
              <div className="ui-kicker">Theme</div>
              <div className="mt-3">
                <StudentThemeControl />
              </div>
            </section>

            <section className="ui-surface-muted p-3">
              <div className="ui-kicker">Font size</div>
              <div className="mt-3 grid grid-cols-4 gap-1 rounded-lg border border-neutral-200 bg-white p-1 dark:border-white/10 dark:bg-white/[0.04]">
                {FONT_SIZE_OPTIONS.map((size) => (
                  <button
                    key={size}
                    type="button"
                    className={
                      fontPx === size
                        ? "rounded-md bg-neutral-900 px-2 py-2 text-[11px] font-medium text-white dark:bg-white dark:text-neutral-900"
                        : "rounded-md px-2 py-2 text-[11px] font-medium text-neutral-700 hover:bg-neutral-100 dark:text-white/70 dark:hover:bg-white/[0.08]"
                    }
                    onClick={() => setFontPx(size)}
                  >
                    {size}px
                  </button>
                ))}
              </div>
            </section>

            <button
              type="button"
              className="ui-btn-secondary w-full"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function LegacyStudentHeader(props: {
  session: AuthenticatedSession;
  websiteOrigin: string;
  pathname: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [elevated, setElevated] = useState(false);

  useEffect(() => {
    function updateElevation() {
      setElevated(window.scrollY > 6);
    }

    updateElevation();
    window.addEventListener("scroll", updateElevation, {
      passive: true,
    });

    return () => {
      window.removeEventListener("scroll", updateElevation);
    };
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [props.pathname]);

  const navItems = useMemo(
    () => [
      {
        label: "Home",
        href: localHref("/subjects"),
      },
      {
        label: "Catalogs",
        href: localHref("/catalogs"),
      },
      {
        label: "My Learning",
        href: localHref("/subjects"),
      },
      {
        label: "Assignments",
        href: localHref("/assignments"),
      },
      {
        label: "Tutoring",
        href: localHref("/tutoring"),
      },
    ],
    [],
  );

  function active(href: string): boolean {
    try {
      const url = new URL(href, window.location.origin);
      return props.pathname === url.pathname ||
        props.pathname.startsWith(`${url.pathname}/`);
    } catch {
      return false;
    }
  }

  return (
    <header className="sticky top-0 z-50">
      <div
        className={
          elevated
            ? "border-b border-neutral-200/80 bg-white/90 shadow-sm backdrop-blur dark:border-white/10 dark:bg-neutral-950/85"
            : "border-b border-neutral-200/80 bg-white/90 backdrop-blur dark:border-white/10 dark:bg-neutral-950/85"
        }
      >
        <div className="mx-auto px-4 md:px-6">
          <div className="flex h-16 min-w-0 items-center gap-2 sm:gap-3 lg:gap-4">
            <a
              href={localHref("/subjects")}
              className="group flex min-w-0 shrink-0 items-center gap-2.5"
              onClick={(event) =>
                navigateStudentApp(event, localHref("/subjects"))
              }
            >
              <div className="ui-icon-box h-9 w-9 rounded-lg">
                <span className="text-sm font-semibold text-neutral-900 dark:text-white/90">
                  Z
                </span>
              </div>
              <div className="min-w-0 leading-tight">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 truncate text-sm font-semibold tracking-tight text-neutral-900 dark:text-white/90">
                    ZoeSkoul
                  </span>
                </div>
                <div className="hidden truncate text-[11px] text-neutral-500 dark:text-white/55 sm:block">
                  Learn, practice, and build.
                </div>
              </div>
            </a>

            <nav className="ml-auto hidden shrink-0 items-center gap-2 lg:flex">
              <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-white/80 p-1 dark:border-white/10 dark:bg-white/[0.04]">
                {navItems.map((item) => {
                  const isActive = active(item.href);
                  const internal = isInternalStudentHref(item.href);

                  return (
                    <a
                      key={item.label}
                      href={item.href}
                      className={
                        isActive
                          ? "ui-btn-ide-active h-8"
                          : "ui-btn-ide-ghost h-8"
                      }
                      onClick={
                        internal
                          ? (event) =>
                              navigateStudentApp(event, item.href)
                          : undefined
                      }
                    >
                      {item.label}
                    </a>
                  );
                })}
              </div>

              <a
                className="ui-btn-primary h-8 whitespace-nowrap"
                href={localHref("/subjects")}
                onClick={(event) =>
                  navigateStudentApp(event, localHref("/subjects"))
                }
              >
                <BookOpen className="h-4 w-4 shrink-0" />
                Learn
              </a>

              <a
                className="ui-btn-info-secondary h-8 whitespace-nowrap"
                href={localHref("/practice/daily")}
                onClick={(event) =>
                  navigateStudentApp(
                    event,
                    localHref("/practice/daily"),
                  )
                }
              >
                <Dumbbell className="h-4 w-4 shrink-0" />
                Practice
              </a>

              <SettingsMenu />
              <UserMenu
                session={props.session}
                websiteOrigin={props.websiteOrigin}
              />
            </nav>

            <div className="ml-auto flex shrink-0 items-center gap-2 lg:hidden">
              <SettingsMenu />
              <button
                type="button"
                className="ui-btn-secondary"
                aria-expanded={mobileOpen}
                aria-label="Toggle navigation menu"
                onClick={() =>
                  setMobileOpen((current) => !current)
                }
              >
                {mobileOpen ? (
                  <X className="h-4 w-4" />
                ) : (
                  <Menu className="h-4 w-4" />
                )}
                <span>{mobileOpen ? "Close" : "Menu"}</span>
              </button>
            </div>
          </div>

          <div
            className={
              mobileOpen
                ? "max-h-[520px] overflow-hidden pb-4 opacity-100 transition-[max-height,opacity] duration-300 lg:hidden"
                : "max-h-0 overflow-hidden opacity-0 transition-[max-height,opacity] duration-300 lg:hidden"
            }
          >
            <div className="mt-2 grid gap-2">
              {navItems.map((item) => {
                const internal = isInternalStudentHref(item.href);

                return (
                  <a
                    key={item.label}
                    href={item.href}
                    className={
                      active(item.href)
                        ? "flex h-10 items-center rounded-md bg-neutral-900 px-3 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
                        : "flex h-10 items-center rounded-md px-3 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-white/75 dark:hover:bg-white/[0.08]"
                    }
                    onClick={
                      internal
                        ? (event) =>
                            navigateStudentApp(event, item.href)
                        : undefined
                    }
                  >
                    {item.label}
                  </a>
                );
              })}

              <UserMenu
                session={props.session}
                websiteOrigin={props.websiteOrigin}
              />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
