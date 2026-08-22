export type PracticeChooserRouteDepth =
  | "root"
  | "catalog"
  | "course"
  | "module";

export type PracticeChooserRouteSelection = {
  catalogSlug: string;
  subjectSlug: string;
  moduleSlug: string;
};

export type PracticeChooserRouteState = {
  locale: string;
  depth: PracticeChooserRouteDepth;
  selection: PracticeChooserRouteSelection;
};

const LOCALE_PATTERN = /^(en|es|fr|ht)$/;

function cleanRequiredSegment(value: unknown, label: string) {
  const text = String(value ?? "").trim();
  if (!text || text.includes("/")) {
    throw new Error(`${label} is required for this Practice chooser route.`);
  }
  return text;
}

function decodeSegments(pathname: string) {
  const url = new URL(String(pathname ?? "") || "/", "https://zoeskoul.invalid");
  const out: string[] = [];

  for (const raw of url.pathname.split("/").filter(Boolean)) {
    try {
      const decoded = decodeURIComponent(raw);
      if (!decoded || decoded.includes("/")) return null;
      out.push(decoded);
    } catch {
      return null;
    }
  }

  return out;
}

/**
 * Pure navigation codec for the one Practice chooser hierarchy.
 *
 * This owns browser navigation shape only. It never changes Practice progress,
 * authored pool membership, Daily allowance, or canonical learner/module state.
 */
export function parsePracticeChooserRoutePathname(
  pathname: string,
): PracticeChooserRouteState | null {
  const parts = decodeSegments(pathname);
  if (!parts) return null;

  let locale = "en";
  if (LOCALE_PATTERN.test(parts[0] ?? "")) {
    locale = parts.shift()!;
  }

  if (parts[0] !== "practice" || parts[1] !== "daily") return null;

  if (!parts[2]) {
    return {
      locale,
      depth: "root",
      selection: {
        catalogSlug: "",
        subjectSlug: "",
        moduleSlug: "",
      },
    };
  }

  if (
    parts[2] === "catalog" &&
    parts[3] &&
    !parts[4]
  ) {
    return {
      locale,
      depth: "catalog",
      selection: {
        catalogSlug: parts[3],
        subjectSlug: "",
        moduleSlug: "",
      },
    };
  }

  if (
    parts[2] === "catalog" &&
    parts[3] &&
    parts[4] === "course" &&
    parts[5] &&
    !parts[6]
  ) {
    return {
      locale,
      depth: "course",
      selection: {
        catalogSlug: parts[3],
        subjectSlug: parts[5],
        moduleSlug: "",
      },
    };
  }

  if (
    parts[2] === "catalog" &&
    parts[3] &&
    parts[4] === "course" &&
    parts[5] &&
    parts[6] === "module" &&
    parts[7] &&
    !parts[8]
  ) {
    return {
      locale,
      depth: "module",
      selection: {
        catalogSlug: parts[3],
        subjectSlug: parts[5],
        moduleSlug: parts[7],
      },
    };
  }

  return null;
}

export function buildPracticeChooserRouteHref(args: {
  locale: string;
  selection: PracticeChooserRouteSelection;
}) {
  const locale = cleanRequiredSegment(args.locale, "locale");
  const catalogSlug = String(args.selection.catalogSlug ?? "").trim();
  const subjectSlug = String(args.selection.subjectSlug ?? "").trim();
  const moduleSlug = String(args.selection.moduleSlug ?? "").trim();

  const root = `/${encodeURIComponent(locale)}/practice/daily`;

  if (!catalogSlug) {
    if (subjectSlug || moduleSlug) {
      throw new Error(
        "Practice chooser route hierarchy requires catalog before course/module.",
      );
    }
    return root;
  }

  const catalog = cleanRequiredSegment(catalogSlug, "catalogSlug");
  const catalogHref =
    `${root}/catalog/${encodeURIComponent(catalog)}`;

  if (!subjectSlug) {
    if (moduleSlug) {
      throw new Error(
        "Practice chooser route hierarchy requires course before module.",
      );
    }
    return catalogHref;
  }

  const subject = cleanRequiredSegment(subjectSlug, "subjectSlug");
  const courseHref =
    `${catalogHref}/course/${encodeURIComponent(subject)}`;

  if (!moduleSlug) return courseHref;

  const module = cleanRequiredSegment(moduleSlug, "moduleSlug");
  return `${courseHref}/module/${encodeURIComponent(module)}`;
}
