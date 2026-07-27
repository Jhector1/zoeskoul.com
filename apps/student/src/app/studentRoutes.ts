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

export type StudentLocation =
  | {
      kind: "page";
      route: StudentRoute;
    }
  | {
      kind: "course";
      subjectSlug: string;
    }
  | {
      kind: "module";
      subjectSlug: string;
      moduleSlug: string;
    }
  | {
      kind: "lesson";
      subjectSlug: string;
      moduleSlug: string;
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

function cleanPathSegments(pathname: string): string[] {
  return pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));
}

export function resolveStudentLocation(
  pathname: string,
): StudentLocation {
  const segments = cleanPathSegments(pathname);

  if (
    segments.length === 5 &&
    segments[0] === "courses" &&
    segments[2] === "modules" &&
    segments[4] === "learn"
  ) {
    return {
      kind: "lesson",
      subjectSlug: segments[1],
      moduleSlug: segments[3],
    };
  }

  if (
    segments.length === 4 &&
    segments[0] === "courses" &&
    segments[2] === "modules"
  ) {
    return {
      kind: "module",
      subjectSlug: segments[1],
      moduleSlug: segments[3],
    };
  }

  if (
    segments.length === 2 &&
    segments[0] === "courses"
  ) {
    return {
      kind: "course",
      subjectSlug: segments[1],
    };
  }

  const route =
    studentRoutes.find(
      (item) => pathname === item.href,
    ) ?? studentRoutes[0];

  return {
    kind: "page",
    route,
  };
}

export function activeStudentRouteId(
  location: StudentLocation,
): StudentRouteId {
  return location.kind === "page"
    ? location.route.id
    : "learning";
}

export function coursePath(subjectSlug: string): string {
  return `/courses/${encodeURIComponent(subjectSlug)}`;
}

export function modulePath(
  subjectSlug: string,
  moduleSlug: string,
): string {
  return `${coursePath(subjectSlug)}/modules/${encodeURIComponent(moduleSlug)}`;
}

export function lessonPath(
  subjectSlug: string,
  moduleSlug: string,
): string {
  return `${modulePath(subjectSlug, moduleSlug)}/learn`;
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
