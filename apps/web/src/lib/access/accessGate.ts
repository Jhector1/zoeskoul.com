export type AccessGateReason =
  | "course_invite"
  | "payment_required"
  | "private_course"
  | "assignment_required"
  | "tutoring_session"
  | "tutoring_invite";

export type AccessGateParams = {
  next: string;
  reason: string;
  back?: string | null;
  subject?: string | null;
  module?: string | null;
  resource?: string | null;
};

export function safeAccessPath(path?: string | null, fallback = "/") {
  const raw = String(path ?? "").trim();
  if (!raw) return fallback;
  if (raw.startsWith("//")) return fallback;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return fallback;
  return raw.startsWith("/") ? raw : `/${raw}`;
}

export function buildAccessGateSearchParams(args: AccessGateParams) {
  const params = new URLSearchParams();
  const next = safeAccessPath(args.next);
  params.set("next", next);
  if (args.back) params.set("back", safeAccessPath(args.back));
  params.set("reason", args.reason);
  if (args.subject) params.set("subject", args.subject);
  if (args.module) params.set("module", args.module);
  if (args.resource) params.set("resource", args.resource.slice(0, 180));
  params.set("callbackUrl", next);

  return params;
}

export function buildAuthenticateAccessHref(args: {
  locale: string;
  next: string;
  reason: AccessGateReason;
  resource?: string | null;
}) {
  const locale = encodeURIComponent(args.locale || "en");
  const params = buildAccessGateSearchParams({
    next: args.next,
    reason: args.reason,
    resource: args.resource,
  });
  return `/${locale}/authenticate?${params.toString()}`;
}
