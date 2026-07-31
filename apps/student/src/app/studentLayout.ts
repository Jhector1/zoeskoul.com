export type StudentLayoutKind =
  | "website"
  | "navigation"
  | "workspace";

export type StudentLayoutLocation = {
  kind: string;
};

/**
 * Mirrors the old Next route-group layout ownership.
 *
 * Navigation pages use the full HeaderSlick.
 * Learning and practice workspaces already render their own compact header.
 */
export function resolveStudentLayout(
  location: StudentLayoutLocation,
): StudentLayoutKind {
  switch (location.kind) {
    case "website":
      return "website";

    case "lesson":
    case "daily-practice":
    case "module-practice":
      return "workspace";

    default:
      return "navigation";
  }
}

export function shouldRenderGlobalStudentHeader(
  location: StudentLayoutLocation,
) {
  return (
    resolveStudentLayout(location) ===
    "navigation"
  );
}
