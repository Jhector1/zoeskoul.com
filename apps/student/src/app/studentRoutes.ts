import type { MouseEvent } from "react";

export type StudentRouteId =
  | "learning"
  | "assignments"
  | "tutoring";

export type StudentRoute = {
  id: StudentRouteId;
  href: string;
  label: string;
  description: string;
};

export const studentRoutes: readonly StudentRoute[] = [
  {
    id: "learning",
    href: "/learning",
    label: "My Learning",
    description: "Continue enrolled, assigned, and recently opened courses.",
  },
  {
    id: "assignments",
    href: "/assignments",
    label: "Assignments",
    description: "Review assigned courses, due dates, and completion status.",
  },
  {
    id: "tutoring",
    href: "/tutoring",
    label: "Tutoring",
    description: "Open upcoming and previous tutoring sessions.",
  },
] as const;

export function resolveStudentRoute(pathname: string): StudentRoute {
  return (
    studentRoutes.find((route) => pathname === route.href) ??
    studentRoutes[0]
  );
}

export function navigateStudentApp(
  event: MouseEvent<HTMLAnchorElement>,
  href: string,
) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  event.preventDefault();

  if (window.location.pathname === href) {
    return;
  }

  window.history.pushState({}, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
