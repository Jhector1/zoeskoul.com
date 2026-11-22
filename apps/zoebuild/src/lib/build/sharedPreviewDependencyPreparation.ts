/** Browser coordination only: the authenticated CAS-bound bootstrap route
 * remains responsible for manifest policy, lock generation and signatures.
 * A local file check is only a reason to prepare; it is never approval. */
type RootNode = Readonly<{ kind: string; parentId: string | null; name: string }>;
export function needsSharedPreviewDependencyPreparation(nodes: readonly RootNode[]): boolean {
  const has = (name: string) => nodes.some(n => n.kind === "file" && n.parentId === null && n.name === name);
  return !has("pnpm-lock.yaml") || !has("zoebuild-dependency-approval.json");
}
export type SavedDependencySelection = Readonly<{
  buildProjectId: string; sourceVersion: number; restoredDependencyPinned: boolean;
}>;
export function savedDependencySelectionKey(input: SavedDependencySelection): string {
  return JSON.stringify([input.buildProjectId,input.sourceVersion,input.restoredDependencyPinned]);
}
export function requestSavedPreviewDependencyPreparation(input: SavedDependencySelection,
    fetchClient: typeof fetch = fetch): Promise<Response> {
  return fetchClient(`/api/build/projects/${encodeURIComponent(input.buildProjectId)}/dependency-lock/bootstrap`, {
    method: "POST", credentials: "same-origin", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({reconcileExisting:true,baseVersion:input.sourceVersion,
      autoRestoreDependencies:input.restoredDependencyPinned,
      autoPrepareProjectDependencies:!input.restoredDependencyPinned}),
  });
}
type PreparationOutcome = Readonly<{ kind: "prepared" | "error" | "superseded"; message: string }>;
export async function prepareSharedPreviewDependencies(input: SavedDependencySelection & Readonly<{
  isCurrent: () => boolean;
  reconcileConflict: (version: number) => Promise<boolean>;
  reconcilePrepared: (version: number) => Promise<boolean>;
  fetchClient?: typeof fetch;
}>): Promise<PreparationOutcome> {
  const superseded: PreparationOutcome = {kind:"superseded",message:"Saved source changed during dependency preparation."};
  const error = (message: string): PreparationOutcome => ({kind:"error",message});
  if (!input.isCurrent()) return superseded;
  try {
    const response = await requestSavedPreviewDependencyPreparation(input,input.fetchClient);
    const data = await response.json().catch(() => null) as null | {ok?:boolean;code?:string;bootstrap?:{source?:{sourceVersion?:number}}};
    if (!input.isCurrent()) return superseded;
    const version = data?.bootstrap?.source?.sourceVersion;
    const success = response.ok && data?.ok === true && typeof version === "number" &&
      Number.isSafeInteger(version) && version >= input.sourceVersion;
    const stale = response.status === 409 && ["BUILD_HISTORY_STALE","BUILD_SOURCE_CONFLICT","BUILD_DEPENDENCY_ALREADY_APPROVED"].includes(data?.code ?? "");
    if (success || stale) {
      let synchronized = false;
      if (stale || (typeof version === "number" && version > input.sourceVersion))
        synchronized = await input.reconcileConflict(input.sourceVersion);
      if (!synchronized && input.isCurrent()) synchronized = await input.reconcilePrepared(input.sourceVersion);
      if (synchronized) return {kind:"prepared",message:"Synchronizing the prepared saved source…"};
      if (!input.isCurrent()) return superseded;
      return error("Dependencies are prepared or the saved source changed. Reload the saved project when your edits are safe.");
    }
    if (response.status === 429) return error("Dependency preparation is busy. Retry preview when capacity is available.");
    const code = typeof data?.code === "string" && /^BUILD_[A-Z0-9_]{3,96}$/.test(data.code) ? data.code : "BUILD_PREPARATION_UNAVAILABLE";
    return error(`ZoeBuild could not prepare the saved dependencies (${code}). Review the saved project before retrying.`);
  } catch { return input.isCurrent() ? error("Dependency preparation is unavailable. Retry the saved project.") : superseded; }
}
