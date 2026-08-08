export type SearchLike = string | { toString(): string } | null | undefined;

export type SanitizeCallbackOptions = {
    locale?: string;
    fallback?: string;
    blockedPrefixes?: string[];
};

const DEFAULT_BLOCKED_PREFIXES = [
    "/authenticate",
    "/api/auth",
    "/logout",
    "/auth/error",
];

function ensureLeadingSlash(value: string) {
    return value.startsWith("/") ? value : `/${value}`;
}

function normalizeSearch(search: SearchLike) {
    if (!search) return "";
    const raw = typeof search === "string" ? search : search.toString();
    if (!raw) return "";
    return raw.startsWith("?") ? raw : `?${raw}`;
}

export function withLocalePrefix(locale: string, pathname: string = "/") {
    const safeLocale = locale || "en";
    const path = ensureLeadingSlash((pathname || "/").trim());

    if (path === `/${safeLocale}` || path.startsWith(`/${safeLocale}/`)) {
        return path;
    }

    return path === "/" ? `/${safeLocale}` : `/${safeLocale}${path}`;
}

export function sanitizeCallbackUrl(
    raw: string | null | undefined,
    options: SanitizeCallbackOptions = {},
) {
    const locale = options.locale || "en";
    const fallback = options.fallback || `/${locale}`;
    const blockedPrefixes = options.blockedPrefixes || DEFAULT_BLOCKED_PREFIXES;

    const value = String(raw ?? "").trim();
    if (!value) return fallback;

    if (!value.startsWith("/")) return fallback;
    if (value.startsWith("//")) return fallback;
    if (value.includes("://")) return fallback;

    for (const blocked of blockedPrefixes) {
        if (
            value === blocked ||
            value.startsWith(`${blocked}/`) ||
            value.startsWith(`${blocked}?`)
        ) {
            return fallback;
        }
    }

    return value;
}

export function buildLocalCallbackUrl(args: {
    locale: string;
    pathname?: string | null;
    search?: SearchLike;
}) {
    const fallback = `/${args.locale}`;
    const localizedPath = withLocalePrefix(args.locale, args.pathname || "/");
    const search = normalizeSearch(args.search);

    return sanitizeCallbackUrl(`${localizedPath}${search}`, {
        locale: args.locale,
        fallback,
    });
}

export function buildTargetCallbackUrl(args: {
    locale: string;
    targetPathname: string;
    search?: SearchLike;
}) {
    const fallback = `/${args.locale}`;
    const localizedPath = withLocalePrefix(args.locale, args.targetPathname);
    const search = normalizeSearch(args.search);

    return sanitizeCallbackUrl(`${localizedPath}${search}`, {
        locale: args.locale,
        fallback,
    });
}

export function buildAuthenticateHref(callbackUrl: string) {
    return {
        pathname: "/authenticate",
        query: { callbackUrl },
    } as const;
}

export function buildAuthenticateHrefForTarget(args: {
    locale: string;
    targetPathname: string;
    search?: SearchLike;
}) {
    return buildAuthenticateHref(
        buildTargetCallbackUrl({
            locale: args.locale,
            targetPathname: args.targetPathname,
            search: args.search,
        }),
    );
}