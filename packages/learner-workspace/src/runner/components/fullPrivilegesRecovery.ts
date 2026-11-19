/** An explicit restart discards the previous disposable session; it is not a
 * transport reconnect and does not renew network authorization. */
export async function acknowledgeDisposableCancel(
  sessionId: string,
  request: typeof fetch = fetch,
): Promise<void> {
  const response = await request(`/api/run/pty/sessions/${encodeURIComponent(sessionId)}/cancel`, {
    method: "POST", credentials: "same-origin",
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok !== true) throw new Error("Previous lab cancellation could not be confirmed. Retry or contact the operator.");
}

export function disposableCloseMessage(reason: string): string {
  if (reason === "Session timed_out") return "Disposable session reached an inactivity or maximum lifetime limit. Restart creates a new lab and loses its files.";
  if (reason === "Session canceled") return "Disposable session was canceled. Restart creates a new lab.";
  if (reason === "Session failed") return "Disposable session failed. Restart creates a new lab.";
  return "Disposable terminal disconnected or ended. Restart discards the previous lab and creates a new one.";
}
