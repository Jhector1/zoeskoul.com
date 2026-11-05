/** Browser-only operation polling. A trusted GET may be retried once after an
 * actual successful Zoéskoul handoff renewal. Never replay a mutating preview
 * start, dependency bootstrap, history restore, or cancellation request.
 * The retried GET still passes all normal server-side authorization and CAS
 * checks; renewal alone never confirms a preview or a saved source.
 */
export async function readPreviewOperationStatus(
  url: string,
  request: typeof fetch = fetch,
): Promise<Response> {
  const options: RequestInit = { method: "GET", credentials: "same-origin", cache: "no-store" };
  const response = await request(url, options);
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
  return request(url, options);
}
