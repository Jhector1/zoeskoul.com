import type {
  MouseEvent,
} from "react";

import {
  isNextOwnedPath,
  normalizeStudentPathname,
  studentLocaleFromPath,
} from "../compat/app-route-ownership";
import {
  parsePracticeChooserRoutePathname,
} from "@zoeskoul/learning-client";

export type StudentLocation =
  | {
      kind: "my-learning";
      locale: string;
    }
  | {
      kind: "catalogs";
      locale: string;
    }
  | {
      kind: "catalog-detail";
      locale: string;
      catalogSlug: string;
    }
  | {
      kind: "assignments";
      locale: string;
    }
  | {
      kind: "subject-assignments";
      locale: string;
      subjectSlug: string;
    }
  | {
      kind: "achievements";
      locale: string;
    }
  | {
      kind: "leaderboard";
      locale: string;
    }
  | {
      kind: "progress";
      locale: string;
      subjectSlug: string;
    }
  | {
      kind: "certificate";
      locale: string;
      subjectSlug: string;
    }
  | {
      kind: "tutoring";
      locale: string;
    }
  | {
      kind: "tutoring-session";
      locale: string;
      sessionId: string;
      subjectSlug?: string;
      moduleSlug?: string;
    }
  | {
      kind: "daily-practice";
      locale: string;
      catalogSlug?: string;
      subjectSlug?: string;
      moduleSlug?: string;
    }
  | {
      kind: "module-practice";
      locale: string;
      subjectSlug: string;
      moduleSlug: string;
    }
  | {
      kind: "course";
      locale: string;
      subjectSlug: string;
    }
  | {
      kind: "module";
      locale: string;
      subjectSlug: string;
      moduleSlug: string;
    }
  | {
      kind: "lesson";
      locale: string;
      subjectSlug: string;
      moduleSlug: string;
    }
  | {
      kind: "not-found";
      locale: string;
      path: string;
    }
  | {
      kind: "website";
      locale: string;
      path: string;
    };

function segments(
  pathname: string,
) {
  return pathname
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent);
}

