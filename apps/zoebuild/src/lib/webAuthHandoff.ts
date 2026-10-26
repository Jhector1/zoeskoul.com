import "server-only";
import { resolveZoeBuildOrigins } from "./appOrigins";
import { safeReturnPath } from "@/lib/auth/buildHandoff";

export function buildZoeBuildWebAuthenticateUrl(args: {
  callbackUrl?: string | null;
  locale?: string;
}): string {
  const { zoebuildOrigin } = resolveZoeBuildOrigins();
  let returnPath = args.callbackUrl || "/en/projects";
  try {
    if (/^https?:/i.test(returnPath)) {
      const url = new URL(returnPath);
      returnPath = url.origin === new URL(zoebuildOrigin).origin ? url.pathname + url.search : "/en/projects";
    }
  } catch { returnPath = "/en/projects"; }
  const target = new URL("/api/auth/handoff/start", zoebuildOrigin);
  target.searchParams.set("returnTo", safeReturnPath(returnPath));
  target.searchParams.set("locale", args.locale || "en");
  return target.toString();
}
