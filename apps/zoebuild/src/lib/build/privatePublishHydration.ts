import "server-only";
import { privatePublishSelection } from "./privatePublishControl";

/** Only an already owner-scoped workspace may advertise the private status lane.
 * This is a UI scheduling hint, never a grant. Every API retains its own fresh
 * authority, ownership, origin and project checks. The client independently
 * requires the exact local origin before requesting history. */
export function canHydratePrivatePublishing(
  project: Readonly<{buildProjectId:string;status:string;stackId:string|null}>,
  userId: string | null | undefined,
  env: Readonly<Record<string,string|undefined>> = process.env,
): boolean {
  return Boolean(userId && project.status !== "archived" &&
    project.stackId === "tanstack-start-v1" &&
    privatePublishSelection("http://localhost:3004",project.buildProjectId,env)?.ownerId === userId);
}