export function resolveStudentLocation(
  rawPathname: string,
): StudentLocation {
  const pathname =
    normalizeStudentPathname(
      rawPathname,
    );
  const locale =
    studentLocaleFromPath(
      pathname,
    );
  const parts =
    segments(pathname);

  if (
    /^(en|es|fr|ht)$/.test(
      parts[0] ?? "",
    )
  ) {
    parts.shift();
  }

  if (
    isNextOwnedPath(pathname)
  ) {
    return {
      kind: "website",
      locale,
      path: pathname,
    };
  }

  const isExactLessonTarget = (
    startIndex: number,
  ) =>
    Boolean(
      parts[startIndex] &&
      parts[startIndex + 1] &&
      parts[startIndex + 2] &&
      parts[startIndex + 3] &&
      !parts[startIndex + 4],
    );

  const dailyPracticeRoute =
    parsePracticeChooserRoutePathname(pathname);

  if (dailyPracticeRoute) {
    return {
      kind: "daily-practice",
      locale,
      ...(dailyPracticeRoute.selection.catalogSlug
        ? { catalogSlug: dailyPracticeRoute.selection.catalogSlug }
        : {}),
      ...(dailyPracticeRoute.selection.subjectSlug
        ? { subjectSlug: dailyPracticeRoute.selection.subjectSlug }
        : {}),
      ...(dailyPracticeRoute.selection.moduleSlug
        ? { moduleSlug: dailyPracticeRoute.selection.moduleSlug }
        : {}),
    };
  }

  if (
    parts[0] === "catalogs" &&
    parts[1] &&
    !parts[2]
  ) {
    return {
      kind: "catalog-detail",
      locale,
      catalogSlug: parts[1],
    };
  }

  if (
    parts[0] === "catalogs" &&
    !parts[1]
  ) {
    return {
      kind: "catalogs",
      locale,
    };
  }

  if (
    parts[0] === "achievements" &&
    !parts[1]
  ) {
    return {
      kind: "achievements",
      locale,
    };
  }

  if (
    parts[0] === "leaderboard" &&
    !parts[1]
  ) {
    return {
      kind: "leaderboard",
      locale,
    };
  }

  if (
    parts[0] === "assignments" &&
    !parts[1]
  ) {
    return {
      kind: "assignments",
      locale,
    };
  }

  if (
    (
      parts[0] === "tutoring" ||
      parts[0] === "tutoring-sessions"
    ) &&
    !parts[1]
  ) {
    return {
      kind: "tutoring",
      locale,
    };
  }

  if (
    parts[0] === "tutoring-sessions" &&
    parts[1] &&
    !parts[2]
  ) {
    return {
      kind: "tutoring-session",
      locale,
      sessionId: parts[1],
    };
  }

  if (
    parts[0] === "tutoring-sessions" &&
    parts[1] &&
    parts[2] === "subjects" &&
    parts[3] &&
    parts[4] === "modules" &&
    parts[5] &&
    parts[6] === "learn" &&
    (
      !parts[7] ||
      isExactLessonTarget(7)
    )
  ) {
    return {
      kind: "tutoring-session",
      locale,
      sessionId: parts[1],
      subjectSlug: parts[3],
      moduleSlug: parts[5],
    };
  }

  const subjectRoot =
    parts[0] === "subjects" &&
    Boolean(parts[1]);

  if (
    subjectRoot &&
    parts[2] === "assignments" &&
    !parts[3]
  ) {
    return {
      kind: "subject-assignments",
      locale,
      subjectSlug: parts[1],
    };
  }

  if (
    subjectRoot &&
    parts[2] === "progress" &&
    !parts[3]
  ) {
    return {
      kind: "progress",
      locale,
      subjectSlug: parts[1],
    };
  }

  if (
    subjectRoot &&
    parts[2] === "certificate" &&
    !parts[3]
  ) {
    return {
      kind: "certificate",
      locale,
      subjectSlug: parts[1],
    };
  }

  if (
    subjectRoot &&
    parts[2] === "modules" &&
    parts[3] &&
    parts[4] === "practice" &&
    !parts[5]
  ) {
    return {
      kind: "module-practice",
      locale,
      subjectSlug: parts[1],
      moduleSlug: parts[3],
    };
  }

  if (
    subjectRoot &&
    parts[2] === "modules" &&
    parts[3] &&
    parts[4] === "learn" &&
    (
      !parts[5] ||
      isExactLessonTarget(5)
    )
  ) {
    return {
      kind: "lesson",
      locale,
      subjectSlug: parts[1],
      moduleSlug: parts[3],
    };
  }

  if (
    subjectRoot &&
    parts[2] === "modules" &&
    parts[3] &&
    !parts[4]
  ) {
    return {
      kind: "module",
      locale,
      subjectSlug: parts[1],
      moduleSlug: parts[3],
    };
  }

  if (
    subjectRoot &&
    parts[2] === "modules" &&
    !parts[3]
  ) {
    return {
      kind: "course",
      locale,
      subjectSlug: parts[1],
    };
  }

  // Catalog-prefixed review URLs keep the same Student review player.
  if (
    parts[0] === "catalog" &&
    parts[1] &&
    parts[2] === "subjects" &&
    parts[3] &&
    parts[4] === "modules" &&
    parts[5] &&
    parts[6] === "learn" &&
    (
      !parts[7] ||
      isExactLessonTarget(7)
    )
  ) {
    return {
      kind: "lesson",
      locale,
      subjectSlug: parts[3],
      moduleSlug: parts[5],
    };
  }

  // Original subject-first learning routes.
  if (
    parts[0] &&
    parts[1] === "modules" &&
    parts[2] &&
    parts[3] === "practice" &&
    !parts[4]
  ) {
    return {
      kind: "module-practice",
      locale,
      subjectSlug: parts[0],
      moduleSlug: parts[2],
    };
  }

  if (
    parts[0] &&
    parts[1] === "modules" &&
    parts[2] &&
    parts[3] === "learn" &&
    (
      !parts[4] ||
      isExactLessonTarget(4)
    )
  ) {
    return {
      kind: "lesson",
      locale,
      subjectSlug: parts[0],
      moduleSlug: parts[2],
    };
  }

  if (
    parts[0] &&
    parts[1] === "modules" &&
    parts[2] &&
    !parts[3]
  ) {
    return {
      kind: "module",
      locale,
      subjectSlug: parts[0],
      moduleSlug: parts[2],
    };
  }

  if (
    parts.length === 2 &&
    parts[0] &&
    parts[1] === "modules"
  ) {
    return {
      kind: "course",
      locale,
      subjectSlug: parts[0],
    };
  }

  // Temporary courses/* compatibility routes.
  if (
    parts[0] === "courses" &&
    parts[1] &&
    parts[2] === "modules" &&
    parts[3] &&
    parts[4] === "practice" &&
    !parts[5]
  ) {
    return {
      kind: "module-practice",
      locale,
      subjectSlug: parts[1],
      moduleSlug: parts[3],
    };
  }

  if (
    parts[0] === "courses" &&
    parts[1] &&
    parts[2] === "modules" &&
    parts[3] &&
    parts[4] === "learn" &&
    (
      !parts[5] ||
      isExactLessonTarget(5)
    )
  ) {
    return {
      kind: "lesson",
      locale,
      subjectSlug: parts[1],
      moduleSlug: parts[3],
    };
  }

  if (
    parts[0] === "courses" &&
    parts[1] &&
    parts[2] === "modules" &&
    parts[3] &&
    !parts[4]
  ) {
    return {
      kind: "module",
      locale,
      subjectSlug: parts[1],
      moduleSlug: parts[3],
    };
  }

  if (
    parts[0] === "courses" &&
    parts[1] &&
    !parts[2]
  ) {
    return {
      kind: "course",
      locale,
      subjectSlug: parts[1],
    };
  }

  if (
    (
      parts[0] === "subjects" ||
      parts[0] === "learning" ||
      parts[0] === "my-learning"
    ) &&
    !parts[1]
  ) {
    return {
      kind: "my-learning",
      locale,
    };
  }

  /*
   * Known cross-app routes leave through their registered owner. Unknown
   * student paths stay on this origin and render the student 404 page.
   */
  return {
    kind: "not-found",
    locale,
    path: pathname,
  };
}

