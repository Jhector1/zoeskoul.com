import { useSyncExternalStore } from "react";

const NAVIGATION_EVENT = "zoeskoul:vite-navigation";

function snapshot() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function serverSnapshot() {
  return "/";
}

function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener);
  window.addEventListener(NAVIGATION_EVENT, listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener(NAVIGATION_EVENT, listener);
  };
}

export function useLocationSnapshot() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

export function emitNavigation() {
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
}

export function navigate(
  href: string,
  options: {
    replace?: boolean;
    locale?: string;
    scroll?: boolean;
  } = {},
) {
  const current = new URL(window.location.href);
  const target = new URL(href, current);

  if (options.locale) {
    const segments = target.pathname.split("/").filter(Boolean);
    if (/^(en|es|fr|ht)$/.test(segments[0] ?? "")) {
      segments[0] = options.locale;
    } else {
      segments.unshift(options.locale);
    }
    target.pathname = `/${segments.join("/")}`;
  }

  const next = `${target.pathname}${target.search}${target.hash}`;

  if (options.replace) {
    window.history.replaceState({}, "", next);
  } else {
    window.history.pushState({}, "", next);
  }

  emitNavigation();

  if (options.scroll !== false) {
    window.scrollTo({ top: 0, left: 0 });
  }
}

export function currentLocale() {
  const first = window.location.pathname.split("/").filter(Boolean)[0];
  return /^(en|es|fr|ht)$/.test(first ?? "") ? first : "en";
}

export function stripLocale(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (/^(en|es|fr|ht)$/.test(segments[0] ?? "")) {
    segments.shift();
  }

  return segments.length
    ? `/${segments.join("/")}`
    : "/";
}

export function localizedHref(href: string, locale = currentLocale()) {
  if (
    !href.startsWith("/") ||
    href.startsWith("/api/") ||
    href.startsWith("//")
  ) {
    return href;
  }

  const url = new URL(href, window.location.origin);
  const segments = url.pathname.split("/").filter(Boolean);

  if (/^(en|es|fr|ht)$/.test(segments[0] ?? "")) {
    segments[0] = locale;
  } else {
    segments.unshift(locale);
  }

  url.pathname = `/${segments.join("/")}`;
  return `${url.pathname}${url.search}${url.hash}`;
}

export const VITE_REFRESH_EVENT =
  "zoeskoul:vite-refresh";

export function refreshClientData() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new Event(VITE_REFRESH_EVENT),
  );
}
