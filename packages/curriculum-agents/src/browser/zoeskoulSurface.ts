export type ZoeSkoulSurface =
  | "authenticate"
  | "my-learning"
  | "course-modules"
  | "module-intro"
  | "review-module"
  | "practice"
  | "catalog"
  | "other";

function parts(rawUrl: string): string[] {
  return new URL(rawUrl).pathname
    .split("/")
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));
}

export function classifyZoeSkoulSurface(
  rawUrl: string,
): ZoeSkoulSurface {
  const path = parts(rawUrl);

  if (path.includes("authenticate")) {
    return "authenticate";
  }

  if (path[1] === "subjects" && path.length === 2) {
    return "my-learning";
  }

  if (
    path[1] === "subjects" &&
    path[3] === "modules" &&
    path.length === 4
  ) {
    return "course-modules";
  }

  if (
    path[1] === "subjects" &&
    path[3] === "modules" &&
    path[4] &&
    path.length === 5
  ) {
    return "module-intro";
  }

  if (
    path[1] === "subjects" &&
    path[3] === "modules" &&
    path[4] &&
    path[5] === "learn"
  ) {
    return "review-module";
  }

  if (
    path[1] === "catalog" &&
    path[3] === "subjects" &&
    path[5] === "modules" &&
    path[7] === "learn"
  ) {
    return "review-module";
  }

  if (path.includes("practice")) {
    return "practice";
  }

  if (path.includes("catalogs") || path.includes("catalog")) {
    return "catalog";
  }

  return "other";
}
