export function normalizeTeachingLocale(locale: string | null | undefined) {
  const value = String(locale ?? "").trim();
  return /^[a-z]{2}(?:-[A-Z]{2})?$/.test(value) ? value : "en";
}

export function resolveTeachingPageRedirect(args: {
  authenticated: boolean;
  allowed: boolean;
  locale?: string | null;
  callbackPath?: string;
}) {
  if (args.allowed) return null;

  const locale = normalizeTeachingLocale(args.locale);
  if (args.authenticated) return `/${locale}/assignments`;

  const callbackPath = args.callbackPath?.startsWith("/")
    ? args.callbackPath
    : "/admin/course-assignments";
  const callbackUrl = `/${locale}${callbackPath}`;
  return `/api/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}
