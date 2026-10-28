import type { BuildWorkspaceShellProject } from "@/app/[locale]/projects/[buildProjectId]/BuildWorkspaceClient";

/**
 * Re-read the canonical saved source after a successful AI mutation.
 * Never trust the mutation's client-side proposal as the new workspace.
 */
export async function fetchAuthoritativeAppliedProject(input: Readonly<{
  buildProjectId: string;
  expectedSourceVersion: number;
  fetchImpl?: typeof fetch;
}>): Promise<BuildWorkspaceShellProject> {
  if (!Number.isSafeInteger(input.expectedSourceVersion) || input.expectedSourceVersion < 1) {
    throw new Error("Invalid authoritative source version");
  }
  const response = await (input.fetchImpl ?? fetch)(
    `/api/build/projects/${encodeURIComponent(input.buildProjectId)}`,
    { credentials: "same-origin", cache: "no-store" },
  );
  const payload = await response.json().catch(() => null) as {
    ok?: boolean;
    project?: Partial<BuildWorkspaceShellProject>;
  } | null;
  const project = payload?.project;
  if (!response.ok || payload?.ok !== true || !project ||
      project.buildProjectId !== input.buildProjectId ||
      project.sourceVersion !== input.expectedSourceVersion ||
      !project.workspace || project.workspace.version !== 2 ||
      !Array.isArray(project.workspace.nodes) ||
      typeof project.codeProjectId !== "string" ||
      typeof project.title !== "string") {
    throw new Error("Saved project snapshot did not match the applied source version");
  }
  return project as BuildWorkspaceShellProject;
}

/** Retrieve the server-owned current project after a preview 409. Unlike an AI
 * apply, a conflict has no trustworthy expected new version in the browser.
 * Callers must check unsaved edits and concurrent actions before applying it.
 * Never writes or creates revision history.
 */
export async function fetchAuthoritativeCurrentBuildProject(input: Readonly<{
  buildProjectId: string;
  fetchImpl?: typeof fetch;
}>): Promise<BuildWorkspaceShellProject> {
  const response = await (input.fetchImpl ?? fetch)(
    `/api/build/projects/${encodeURIComponent(input.buildProjectId)}`,
    {credentials:"same-origin",cache:"no-store"},
  );
  const data = await response.json().catch(() => null) as {
    ok?: boolean;project?: Partial<BuildWorkspaceShellProject>;
  } | null;
  const project = data?.project;
  if (!response.ok || data?.ok !== true || !project ||
      project.buildProjectId !== input.buildProjectId ||
      !Number.isSafeInteger(project.sourceVersion) ||
      (project.sourceVersion ?? 0) < 1 ||
      !project.workspace || project.workspace.version !== 2 ||
      !Array.isArray(project.workspace.nodes) ||
      typeof project.codeProjectId !== "string" ||
      typeof project.title !== "string") {
    throw new Error("Could not verify the latest saved project source");
  }
  return project as BuildWorkspaceShellProject;
}
