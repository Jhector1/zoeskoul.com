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

export type ZoeSkoulDeploymentEnvironment =
  | "development"
  | "test"
  | "preview"
  | "production";

export function getLocalAppOrigin(appId: ZoeSkoulAppId): string {
  return `http://localhost:${zoeSkoulApps[appId].localPort}`;
}

export function getProductionAppOrigin(appId: ZoeSkoulAppId): string {
  return zoeSkoulApps[appId].productionOrigin;
}

export function normalizeConfiguredAppOrigin(
  value: string | null | undefined,
): string | null {
  const candidate = value?.trim();

  if (!candidate) {
    return null;
  }

  try {
    const parsed = new URL(candidate);

    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }

    return parsed.origin;
  } catch {
    return null;
  }
}

function isLocalBrowserOrigin(
  value: string | null | undefined,
): boolean {
  const origin = normalizeConfiguredAppOrigin(value);

  if (!origin) {
    return false;
  }

  const hostname = new URL(origin).hostname;

  return hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]";
}

/**
 * Resolves a browser application's deployment origin without allowing a
 * preview build to silently escape to a canonical production application.
 * A null result deliberately means that preview deployment configuration is
 * missing or invalid and the caller must fail closed on its current origin.
 */
export function resolveAppOrigin(args: {
  appId: ZoeSkoulAppId;
  configuredOrigin?: string | null;
  currentOrigin?: string | null;
  deploymentEnvironment: ZoeSkoulDeploymentEnvironment;
}): string | null {
  const configuredOrigin = normalizeConfiguredAppOrigin(
    args.configuredOrigin,
  );

  if (configuredOrigin) {
    return configuredOrigin;
  }

  if (isLocalBrowserOrigin(args.currentOrigin)) {
    return getLocalAppOrigin(args.appId);
  }

  if (
    args.deploymentEnvironment === "development" ||
    args.deploymentEnvironment === "test"
  ) {
    return getLocalAppOrigin(args.appId);
  }

  if (args.deploymentEnvironment === "production") {
    return getProductionAppOrigin(args.appId);
  }

  return null;
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

// Desired ownership describes the final application boundary. It is kept
// separate from the legacy/current resolver so route declarations cannot
// accidentally activate a production cross-app redirect before the target
// application implements and validates the route.
const desiredWebsiteOwnedRoots = new Set(
  [...websiteOwnedRoots].filter((root) => root !== "sandbox"),
);
desiredWebsiteOwnedRoots.add("c");
desiredWebsiteOwnedRoots.add("invitations");

const desiredStudentOwnedRoots = new Set([
  ...studentOwnedRoots,
  "leaderboard",
  "projects",
  "sandbox",
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

function isCatalogPrefixedLearningRoute(
  segments: string[],
) {
  return Boolean(
    segments[0] === "catalog" &&
    segments[1] &&
    segments[2] === "subjects" &&
    segments[3] &&
    segments[4] === "modules" &&
    segments[5] &&
    segments[6] === "learn",
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

/**
 * Returns the application that should own a route after the multi-app
 * separation is complete. This does not imply that the route is ready for
 * production cutover.
 */
export function resolveDesiredAppRouteOwner(args: {
  pathname: string;
  currentApp?: KnownAppRouteOwner;
}): AppRouteOwner {
  const { segments } =
    stripRouteLocale(args.pathname);

  if (segments.length === 0) {
    return args.currentApp ?? "website";
  }

  const root = segments[0] ?? "";

  if (desiredWebsiteOwnedRoots.has(root)) {
    return "website";
  }

  if (
    args.currentApp === "student" &&
    (
      desiredStudentOwnedRoots.has(root) ||
      isOriginalSubjectFirstLearningRoute(segments) ||
      isCatalogPrefixedLearningRoute(segments)
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
    desiredStudentOwnedRoots.has(root) ||
    isOriginalSubjectFirstLearningRoute(segments) ||
    isCatalogPrefixedLearningRoute(segments)
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

/**
 * Locale-stripped route patterns that Web may actively hand off to Student.
 * Each route must be implemented, tested, browser-validated, and
 * production-qualified before it is added here.
 */
export const studentRouteCutoverAllowlist: readonly string[] = [
  "/practice/daily",
  "/catalogs",
  "/catalogs/:catalogSlug",
  "/subjects",
  "/assignments",
  "/tutoring-sessions",
  "/achievements",
  "/leaderboard",
  "/subjects/:subjectSlug/progress",
  "/subjects/:subjectSlug/certificate",
  "/subjects/:subjectSlug/assignments",
  "/tutoring-sessions/:sessionId",
  "/tutoring-sessions/:sessionId/subjects/:subjectSlug/modules/:moduleSlug/learn",
  "/tutoring-sessions/:sessionId/subjects/:subjectSlug/modules/:moduleSlug/learn/:sectionSlug/:topicId/:targetKind/:targetSlug",
  "/subjects/:subjectSlug/modules",
  "/subjects/:subjectSlug/modules/:moduleSlug",
  "/subjects/:subjectSlug/modules/:moduleSlug/practice",
  "/subjects/:subjectSlug/modules/:moduleSlug/learn",
  "/subjects/:subjectSlug/modules/:moduleSlug/learn/:sectionSlug/:topicId/:targetKind/:targetSlug",
  "/catalog/:catalogSlug/subjects/:subjectSlug/modules/:moduleSlug/learn",
  "/catalog/:catalogSlug/subjects/:subjectSlug/modules/:moduleSlug/learn/:sectionSlug/:topicId/:targetKind/:targetSlug",
];

function matchesStudentRouteCutoverPattern(args: {
  pattern: string;
  segments: string[];
}): boolean {
  const patternSegments = routePathSegments(args.pattern);

  if (patternSegments.length !== args.segments.length) {
    return false;
  }

  return patternSegments.every((patternSegment, index) => {
    const segment = args.segments[index];

    if (!segment) {
      return false;
    }

    if (patternSegment.startsWith(":")) {
      return !segment.includes("/");
    }

    return patternSegment === segment;
  });
}

export function isStudentRouteCutoverReady(args: {
  pathname: string;
}): boolean {
  if (
    resolveDesiredAppRouteOwner({
      pathname: args.pathname,
    }) !== "student"
  ) {
    return false;
  }

  const { segments } = stripRouteLocale(args.pathname);

  return studentRouteCutoverAllowlist.some((pattern) =>
    matchesStudentRouteCutoverPattern({
      pattern,
      segments,
    }),
  );
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
  const origin = normalizeConfiguredAppOrigin(
    args.origin,
  );

  if (!origin) {
    throw new TypeError("A valid application origin is required.");
  }

  return new URL(
    localizedRoutePath({
      pathname: args.pathname,
      locale: args.locale,
    }),
    origin,
  ).toString();
}
