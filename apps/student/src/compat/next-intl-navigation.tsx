import {
  forwardRef,
  type AnchorHTMLAttributes,
  type MouseEvent,
} from "react";

import {
  currentLocale,
  localizedHref,
  navigate,
  stripLocale,
  useLocationSnapshot,
  refreshClientData,
} from "./navigation-runtime";

import {
  externalWebsiteHref,
} from "./app-route-ownership";

type RoutingConfig = {
  locales: readonly string[];
  defaultLocale: string;
};

type QueryScalar =
  | string
  | number
  | boolean
  | null
  | undefined;

type QueryValue =
  | QueryScalar
  | readonly QueryScalar[];

export type NavigationHref =
  | string
  | {
      pathname: string;
      query?: Record<string, QueryValue>;
      hash?: string;
    };

type LinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
> & {
  href: NavigationHref;
  locale?: string;
  prefetch?: boolean;
};

function hrefToString(href: NavigationHref): string {
  if (typeof href === "string") {
    return href;
  }

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(
    href.query ?? {},
  )) {
    const values = Array.isArray(value)
      ? value
      : [value];

    for (const entry of values) {
      if (entry == null) {
        continue;
      }

      params.append(key, String(entry));
    }
  }

  const search = params.toString();
  const hash = href.hash
    ? href.hash.startsWith("#")
      ? href.hash
      : `#${href.hash}`
    : "";

  return `${href.pathname}${
    search ? `?${search}` : ""
  }${hash}`;
}

function isPlainPrimaryClick(
  event: MouseEvent<HTMLAnchorElement>,
) {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

function resolveHref(
  href: NavigationHref,
  locale?: string,
) {
  const value = hrefToString(href);
  const selectedLocale =
    locale ?? currentLocale();
  const websiteOrigin =
    import.meta.env.VITE_WEBSITE_ORIGIN ??
    "http://localhost:3000";
  const websiteHref =
    externalWebsiteHref({
      rawHref: value,
      locale: selectedLocale,
      websiteOrigin,
    });

  if (websiteHref) {
    return websiteHref;
  }

  return value.startsWith("#")
    ? value
    : localizedHref(
        value,
        selectedLocale,
      );
}

export function createNavigation(
  _routing: RoutingConfig,
) {
  const Link = forwardRef<
    HTMLAnchorElement,
    LinkProps
  >(function Link(
    {
      href,
      locale,
      prefetch: _prefetch,
      onClick,
      target,
      ...props
    },
    ref,
  ) {
    useLocationSnapshot();

    const rawHref = hrefToString(href);
    const resolvedHref = resolveHref(href, locale);

    return (
      <a
        {...props}
        ref={ref}
        href={resolvedHref}
        target={target}
        onClick={(event) => {
          onClick?.(event);

          if (
            !isPlainPrimaryClick(event) ||
            target === "_blank" ||
            rawHref.startsWith("#") ||
            /^(mailto:|tel:|https?:\/\/)/.test(rawHref) ||
            /^https?:\/\//.test(resolvedHref)
          ) {
            return;
          }

          event.preventDefault();
          navigate(resolvedHref);
        }}
      />
    );
  });

  function usePathname() {
    useLocationSnapshot();
    return stripLocale(window.location.pathname);
  }

  function useRouter() {
    useLocationSnapshot();

    return {
      push: (
        href: NavigationHref,
        options?: {
          locale?: string;
          scroll?: boolean;
        },
      ) =>
        navigate(
          resolveHref(href, options?.locale),
          {
            scroll: options?.scroll,
          },
        ),
      replace: (
        href: NavigationHref,
        options?: {
          locale?: string;
          scroll?: boolean;
        },
      ) =>
        navigate(
          resolveHref(href, options?.locale),
          {
            replace: true,
            scroll: options?.scroll,
          },
        ),
      back: () => window.history.back(),
      forward: () => window.history.forward(),
      refresh: () => refreshClientData(),
      prefetch: async (
        _href: NavigationHref,
      ) => undefined,
    };
  }

  function getPathname(args: {
    href: NavigationHref;
    locale?: string;
  }) {
    return resolveHref(
      args.href,
      args.locale,
    );
  }

  function redirect(
    args:
      | NavigationHref
      | {
          href: NavigationHref;
          locale?: string;
        },
  ): never {
    const href =
      typeof args === "object" &&
      "href" in args
        ? resolveHref(
            args.href,
            args.locale,
          )
        : resolveHref(args);

    window.location.replace(href);
    throw new Error(`Redirecting to ${href}`);
  }

  return {
    Link,
    redirect,
    usePathname,
    useRouter,
    getPathname,
  };
}
