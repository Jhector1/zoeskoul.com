import {
  createEmptyReviewProgress,
  normalizeProgressTopics,
  normalizeReviewProgressTopicScope,
  normalizeTopicProgressKey,
  scopeReviewProgressToTopics,
  type ReviewProgressState,
} from "@zoeskoul/learning-runtime";

export type ReviewProgressPayload = {
  subjectSlug: string;
  moduleSlug: string;
  locale: string;
  moduleTopicIds?: string[];
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

export type ReviewProgressSaveArgs = {
  payload: ReviewProgressPayload;
  signal?: AbortSignal;
  endpoint?: string;
  apiOrigin?: string;
  fetchImpl?: typeof globalThis.fetch;
  keepalive?: boolean;
};

export type ReviewProgressSaveResponseData = {
  state?: ReviewProgressState;
  gamification?: any;
  [key: string]: any;
};

export type ReviewProgressSaveResult = {
  state: ReviewProgressState;
  data: ReviewProgressSaveResponseData | null;
};

export class ReviewProgressClientError extends Error {
  readonly status: number;
  readonly payload: unknown;
  readonly reason?: string;
  readonly incomingRevision?: number;
  readonly existingRevision?: number;

  constructor(args: {
    message: string;
    status: number;
    payload: unknown;
  }) {
    super(args.message);
    this.name = "ReviewProgressClientError";
    this.status = args.status;
    this.payload = args.payload;

    const record = asRecord(args.payload);
    this.reason =
      typeof record?.reason === "string"
        ? record.reason
        : undefined;
    this.incomingRevision = finiteNumber(
      record?.incomingRevision,
    );
    this.existingRevision = finiteNumber(
      record?.existingRevision,
    );
  }
}

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

function buildReviewProgressEndpointUrl(args: {
  apiOrigin?: string;
  endpoint?: string;
}): URL {
  const apiOrigin = resolveApiOrigin(args.apiOrigin);
  const endpoint =
    args.endpoint?.trim() || "/api/review/progress";
  const url = new URL(endpoint, `${apiOrigin}/`);

  if (url.origin !== apiOrigin) {
    throw new Error(
      "Cross-origin review progress endpoint overrides are not allowed.",
    );
  }

  return url;
}

function buildReviewProgressUrl(args: {
  apiOrigin?: string;
  endpoint?: string;
  subjectSlug: string;
  moduleSlug: string;
  locale: string;
}): URL {
  const url = buildReviewProgressEndpointUrl(args);

  url.searchParams.set("subjectSlug", args.subjectSlug);
  url.searchParams.set("moduleSlug", args.moduleSlug);
  url.searchParams.set("locale", args.locale);

  return url;
}

function asRecord(
  value: unknown,
): Record<string, any> | null {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Record<string, any>)
    : null;
}

function finiteNumber(
  value: unknown,
): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

async function readResponsePayload(
  response: Response,
): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readResponseErrorMessage(
  payload: unknown,
  fallback: string,
): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = asRecord(payload);
  for (const key of ["message", "error"]) {
    if (
      typeof record?.[key] === "string" &&
      record[key].trim()
    ) {
      return record[key];
    }
  }

  return fallback;
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
  moduleTopicIds?: readonly string[];
  state: ReviewProgressState;
  activeTopicId?: string;
}): ReviewProgressPayload {
  const moduleTopicIds =
    normalizeReviewProgressTopicScope(args.moduleTopicIds);

  const stateWithActiveTopic = {
    ...normalizeProgressTopics(args.state),
    ...(args.activeTopicId
      ? {
          activeTopicId: normalizeTopicProgressKey(
            args.activeTopicId,
          ),
        }
      : {}),
  };

  const state =
    moduleTopicIds.length > 0
      ? scopeReviewProgressToTopics(
          stateWithActiveTopic,
          moduleTopicIds,
        )
      : stateWithActiveTopic;

  return {
    subjectSlug: args.subjectSlug,
    moduleSlug: args.moduleSlug,
    locale: args.locale,
    ...(moduleTopicIds.length > 0
      ? { moduleTopicIds }
      : {}),
    state,
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

export async function saveReviewProgressPUT(
  args: ReviewProgressSaveArgs,
): Promise<ReviewProgressSaveResult> {
  if (args.signal?.aborted) {
    throw new DOMException(
      "Review progress save was aborted before it started.",
      "AbortError",
    );
  }

  const fetchImpl = args.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const url = buildReviewProgressEndpointUrl(args);
  const response = await fetchImpl(url, {
    method: "PUT",
    cache: "no-store",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args.payload),
    keepalive: args.keepalive === true,
    ...(args.signal ? { signal: args.signal } : {}),
  });

  const responsePayload =
    await readResponsePayload(response);

  if (!response.ok) {
    throw new ReviewProgressClientError({
      message: readResponseErrorMessage(
        responsePayload,
        response.status === 409
          ? "Review progress conflict"
          : `Progress save failed: ${response.status}`,
      ),
      status: response.status,
      payload: responsePayload,
    });
  }

  const data = asRecord(
    responsePayload,
  ) as ReviewProgressSaveResponseData | null;
  const responseState = asRecord(data?.state)
    ? (data?.state as ReviewProgressState)
    : args.payload.state;

  return {
    state: normalizeProgressTopics(responseState),
    data,
  };
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

    saveReviewProgressPUT: (
      args: Omit<
        ReviewProgressSaveArgs,
        "apiOrigin" | "fetchImpl"
      >,
    ): Promise<ReviewProgressSaveResult> => {
      return saveReviewProgressPUT({
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