export function resolveStudentShellLocation(
  pathname: string,
): StudentLocation {
  const normalizedPathname =
    normalizeStudentPathname(
      pathname,
    );
  const resolved =
    resolveStudentLocation(
      normalizedPathname,
    );

  /*
   * The shell may redirect only routes explicitly owned by Next.
   * A localized root or an unknown student URL must never flash
   * "Opening the website" and leave the student origin.
   */
  if (
    resolved.kind === "website" &&
    !isNextOwnedPath(
      normalizedPathname,
    )
  ) {
    return {
      kind: "not-found",
      locale:
        studentLocaleFromPath(
          normalizedPathname,
        ),
      path: normalizedPathname,
    };
  }

  return resolved;
}

export function coursePath(
  subjectSlug: string,
  locale = "en",
) {
  return `/${locale}/subjects/${encodeURIComponent(
    subjectSlug,
  )}/modules`;
}

export function modulePath(
  subjectSlug: string,
  moduleSlug: string,
  locale = "en",
) {
  return `${coursePath(
    subjectSlug,
    locale,
  )}/${encodeURIComponent(
    moduleSlug,
  )}`;
}

export function lessonPath(
  subjectSlug: string,
  moduleSlug: string,
  locale = "en",
) {
  return `${modulePath(
    subjectSlug,
    moduleSlug,
    locale,
  )}/learn`;
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
  window.history.pushState(
    {},
    "",
    href,
  );
  window.dispatchEvent(
    new Event(
      "zoeskoul:vite-navigation",
    ),
  );
}

export function isPublicStudentPath(
  rawPathname: string,
): boolean {
  const location =
    resolveStudentLocation(rawPathname);

  return (
    location.kind === "catalogs" ||
    location.kind === "catalog-detail" ||
    location.kind === "achievements" ||
    location.kind === "leaderboard"
  );
}
