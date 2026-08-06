type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const DEFAULT_RETRY_DELAYS_MS = [
  350,
  1_000,
] as const;

function isAbortError(error: unknown) {
  return (
    error instanceof DOMException &&
    error.name === "AbortError"
  );
}

function isTransientStatus(
  status: number | null,
) {
  if (status === null) {
    return true;
  }

  return (
    status === 401 ||
    status === 403 ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

function readErrorMessage(
  payload: unknown,
) {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }

  return "Daily Practice could not be loaded.";
}

async function waitForRetry(args: {
  delayMs: number;
  signal: AbortSignal;
}) {
  if (args.signal.aborted) {
    throw new DOMException(
      "The operation was aborted.",
      "AbortError",
    );
  }

  await new Promise<void>(
    (resolve, reject) => {
      const abort = () => {
        clearTimeout(timeoutId);
        args.signal.removeEventListener(
          "abort",
          abort,
        );
        reject(
          new DOMException(
            "The operation was aborted.",
            "AbortError",
          ),
        );
      };

      const timeoutId = setTimeout(() => {
        args.signal.removeEventListener(
          "abort",
          abort,
        );
        resolve();
      }, args.delayMs);

      args.signal.addEventListener(
        "abort",
        abort,
        { once: true },
      );
    },
  );
}

export async function loadDailyPracticePayload(args: {
  requestUrl: string;
  signal: AbortSignal;
  fetchImpl?: FetchLike;
  retryDelaysMs?: readonly number[];
}): Promise<unknown> {
  const fetchImpl =
    args.fetchImpl ??
    globalThis.fetch.bind(globalThis);
  const retryDelays =
    args.retryDelaysMs ??
    DEFAULT_RETRY_DELAYS_MS;
  let lastError =
    new Error(
      "Daily Practice could not be loaded.",
    );

  for (
    let attempt = 0;
    attempt <= retryDelays.length;
    attempt += 1
  ) {
    let responseStatus: number | null =
      null;

    try {
      const response =
        await fetchImpl(
          args.requestUrl,
          {
            credentials: "include",
            cache: "no-store",
            signal: args.signal,
            headers: {
              Accept: "application/json",
            },
          },
        );

      responseStatus = response.status;

      const payload: unknown =
        await response
          .json()
          .catch(() => null);

      if (
        response.ok &&
        payload !== null
      ) {
        return payload;
      }

      lastError = new Error(
        readErrorMessage(payload),
      );
    } catch (error: unknown) {
      if (
        args.signal.aborted ||
        isAbortError(error)
      ) {
        throw error;
      }

      if (error instanceof Error) {
        lastError = error;
      }
    }

    const hasRetry =
      attempt < retryDelays.length;

    if (
      !hasRetry ||
      !isTransientStatus(responseStatus)
    ) {
      throw lastError;
    }

    await waitForRetry({
      delayMs: retryDelays[attempt],
      signal: args.signal,
    });
  }

  throw lastError;
}
