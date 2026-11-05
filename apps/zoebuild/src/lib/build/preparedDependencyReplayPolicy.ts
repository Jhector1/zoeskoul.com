/** Source-token fence for trusted preview-dependency preparation.
 * The caller may permit an equal token ONLY after a successful, authorized
 * dependency bootstrap, which can adopt an exact lock without CAS advancement.
 * A stale/invalid head must never replace the editor or its preview.
 */
export function mayHydratePreparedDependencySource(
  attemptedVersion: number,
  authoritativeVersion: number,
  allowEqualAfterBootstrap = false,
): boolean {
  return Number.isSafeInteger(attemptedVersion) && attemptedVersion > 0 &&
    Number.isSafeInteger(authoritativeVersion) && authoritativeVersion > 0 &&
    (authoritativeVersion > attemptedVersion ||
      (allowEqualAfterBootstrap && authoritativeVersion === attemptedVersion));
}
