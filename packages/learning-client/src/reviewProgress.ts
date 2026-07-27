import {
  createEmptyReviewProgress,
  normalizeProgressTopics,
  normalizeTopicProgressKey,
  type ReviewProgressState,
} from "@zoeskoul/learning-runtime";

export type ReviewProgressPayload = {
  subjectSlug: string;
  moduleSlug: string;
  locale: string;
  state: ReviewProgressState;
};

export type ReviewProgressFetchArgs = {
  subjectSlug: string;
  moduleSlug: string;
  locale: string;
  signal?: AbortSignal;
  endpoint?: string;
  apiOrigin?: string;
  fetchImpl?: typeof globalThis.fetch;
};

export type ReviewProgressClientOptions = {
  apiOrigin: string;
  fetchImpl?: typeof globalThis.fetch;
  endpoint?: string;
};

const reviewProgressGetInFlight =
  new Map<string, Promise<ReviewProgressState>>();

function resolveApiOrigin(value: string | undefined): string {
  const browserOrigin =
    typeof globalThis.location?.origin === "string"
      ? globalThis.location.origin
      : "http://localhost";

  return new URL(value?.trim() || browserOrigin).origin;
}

function buildReviewProgressUrl(args: {
  apiOrigin?: string;
  endpoint?: string;
  subjectSlug: string;
  moduleSlug: string;
  locale: string;
}): URL {
  const apiOrigin = resolveApiOrigin(args.apiOrigin);
  const endpoint = args.endpoint?.trim() || "/api/review/progress";
  const url = new URL(endpoint, `${apiOrigin}/`);

  if (url.origin !== apiOrigin) {
    throw new Error(
      "Cross-origin review progress endpoint overrides are not allowed.",
    );
  }

  url.searchParams.set("subjectSlug", args.subjectSlug);
  url.searchParams.set("moduleSlug", args.moduleSlug);
  url.searchParams.set("locale", args.locale);

  return url;
}

export function emptyReviewProgress(): ReviewProgressState {
  return createEmptyReviewProgress();
}

export function completedTopicKeysFromProgress(
  progress: ReviewProgressState | null | undefined,
): Set<string> {
  const completedKeys = new Set<string>();
  const topics =
    (progress?.topics ?? {}) as Record<
      string,
      Record<string, unknown> | undefined
    >;

  for (const [topicKey, topic] of Object.entries(topics)) {
    if (topic?.completed !== true) continue;
    if (topicKey) completedKeys.add(topicKey);

    for (const candidate of [
      topic.topicKey,
      topic.topicSlug,
      topic.slug,
      topic.genKey,
      topic.topicId,
      topic.id,
    ]) {
      if (candidate != null) {
        completedKeys.add(String(candidate));
      }
    }
  }

  return completedKeys;
}

export function buildReviewProgressPayload(args: {
  subjectSlug: string;
  moduleSlug: string;
  locale: string;
  state: ReviewProgressState;
  activeTopicId?: string;
}): ReviewProgressPayload {
  return {
    subjectSlug: args.subjectSlug,
    moduleSlug: args.moduleSlug,
    locale: args.locale,
    state: {
      ...normalizeProgressTopics(args.state),
      ...(args.activeTopicId
        ? {
            activeTopicId: normalizeTopicProgressKey(
              args.activeTopicId,
            ),
          }
        : {}),
    },
  };
}

export async function fetchReviewProgressGET(
  args: ReviewProgressFetchArgs,
): Promise<ReviewProgressState> {
  if (args.signal?.aborted) {
    throw new DOMException(
      "Review progress fetch was aborted before it started.",
      "AbortError",
    );
  }

  const fetchImpl = args.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const url = buildReviewProgressUrl(args);
  const requestKey = url.toString();
  const existing = reviewProgressGetInFlight.get(requestKey);
  if (existing) return existing;

  const promise = (async () => {
    /**
     * Do not pass each caller's AbortSignal into the shared GET. One cancelled
     * component must not abort the canonical request for other hydration or
     * save paths waiting on the same progress row.
     */
    const response = await fetchImpl(url, {
      method: "GET",
      cache: "no-store",
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      const error = new Error(
        message || `Progress fetch failed: ${response.status}`,
      );
      (error as Error & { status?: number }).status =
        response.status;
      throw error;
    }

    const data = await response.json().catch(() => null);
    const progress =
      data &&
      typeof data === "object" &&
      "progress" in data
        ? (data.progress as ReviewProgressState | null)
        : null;

    return normalizeProgressTopics(
      progress ?? emptyReviewProgress(),
    );
  })().finally(() => {
    reviewProgressGetInFlight.delete(requestKey);
  });

  reviewProgressGetInFlight.set(requestKey, promise);
  return promise;
}

export function createReviewProgressClient(
  options: ReviewProgressClientOptions,
) {
  return {
    fetchReviewProgressGET(
      args: Omit<
        ReviewProgressFetchArgs,
        "apiOrigin" | "fetchImpl"
      >,
    ): Promise<ReviewProgressState> {
      return fetchReviewProgressGET({
        ...args,
        endpoint: args.endpoint ?? options.endpoint,
        apiOrigin: options.apiOrigin,
        fetchImpl: options.fetchImpl,
      });
    },
  };
}

export type ReviewProgressClient = ReturnType<
  typeof createReviewProgressClient
>;
