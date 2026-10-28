/** History navigation is complete only for the selected saved source head.
 * A ready frame from the previous version must never release the transition.
 * An error for the selected source can release to the error UI (never old src).
 */
export function historySwitchHasSettled(input: Readonly<{
  expectedSourceVersion:number; hydratedSourceVersion:number;
  acknowledgedSourceVersion:number|null; attemptedSourceVersion:number|null; previewState:string;
}>): boolean {
  if (input.expectedSourceVersion !== input.hydratedSourceVersion) return false;
  if (input.previewState === "error")
    return input.attemptedSourceVersion === input.expectedSourceVersion;
  return input.previewState === "ready" &&
    input.acknowledgedSourceVersion === input.expectedSourceVersion;
}
