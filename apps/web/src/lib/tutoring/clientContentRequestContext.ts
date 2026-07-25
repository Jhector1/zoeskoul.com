import { TUTORING_SESSION_HEADER } from "./contentRequestProtocol";

export type TutoringClientContentRequestContext = {
  sessionId: string;
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

/**
 * Practice/review APIs live outside the tutoring route tree, so they cannot
 * infer tutoring authorization from their own URL. Resolve the current
 * tutoring session once from the browser route and send only its opaque ID.
 *
 * Workspace ownership is intentionally not sent here. Progress/documents keep
 * using their own workspace-aware APIs; this context only authorizes access to
 * exercise definitions contained in the frozen tutoring snapshot.
 */
export function getTutoringClientContentRequestContext(
  locationLike: Pick<Location, "pathname"> | null | undefined =
    typeof window !== "undefined" ? window.location : null,
): TutoringClientContentRequestContext | null {
  const sessionId = readSessionIdFromPathname(locationLike?.pathname ?? "");
  if (!sessionId) return null;

  return {
    sessionId,
    dedupeKey: `tutoring:${sessionId}`,
  };
}

export function withTutoringContentRequestHeaders(
  headersInit?: HeadersInit,
  context = getTutoringClientContentRequestContext(),
) {
  const headers = new Headers(headersInit);
  if (context?.sessionId) {
    headers.set(TUTORING_SESSION_HEADER, context.sessionId);
  }
  return headers;
}

export function tutoringContentRequestDedupeKey() {
  return getTutoringClientContentRequestContext()?.dedupeKey ?? "standard";
}
