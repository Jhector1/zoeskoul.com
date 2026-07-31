import { buildAuthenticateAccessHref } from "@/lib/access/accessGate";

function segment(value: string) {
  return encodeURIComponent(value);
}

export function buildTutoringPath(args: {
  locale: string;
  segments?: string[];
}) {
  const locale = segment(args.locale || "en");
  const suffix = (args.segments ?? []).map(segment).join("/");
  return `/${locale}/tutoring-sessions${suffix ? `/${suffix}` : ""}`;
}

export function buildTutoringSignInHref(args: {
  locale: string;
  segments?: string[];
}) {
  return buildAuthenticateAccessHref({
    locale: args.locale,
    next: buildTutoringPath(args),
    reason: "tutoring_session",
  });
}
