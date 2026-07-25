import {
  TUTORING_LEARNER_ID_HEADER,
  TUTORING_SESSION_HEADER,
  TUTORING_WORKSPACE_VIEW_HEADER,
  type TutoringWorkspaceView,
} from "./contentRequestProtocol";

export type TutoringClientContentRequestContext = {
  sessionId: string;
  workspaceView: TutoringWorkspaceView;
  learnerId: string | null;
  dedupeKey: string;
};

function readSessionIdFromPathname(pathname: string) {
  const match = pathname.match(/\/tutoring-sessions\/([^/?#]+)/);
  if (!match?.[1]) return null;

  try {
    return decodeURIComponent(match[1]).trim() || null;
  } catch {
    return match[1].trim() || null;
  }
}

function readWorkspaceView(search: string): TutoringWorkspaceView {
  const value = new URLSearchParams(search).get("workspace");
  return value === "master" ||
    value === "reference" ||
    value === "mine" ||
    value === "learner"
    ? value
    : "mine";
}

/**
 * Practice/review APIs live outside the tutoring route tree, so they cannot
 * infer tutoring authorization or the selected workspace from their own URL.
 * Send only the opaque session/workspace identity needed for authorization.
 */
export function getTutoringClientContentRequestContext(
  locationLike:
    | Pick<Location, "pathname" | "search">
    | null
    | undefined = typeof window !== "undefined" ? window.location : null,
): TutoringClientContentRequestContext | null {
  const sessionId = readSessionIdFromPathname(locationLike?.pathname ?? "");
  if (!sessionId) return null;

  const workspaceView = readWorkspaceView(locationLike?.search ?? "");
  const learnerId =
    workspaceView === "learner"
      ? new URLSearchParams(locationLike?.search ?? "").get("learnerId")?.trim() ||
        null
      : null;

  return {
    sessionId,
    workspaceView,
    learnerId,
    dedupeKey: `tutoring:${sessionId}:${workspaceView}:${learnerId ?? "self"}`,
  };
}

export function withTutoringContentRequestHeaders(
  headersInit?: HeadersInit,
  context = getTutoringClientContentRequestContext(),
) {
  const headers = new Headers(headersInit);
  if (context?.sessionId) {
    headers.set(TUTORING_SESSION_HEADER, context.sessionId);
    headers.set(TUTORING_WORKSPACE_VIEW_HEADER, context.workspaceView);
    if (context.learnerId) {
      headers.set(TUTORING_LEARNER_ID_HEADER, context.learnerId);
    } else {
      headers.delete(TUTORING_LEARNER_ID_HEADER);
    }
  }
  return headers;
}

export function tutoringContentRequestDedupeKey() {
  return getTutoringClientContentRequestContext()?.dedupeKey ?? "standard";
}
