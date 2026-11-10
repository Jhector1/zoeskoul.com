/** Browser-only operation polling. A trusted GET may be retried once after an
 * actual successful Zoéskoul handoff renewal. Never replay a mutating preview
 * start, dependency bootstrap, history restore, or cancellation request.
 * The retried GET still passes all normal server-side authorization and CAS
 * checks; renewal alone never confirms a preview or a saved source.
 */
/**
 * WAVE3_TRANSIENT_PREVIEW_STATUS_V1
 * Retry only a GET to the same operation, after a confirmed gateway/transient
 * server response. Non-transient errors and identity failures are never retried.
 */
const TRANSIENT_STATUS_RETRY_DELAYS_MS = [350, 900] as const;

async function isTransientStatusResponse(response: Response): Promise<boolean> {
  if (response.status !== 503) return false;
  try {
    const body: unknown = await response.clone().json();
    return body !== null && typeof body === "object" &&
      (body as { code?: unknown }).code === "BUILD_PREVIEW_RUNNER_UNAVAILABLE";
  } catch {
    return false;
  }
}

async function getStatusWithBoundedRetry(
  url: string,
  request: typeof fetch,
  options: RequestInit,
): Promise<Response> {
  for (let attempt = 0; attempt <= TRANSIENT_STATUS_RETRY_DELAYS_MS.length; attempt++) {
    let response: Response;
    try {
      response = await request(url, options);
    } catch (error) {
      // A failed read does not indicate that the journaled operation failed.
      // An operation lookup is idempotent; replay only its GET, never preview start.
      if (attempt === TRANSIENT_STATUS_RETRY_DELAYS_MS.length ||
          (error instanceof Error && error.name === "AbortError")) throw error;
      await new Promise<void>(resolve =>
        setTimeout(resolve, TRANSIENT_STATUS_RETRY_DELAYS_MS[attempt]));
      continue;
    }

    if (attempt === TRANSIENT_STATUS_RETRY_DELAYS_MS.length ||
        !(await isTransientStatusResponse(response))) return response;

    await new Promise<void>(resolve =>
      setTimeout(resolve, TRANSIENT_STATUS_RETRY_DELAYS_MS[attempt]));
  }
  throw new Error("Unexpected preview status retry state.");
}

export async function readPreviewOperationStatus(
  url: string,
  request: typeof fetch = fetch,
): Promise<Response> {
  const options: RequestInit = { method: "GET", credentials: "same-origin", cache: "no-store" };
  const response = await getStatusWithBoundedRetry(url, request, options);
  if (response.status !== 401) return response;
  let renewed: Response;
  try {
    renewed = await request("/api/auth/handoff/renew", {
      method: "POST", credentials: "same-origin", cache: "no-store",
    });
    if (!renewed.ok) return response;
    const payload: unknown = await renewed.json();
    if (!payload || typeof payload !== "object" ||
        (payload as {authenticated?: unknown}).authenticated !== true) return response;
  } catch {
    return response;
  }
  // One bounded retry; a second 401 remains an auth failure.
  return getStatusWithBoundedRetry(url, request, options);
}
