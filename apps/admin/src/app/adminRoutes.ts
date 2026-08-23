export type AdminRoute =
  | { kind: "overview" }
  | { kind: "questions" }
  | { kind: "curriculum" }
  | { kind: "public-challenges" }
  | { kind: "promotions" }
  | { kind: "learner"; actorKey: string }
  | { kind: "not-found" };

function cleanPathname(pathname: string) {
  const value = pathname.split("?")[0]?.split("#")[0] ?? "/";
  const normalized = value.replace(/\/{2,}/g, "/").replace(/\/$/, "");
  return normalized || "/";
}

export function resolveAdminRoute(pathname: string): AdminRoute {
  const path = cleanPathname(pathname);

  if (path === "/" || path === "/admin") {
    return { kind: "overview" };
  }

  if (path === "/questions" || path === "/admin/questions") {
    return { kind: "questions" };
  }

  if (
    path === "/curriculum" ||
    path === "/curriculum/drafts" ||
    path === "/admin/curriculum"
  ) {
    return { kind: "curriculum" };
  }

  if (
    path === "/public-challenges" ||
    path === "/admin/public-challenges"
  ) {
    return { kind: "public-challenges" };
  }

  if (path === "/promotions" || path === "/admin/promotions") {
    return { kind: "promotions" };
  }

  const match = path.match(/^\/(?:admin\/)?learners\/([^/]+)$/);
  if (match?.[1]) {
    try {
      return {
        kind: "learner",
        actorKey: decodeURIComponent(match[1]),
      };
    } catch {
      return { kind: "not-found" };
    }
  }

  return { kind: "not-found" };
}

export function learnerHref(actorKey: string) {
  return `/learners/${encodeURIComponent(actorKey)}`;
}
