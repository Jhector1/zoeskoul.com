import "server-only";

import { ReactPreviewRequestError, parseReactPreviewId, requireOwnedReactPreviewProject } from "@/lib/build/reactPreviewServer";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { issueTrustedReactDevelopmentHmrTicketAtRunner } from "@/lib/build/reactPreviewRunnerClient";

const PREVIEW = /^preview_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TICKET = /^[A-Za-z0-9_-]{43}$/;
const TICKET_TTL_MS = 20_000;

/** An exact, deployment-configured origin, never chosen by the browser body.
 * Opaque-origin sandbox iframes are intentionally unsupported in this phase. */
export function requireConfiguredDevelopmentHmrOrigin(requestOrigin: string | null): string {
  const configured = process.env.ZOEBUILD_DEVELOPMENT_HMR_PUBLIC_ORIGIN;
  if (!configured || typeof requestOrigin !== "string" || requestOrigin !== configured ||
      configured === "null" || configured.length > 256)
    throw new ReactPreviewRequestError("BUILD_PREVIEW_UNAVAILABLE", "HMR is unavailable.", 503);
  let parsed: URL;
  try { parsed = new URL(configured); }
  catch { throw new ReactPreviewRequestError("BUILD_PREVIEW_UNAVAILABLE", "HMR is unavailable.", 503); }
  if (parsed.origin !== configured || parsed.username || parsed.password || parsed.pathname !== "/" ||
      parsed.search || parsed.hash || (parsed.protocol !== "https:" &&
      !(parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1"))))
    throw new ReactPreviewRequestError("BUILD_PREVIEW_UNAVAILABLE", "HMR is unavailable.", 503);
  return configured;
}

/** Revalidate user, tenant, stack and DB source revision immediately before
 * asking the service-authenticated Runner to mint a one-use WebSocket ticket.
 * This deliberately does not return a private Runner URL or Docker capability.
 */
export async function issueOwnedDevelopmentPreviewHmrTicket(input: Readonly<{
  access: Parameters<typeof requireOwnedReactPreviewProject>[0]["access"];
  buildProjectId: string;
  previewId: string;
  sourceVersion: number;
  requestOrigin: string | null;
}>, deps: Readonly<{
  requireProject: typeof requireOwnedReactPreviewProject;
  actorKey: typeof requireRunnerActorKey;
  runnerTicket: typeof issueTrustedReactDevelopmentHmrTicketAtRunner;
}> = {
  requireProject: requireOwnedReactPreviewProject,
  actorKey: requireRunnerActorKey,
  runnerTicket: issueTrustedReactDevelopmentHmrTicketAtRunner,
}): Promise<Readonly<{ ticket: string; expiresInMs: number }>> {
  if (process.env.ZOEBUILD_DEVELOPMENT_PREVIEW_HMR_TICKET_ENABLED !== "true")
    throw new ReactPreviewRequestError("BUILD_PREVIEW_NOT_FOUND", "HMR is unavailable.", 404);
  if (!input.access.userId)
    throw new ReactPreviewRequestError("BUILD_AUTH_REQUIRED", "Unauthorized.", 401);
  const origin = requireConfiguredDevelopmentHmrOrigin(input.requestOrigin);
  const previewId = parseReactPreviewId(input.previewId);
  if (!PREVIEW.test(previewId) || !Number.isSafeInteger(input.sourceVersion) || input.sourceVersion < 1)
    throw new ReactPreviewRequestError("BUILD_PREVIEW_INVALID", "Invalid HMR request.", 400);
  const project = await deps.requireProject({ access: input.access, buildProjectId: input.buildProjectId });
  if (project.sourceVersion !== input.sourceVersion)
    throw new ReactPreviewRequestError("BUILD_PREVIEW_SOURCE_CONFLICT", "Preview source is stale.", 409);
  const actorKey = await deps.actorKey(input.access.userId);
  const issued: unknown = await deps.runnerTicket({
    actorKey, previewId, buildProjectId: input.buildProjectId,
    sourceVersion: input.sourceVersion, origin,
  });
  if (!issued || typeof issued !== "object" || Array.isArray(issued))
    throw new ReactPreviewRequestError("BUILD_PREVIEW_UNAVAILABLE", "HMR is unavailable.", 503);
  const data = issued as Record<string, unknown>;
  // Reject unexpected upstream data rather than passing capabilities or URLs
  // through to the browser. The Runner endpoint currently returns four keys.
  if (Object.keys(data).sort().join(",") !== "expiresInMs,ok,ticket,wsPath" ||
      data.ok !== true || typeof data.ticket !== "string" || !TICKET.test(data.ticket) ||
      data.expiresInMs !== TICKET_TTL_MS ||
      data.wsPath !== `/build/previews/${previewId}/development-hmr/ws`)
    throw new ReactPreviewRequestError("BUILD_PREVIEW_UNAVAILABLE", "HMR is unavailable.", 503);
  return { ticket: data.ticket, expiresInMs: TICKET_TTL_MS };
}
