export const zoeSkoulApps = {
  website: {
    id: "website",
    label: "ZoeSkoul",
    localPort: 3000,
    productionOrigin: "https://zoeskoul.com",
  },
  admin: {
    id: "admin",
    label: "ZoeSkoul Admin",
    localPort: 3001,
    productionOrigin: "https://admin.zoeskoul.com",
  },
  student: {
    id: "student",
    label: "ZoeSkoul Student",
    localPort: 3002,
    productionOrigin: "https://student.zoeskoul.com",
  },
  teacher: {
    id: "teacher",
    label: "ZoeSkoul Teacher",
    localPort: 3003,
    productionOrigin: "https://teacher.zoeskoul.com",
  },
} as const;

export type ZoeSkoulAppId = keyof typeof zoeSkoulApps;

export const browserAppIds = [
  "admin",
  "student",
  "teacher",
] as const satisfies readonly ZoeSkoulAppId[];

export type ZoeSkoulBrowserAppId = (typeof browserAppIds)[number];

export function getLocalAppOrigin(appId: ZoeSkoulAppId): string {
  return `http://localhost:${zoeSkoulApps[appId].localPort}`;
}

export function getProductionAppOrigin(appId: ZoeSkoulAppId): string {
  return zoeSkoulApps[appId].productionOrigin;
}

export function getTrustedBrowserAppOrigins(args?: {
  includeLocal?: boolean;
}): string[] {
  const origins = browserAppIds.map(getProductionAppOrigin);

  if (args?.includeLocal) {
    origins.push(...browserAppIds.map(getLocalAppOrigin));
  }

  return origins;
}

export function isTrustedBrowserAppOrigin(
  origin: string,
  args?: {
    includeLocal?: boolean;
  },
): boolean {
  return getTrustedBrowserAppOrigins(args).includes(origin);
}

// Shared cross-application route ownership and locale-aware URL policy.
// Keep this in the root entrypoint while app-config exports TypeScript source.
export const supportedLocales = [
  "en",
  "es",
  "fr",
  "ht",
] as const;

export type SupportedLocale =
  (typeof supportedLocales)[number];

export type AppRouteOwner =
  | "website"
  | "student"
  | "teacher"
  | "admin"
  | "unknown";

export type KnownAppRouteOwner =
  Exclude<AppRouteOwner, "unknown">;

const localeSet =
  new Set<string>(supportedLocales);

const websiteOwnedRoots =
  new Set([
    "about",
    "auth",
    "authenticate",
    "billing",
    "contact",
    "cookies",
    "forgot-password",
    "invoices",
    "invite",
    "legal",
    "notifications",
    "payment-methods",
    "pricing",
    "privacy",
    "profile",
    "reset-password",
    "sandbox",
    "settings",
    "subscription",
    "terms",
    "verify-email",
  ]);

const studentOwnedRoots =
  new Set([
    "achievements",
    "assignments",
    "catalogs",
    "certificates",
    "courses",
    "learning",
    "my-learning",
    "practice",
    "progress",
    "subjects",
    "tutoring",
    "tutoring-sessions",
  ]);

const teacherOwnedRoots =
  new Set([
    "availability",
    "classes",
    "content",
    "grading",
    "groups",
    "payouts",
    "rates",
    "reports",
    "schedule",
    "students",
    "teacher-profile",
    "teaching-subjects",
  ]);

const adminOwnedRoots =
  new Set([
    "announcements",
    "audit",
    "curriculum",
    "email",
    "feature-flags",
    "integrations",
    "organizations",
    "payments",
    "permissions",
    "publishing",
    "roles",
    "subscriptions",
    "support",
    "system",
    "users",
  ]);

function safelyDecode(
  value: string,
) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parsePathReference(
  value: string,
) {
  const url =
    new URL(
      value || "/",
      "https://zoeskoul.invalid",
    );

  return {
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
  };
}

export function routePathSegments(
  pathname: string,
) {
  return parsePathReference(pathname)
    .pathname
    .split("/")
    .filter(Boolean)
    .map(safelyDecode);
}

export function normalizeSupportedLocale(
  locale: string | undefined,
): SupportedLocale {
  const normalized =
    locale?.trim().toLowerCase();

  return normalized &&
    localeSet.has(normalized)
    ? normalized as SupportedLocale
    : "en";
}

export function readRouteLocale(
  pathname: string,
  fallback: SupportedLocale = "en",
) {
  const first =
    routePathSegments(pathname)[0];

  return first && localeSet.has(first)
    ? first as SupportedLocale
    : fallback;
}

export function stripRouteLocale(
  pathname: string,
) {
  const segments =
    routePathSegments(pathname);
  const first = segments[0];
  const hasLocale =
    Boolean(first && localeSet.has(first));

  if (hasLocale) {
    segments.shift();
  }

  return {
    locale:
      hasLocale && first
        ? first as SupportedLocale
        : "en" as const,
    hasLocale,
    segments,
  };
}

function isOriginalSubjectFirstLearningRoute(
  segments: string[],
) {
  return Boolean(
    segments[0] &&
    segments[1] === "modules",
  );
}

export function resolveAppRouteOwner(args: {
  pathname: string;
  currentApp?: KnownAppRouteOwner;
}): AppRouteOwner {
  const { segments } =
    stripRouteLocale(args.pathname);

  if (segments.length === 0) {
    return args.currentApp ?? "website";
  }

  const root = segments[0] ?? "";

  if (websiteOwnedRoots.has(root)) {
    return "website";
  }

  if (
    args.currentApp === "student" &&
    (
      studentOwnedRoots.has(root) ||
      isOriginalSubjectFirstLearningRoute(
        segments,
      )
    )
  ) {
    return "student";
  }

  if (
    args.currentApp === "teacher" &&
    (
      teacherOwnedRoots.has(root) ||
      root === "dashboard" ||
      root === "assignments" ||
      root === "courses" ||
      root === "tutoring-sessions"
    )
  ) {
    return "teacher";
  }

  if (
    args.currentApp === "admin" &&
    (
      adminOwnedRoots.has(root) ||
      root === "dashboard" ||
      root === "catalogs" ||
      root === "subjects" ||
      root === "courses" ||
      root === "assignments" ||
      root === "tutoring"
    )
  ) {
    return "admin";
  }

  if (
    studentOwnedRoots.has(root) ||
    isOriginalSubjectFirstLearningRoute(
      segments,
    )
  ) {
    return "student";
  }

  if (teacherOwnedRoots.has(root)) {
    return "teacher";
  }

  if (adminOwnedRoots.has(root)) {
    return "admin";
  }

  return "unknown";
}

export function localizedRoutePath(args: {
  pathname: string;
  locale?: string;
}) {
  const locale =
    normalizeSupportedLocale(args.locale);
  const parsed =
    parsePathReference(args.pathname);
  const segments =
    routePathSegments(parsed.pathname);
  const hasLocale =
    Boolean(
      segments[0] &&
      localeSet.has(segments[0]),
    );
  const localizedPathname =
    parsed.pathname === "/"
      ? `/${locale}`
      : hasLocale
        ? parsed.pathname
        : `/${locale}${
            parsed.pathname.startsWith("/")
              ? parsed.pathname
              : `/${parsed.pathname}`
          }`;

  return (
    localizedPathname +
    parsed.search +
    parsed.hash
  );
}

export function buildLocalizedAppUrl(args: {
  origin: string;
  pathname: string;
  locale?: string;
}) {
  const origin =
    args.origin.replace(/\/+$/, "");

  return (
    origin +
    localizedRoutePath({
      pathname: args.pathname,
      locale: args.locale,
    })
  );
}
