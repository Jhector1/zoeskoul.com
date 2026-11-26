export const DEPARTMENT_DEFINITIONS = [
  {
    id: "computer-science",
    title: "Computer Science",
    catalogFamilies: [
      "programming",
      "data",
      "developer-tools",
      "systems",
      "cybersecurity",
      "security",
    ],
  },
  {
    id: "languages",
    title: "Languages",
    catalogFamilies: ["languages", "language"],
  },
  {
    id: "mathematics",
    title: "Mathematics",
    catalogFamilies: ["mathematics", "math"],
  },
  {
    id: "science",
    title: "Science",
    catalogFamilies: ["science"],
  },
  {
    id: "business",
    title: "Business",
    catalogFamilies: ["business"],
  },
  {
    id: "art-design",
    title: "Art & Design",
    catalogFamilies: ["art", "design", "art-design"],
  },
] as const;

export type DepartmentId =
  (typeof DEPARTMENT_DEFINITIONS)[number]["id"] | string;

export type DepartmentPresentation = {
  id: DepartmentId;
  title: string;
};

function normalizeKey(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleFromKey(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function resolveDepartmentPresentation(args: {
  catalogFamily?: string | null;
  catalogSlug?: string | null;
}): DepartmentPresentation {
  const family = normalizeKey(args.catalogFamily);

  for (const department of DEPARTMENT_DEFINITIONS) {
    if (
      department.catalogFamilies.some(
        (candidate) => normalizeKey(candidate) === family,
      )
    ) {
      return {
        id: department.id,
        title: department.title,
      };
    }
  }

  const fallback = family || normalizeKey(args.catalogSlug) || "other";

  return {
    id: fallback,
    title: fallback === "other" ? "Other" : titleFromKey(fallback),
  };
}
