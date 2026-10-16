"use client";

import * as React from "react";
import {
  APP_LOCALES,
  normalizeLocale,
  persistLocale,
} from "@zoeskoul/preferences";
import { useAppPreferences } from "@zoeskoul/preferences/react";
import { LocaleSwitcherChrome } from "@zoeskoul/platform-ui";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";

function routeLocale(pathname: string | null, fallback: string) {
  const first = pathname?.split("/").filter(Boolean)[0];
  return APP_LOCALES.includes(first as (typeof APP_LOCALES)[number])
    ? normalizeLocale(first)
    : normalizeLocale(fallback);
}

function withLocale(pathname: string, locale: string) {
  const segments = pathname.split("/").filter(Boolean);

  if (
    segments[0] &&
    APP_LOCALES.includes(
      segments[0] as (typeof APP_LOCALES)[number],
    )
  ) {
    segments[0] = locale;
    return `/${segments.join("/")}`;
  }

  return pathname || "/";
}

export function ZoeBuildLocaleSwitcher(props: {
  compact?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const { preferences } = useAppPreferences();
  const locale = routeLocale(pathname, preferences.locale);

  const [isPending, startTransition] = React.useTransition();
  const [changingTo, setChangingTo] =
    React.useState<string | null>(null);

  function requestChange(nextLocale: string) {
    if (isPending || nextLocale === locale) return;

    const normalized = normalizeLocale(nextLocale);
    setChangingTo(normalized);
    persistLocale(normalized);

    const query = searchParams.toString();
    const hash =
      typeof window === "undefined" ? "" : window.location.hash;
    const nextPath = withLocale(pathname, normalized);
    const href =
      `${nextPath}${query ? `?${query}` : ""}${hash}`;

    startTransition(() => {
      router.replace(href);
    });
  }

  React.useEffect(() => {
    if (!isPending) setChangingTo(null);
  }, [isPending]);

  return (
    <LocaleSwitcherChrome
      compact={props.compact}
      className={props.className}
      locales={APP_LOCALES}
      locale={locale}
      isPending={isPending}
      changingTo={changingTo}
      ariaLabel="Choose language"
      changingLabel={
        changingTo
          ? `Changing to ${changingTo.toUpperCase()}`
          : "Changing language"
      }
      switchToLabel={(nextLocale) =>
        `Switch to ${nextLocale.toUpperCase()}`
      }
      onRequestChange={requestChange}
    />
  );
}
