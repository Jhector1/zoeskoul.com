/** A safe automatic preview attempt already ran before this fallback.
 * Only dependency-specific safety blocks receive a friendly recovery screen;
 * transport, capacity, compile and source-conflict errors stay distinct.
 */
export function needsDependencyRecoveryAssistance(
  state: string | undefined, message: string | null | undefined,
): boolean {
  if (state !== "error" || typeof message !== "string") return false;
  return [
    "ZoeBuild couldn't safely prepare this saved version.",
    "Project dependencies require owner-approved, versioned resolution.",
    "dependency lock needs explicit preparation",
    "could not automatically verify its historical dependency lock",
    "The saved historical dependency lock could not be reused automatically.",
    "Automatic dependency recovery was attempted.",
    "Project dependency signature was not issued by ZoeBuild.",
  ].some(fragment => message.includes(fragment));
}
