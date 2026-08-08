import "server-only";

import { TUTORING_SESSION_HEADER } from "@zoeskoul/learning-contracts/tutoring/contentRequestProtocol";
import { getTutoringRequestAccess } from "./sessionRequestAccess";
import { canMutateTutoringWorkspace } from "./sessionWorkspaceAccessCore";
import { resolveTutoringRequestWorkspace } from "./sessionWorkspaceRequest";

function jsonError(message: string, code: string, status: number) {
  return Response.json({ message, code }, { status });
}

/**
 * Practice endpoints are shared by normal learning and tutoring. When a
 * tutoring request identifies a read-only master/reference/learner workspace,
 * reject all mutation-oriented practice actions at the server boundary.
 */
export async function enforceTutoringWorkspaceMutationAccess(
  request: Request,
): Promise<Response | null> {
  const sessionId = String(
    request.headers.get(TUTORING_SESSION_HEADER) ?? "",
  ).trim();
  if (!sessionId) return null;

  const access = await getTutoringRequestAccess(sessionId);
  if (!access) {
    return jsonError(
      "You do not have access to this tutoring session.",
      "TUTORING_SESSION_FORBIDDEN",
      403,
    );
  }

  const { resolved } = await resolveTutoringRequestWorkspace({
    request,
    access,
  });

  if (!resolved) {
    return jsonError(
      "This tutoring workspace is unavailable.",
      "TUTORING_WORKSPACE_FORBIDDEN",
      403,
    );
  }

  if (!canMutateTutoringWorkspace(resolved)) {
    return jsonError(
      "This tutoring workspace is read only.",
      "TUTORING_WORKSPACE_READ_ONLY",
      403,
    );
  }

  return null;
}
