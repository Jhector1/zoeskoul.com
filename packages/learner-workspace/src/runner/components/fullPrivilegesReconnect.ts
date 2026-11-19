/** Browser-only transport helpers. No session starts or replayed input. */
export const reconnectDelaysMs = [1000, 2000, 4000, 8000] as const;
export const transportTimeoutMs = 10000;
export const heartbeatIntervalMs = 15000;
export const heartbeatDeadlineMs = 35000;
export const stableConnectionMs = 30000;

export function terminalSessionEnded(state: unknown): boolean {
  return typeof state === "string" && ["completed", "canceled", "failed", "timed_out"].includes(state);
}
export function terminalCloseIsFinal(code: number, reason: string): boolean {
  return code === 1008 || /^Session (completed|canceled|failed|timed_out|closed)$/.test(reason);
}
export function classifySequence(previous: number, incoming: unknown): "invalid" | "duplicate" | "gap" | "next" {
  if (typeof incoming !== "number" || !Number.isSafeInteger(incoming) || incoming < 1) return "invalid";
  if (incoming <= previous) return "duplicate";
  return incoming === previous + 1 ? "next" : "gap";
}
export class ReattachRejected extends Error {}
export function validatedSocketUrl(value: unknown, initial?: string): string {
  if (typeof value !== "string") throw new ReattachRejected("Invalid lab connection URL.");
  let url: URL;
  try { url = new URL(value); } catch { throw new ReattachRejected("Invalid lab connection URL."); }
  if (!["ws:", "wss:"].includes(url.protocol) || url.username || url.password || url.hash ||
      url.searchParams.getAll("token").length !== 1 || !url.searchParams.get("token")) {
    throw new ReattachRejected("Invalid lab connection URL.");
  }
  if (initial) {
    const first = new URL(initial);
    if (url.origin !== first.origin || url.pathname !== first.pathname || url.searchParams.get("token") === first.searchParams.get("token")) {
      throw new ReattachRejected("Invalid lab connection URL.");
    }
  }
  return url.toString();
}
export async function requestAdminReattach(sessionId: string, initialUrl: string, signal: AbortSignal, request: typeof fetch = fetch): Promise<string> {
  const res = await request(`/api/run/pty/sessions/${encodeURIComponent(sessionId)}/admin/reattach`, {
    method: "POST", credentials: "same-origin", cache: "no-store", signal,
  });
  if ([400,401,403,404,410].includes(res.status)) throw new ReattachRejected("The lab is no longer available for reconnection.");
  if (!res.ok) throw new Error("Lab reconnection unavailable.");
  const data = await res.json();
  if (data?.ok !== true || data.sessionId !== sessionId || !["running", "waiting_for_input"].includes(data.state)) {
    throw new ReattachRejected("Invalid lab reconnection response.");
  }
  return validatedSocketUrl(data.wsUrl, initialUrl);
}
