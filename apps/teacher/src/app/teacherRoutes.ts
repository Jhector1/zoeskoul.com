const LOCALE_RE =
  /^(en|es|fr|ht)$/;

export type TeacherLocation =
  | {
      kind: "classes";
      locale: string;
    }
  | {
      kind: "class-new";
      locale: string;
    }
  | {
      kind: "class-detail";
      locale: string;
      classId: string;
    }
  | {
      kind: "assignments";
      locale: string;
    }
  | {
      kind: "assignment-new";
      locale: string;
    }
  | {
      kind: "assignment-detail";
      locale: string;
      assignmentId: string;
    }
  | {
      kind: "reports";
      locale: string;
    }
  | {
      kind: "school";
      locale: string;
    }
  | {
      kind: "tutoring";
      locale: string;
    };

function segments(pathname: string) {
  return pathname
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent);
}

export function resolveTeacherLocation(
  pathname: string,
  fallbackLocale = "en",
): TeacherLocation {
  const parts = segments(pathname);

  const locale =
    LOCALE_RE.test(parts[0] ?? "")
      ? parts.shift()!
      : fallbackLocale;

  if (
    parts[0] === "classes" &&
    !parts[1]
  ) {
    return {
      kind: "classes",
      locale,
    };
  }

  if (
    parts[0] === "classes" &&
    parts[1] === "new" &&
    !parts[2]
  ) {
    return {
      kind: "class-new",
      locale,
    };
  }

  if (
    parts[0] === "classes" &&
    parts[1] &&
    !parts[2]
  ) {
    return {
      kind: "class-detail",
      locale,
      classId: parts[1],
    };
  }

  if (
    parts[0] === "school" &&
    !parts[1]
  ) {
    return { kind: "school", locale };
  }

  if (
    parts[0] === "reports" &&
    !parts[1]
  ) {
    return {
      kind: "reports",
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
    parts[0] === "assignments" &&
    parts[1] === "new" &&
    !parts[2]
  ) {
    return {
      kind: "assignment-new",
      locale,
    };
  }

  if (
    parts[0] === "assignments" &&
    parts[1] &&
    !parts[2]
  ) {
    return {
      kind: "assignment-detail",
      locale,
      assignmentId: parts[1],
    };
  }

  return {
    kind: "tutoring",
    locale,
  };
}
